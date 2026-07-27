/**
 * Canvas and pointer effects: background lattice, hero wireframe, custom cursor.
 * Every export is safe to call on any page — each one bails out when its
 * nodes are absent, motion is reduced, or the viewport is too small.
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth < 900;
const coarse = () => matchMedia('(pointer: coarse)').matches;

/** Size a canvas to its CSS box at up to 2x DPR and return a scaled context. */
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: width, h: height };
}

/** requestAnimationFrame loop that pauses while the tab is hidden. */
function loop(draw) {
  let raf = 0;
  let running = true;
  const tick = (t) => {
    draw(t);
    if (running) raf = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  });
  raf = requestAnimationFrame(tick);
}

function debounce(fn, ms) {
  let id = 0;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/* ─── Background lattice ─────────────────────────────────────────────────
   A grid of dots. Near the pointer they lean toward it and their links
   light up, so the page reads as a surface that responds to you.        */
export function initBgGrid() {
  const canvas = document.getElementById('bg-grid');
  if (!canvas || reduced()) return;

  const RADIUS = 170;
  let ctx;
  let w;
  let h;
  let cols = 0;
  let rows = 0;
  let gap = 0;
  let pts = [];

  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

  function build() {
    ({ ctx, w, h } = fit(canvas));
    gap = narrow() ? 52 : 38;
    cols = Math.ceil(w / gap) + 1;
    rows = Math.ceil(h / gap) + 1;
    pts = new Array(cols * rows);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const ox = c * gap;
        const oy = r * gap;
        pts[r * cols + c] = { ox, oy, x: ox, y: oy };
      }
    }
  }

  function draw() {
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const dx = pointer.x - p.ox;
      const dy = pointer.y - p.oy;
      const d = Math.hypot(dx, dy);

      if (d < RADIUS && d > 0.001) {
        const pull = (1 - d / RADIUS) ** 2 * 26;
        p.x += (p.ox + (dx / d) * pull - p.x) * 0.14;
        p.y += (p.oy + (dy / d) * pull - p.y) * 0.14;
      } else {
        p.x += (p.ox - p.x) * 0.08;
        p.y += (p.oy - p.y) * 0.08;
      }

      const near = d < RADIUS ? 1 - d / RADIUS : 0;
      ctx.fillStyle = near > 0
        ? `rgba(110,231,135,${0.12 + near * 0.65})`
        : 'rgba(232,242,236,0.11)';
      const s = 1.3 + near * 1.1;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    // Links are drawn only around the pointer — cheap, and it is the only
    // place they read as a web rather than as noise.
    ctx.lineWidth = 1;
    const c0 = Math.max(0, Math.floor((pointer.x - RADIUS) / gap));
    const c1 = Math.min(cols - 1, Math.ceil((pointer.x + RADIUS) / gap));
    const r0 = Math.max(0, Math.floor((pointer.y - RADIUS) / gap));
    const r1 = Math.min(rows - 1, Math.ceil((pointer.y + RADIUS) / gap));

    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const p = pts[r * cols + c];
        if (!p) continue;
        const near = 1 - Math.min(1, Math.hypot(pointer.x - p.ox, pointer.y - p.oy) / RADIUS);
        if (near <= 0.02) continue;
        ctx.strokeStyle = `rgba(87,199,92,${near * 0.34})`;
        const right = c < cols - 1 ? pts[r * cols + c + 1] : null;
        const below = r < rows - 1 ? pts[(r + 1) * cols + c] : null;
        ctx.beginPath();
        if (right) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(right.x, right.y);
        }
        if (below) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(below.x, below.y);
        }
        ctx.stroke();
      }
    }
  }

  build();
  addEventListener('resize', debounce(build, 150));
  addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
  }, { passive: true });
  addEventListener('pointerleave', () => {
    pointer.tx = -9999;
    pointer.ty = -9999;
  }, { passive: true });

  loop(draw);
}

/* ─── Hero wireframe ─────────────────────────────────────────────────────
   Icosahedron, projected by hand. Twelve vertices from the golden ratio,
   thirty edges, one perspective divide — no 3D library involved.        */
const PHI = (1 + Math.sqrt(5)) / 2;

const VERTS = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const EDGES = [
  [0, 1], [0, 5], [0, 7], [0, 10], [0, 11], [1, 5], [1, 7], [1, 8], [1, 9], [2, 3],
  [2, 4], [2, 6], [2, 10], [2, 11], [3, 4], [3, 6], [3, 8], [3, 9], [4, 5], [4, 9],
  [4, 11], [5, 9], [5, 11], [6, 7], [6, 8], [6, 10], [7, 8], [7, 10], [8, 9], [10, 11],
];

export function initHeroPoly() {
  const canvas = document.getElementById('hero-poly');
  if (!canvas) return;

  const card = canvas.closest('[data-tilt]') ?? canvas.parentElement;
  let ctx;
  let w;
  let h;

  const size = () => {
    ({ ctx, w, h } = fit(canvas));
  };

  const projected = new Array(VERTS.length);

  function render(t) {
    const yaw = t * 0.00022 + (Number.parseFloat(card?.style.getPropertyValue('--tx')) || 0) * 0.55;
    const pitch = t * 0.00014 + (Number.parseFloat(card?.style.getPropertyValue('--ty')) || 0) * 0.45;

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);

    const scale = Math.min(w, h) * 0.165;
    const ox = w / 2;
    const oy = h / 2;

    for (let i = 0; i < VERTS.length; i += 1) {
      const [vx, vy, vz] = VERTS[i];
      const x1 = vx * cy + vz * sy;
      const z1 = vz * cy - vx * sy;
      const y2 = vy * cx - z1 * sx;
      const z2 = z1 * cx + vy * sx;
      const f = 6 / (6 + z2);
      projected[i] = { x: ox + x1 * f * scale, y: oy + y2 * f * scale, f };
    }

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < EDGES.length; i += 1) {
      const a = projected[EDGES[i][0]];
      const b = projected[EDGES[i][1]];
      const depth = (a.f + b.f) / 2;
      ctx.strokeStyle = `rgba(110,231,135,${0.16 + (depth - 0.74) * 1.3})`;
      ctx.lineWidth = 0.5 + Math.max(0, depth - 0.75) * 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let i = 0; i < projected.length; i += 1) {
      const p = projected[i];
      ctx.fillStyle = `rgba(232,242,236,${0.14 + Math.max(0, p.f - 0.78) * 1.1})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1 + Math.max(0, p.f - 0.9) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  size();
  addEventListener('resize', debounce(() => {
    size();
    if (reduced()) render(0);
  }, 150));

  if (reduced()) {
    render(0);
    return;
  }
  loop(render);
}

/* ─── Custom cursor ──────────────────────────────────────────────────── */
export function initCursor() {
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;

  if (reduced() || narrow() || coarse()) return;
  document.body.classList.add('cursor-fx');

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;

  addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
    dot.style.transform = `translate3d(${x}px,${y}px,0)`;
  }, { passive: true });

  addEventListener('pointerover', (e) => {
    const hot = e.target instanceof Element
      && e.target.closest('a,button,[data-tilt],input,textarea');
    ring.classList.toggle('is-hot', Boolean(hot));
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('pointerenter', () => {
    dot.style.opacity = '';
    ring.style.opacity = '';
  });

  loop(() => {
    rx += (x - rx) * 0.14;
    ry += (y - ry) * 0.14;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
  });
}
