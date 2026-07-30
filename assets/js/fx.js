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

/* ─── Hero glyph ─────────────────────────────────────────────────────────
   `</>` as a solid slab of dots, rotated and projected by hand.

   The shape is not hand-plotted: the glyph is drawn once into an offscreen
   canvas, its pixels are read, and every filled sample becomes a dot. So the
   form comes from the typeface itself — change SYMBOL or the font and the
   object rebuilds. Each dot gets a random z inside a slab, which is what
   gives the object thickness when it turns.

   No 3D library, and none is wanted: the site self-hosts everything and the
   test suite rejects external hosts. Two rotation matrices and one
   perspective divide are enough.                                          */
const SYMBOL = '</>';

/** Read a glyph's filled pixels into points centred on the origin. */
function sampleGlyph(text, w, h, step, pad) {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(w));
  off.height = Math.max(1, Math.round(h));
  const g = off.getContext('2d');
  const font = (px) => `800 ${px}px Unbounded, system-ui, sans-serif`;

  // Fit by the glyph's real ink box, not a guessed fraction of the height —
  // otherwise the shape overflows and we sample a cropped fragment.
  const probe = 100;
  g.font = font(probe);
  const m = g.measureText(text);
  const inkH = (m.actualBoundingBoxAscent || probe * 0.7)
    + (m.actualBoundingBoxDescent || probe * 0.2);
  const size = Math.max(
    12,
    Math.floor(probe * Math.min((off.width - pad * 2) / m.width, (off.height - pad * 2) / inkH)),
  );

  g.font = font(size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, off.width / 2, off.height / 2);

  const { data } = g.getImageData(0, 0, off.width, off.height);
  const pts = [];
  for (let y = 0; y < off.height; y += step) {
    for (let x = 0; x < off.width; x += step) {
      if (data[(y * off.width + x) * 4 + 3] > 130) {
        pts.push([x - off.width / 2, y - off.height / 2]);
      }
    }
  }
  return pts;
}

export function initHeroGlyph() {
  const canvas = document.getElementById('hero-glyph');
  if (!canvas) return;

  const DEPTH = 46;      // slab thickness in model units
  const FOCAL = 520;     // perspective distance
  const PUSH = 92;       // cursor influence radius, px

  let ctx;
  let w;
  let h;
  let pts = [];
  let ry = 0;
  let rx = 0;
  const order = [];
  /* nx/ny are the pointer in -1..1 across the canvas. The object reads them
     directly rather than borrowing data-tilt's --tx/--ty: tilt also applies a
     CSS rotate to its element, which would skew the canvas itself now that the
     glyph floats without a card around it. */
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, on: false };

  function size() {
    ({ ctx, w, h } = fit(canvas));
    // Denser on roomy cards, sparser on small ones — the dot count drives cost.
    const step = w < 300 ? 4 : 3;
    pts = sampleGlyph(SYMBOL, w, h, step, Math.max(18, w * 0.09)).map(([x, y]) => ({
      bx: x,
      by: y,
      bz: (Math.random() - 0.5) * DEPTH,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      r: 0.8 + Math.random() * 0.7,
      ph: Math.random() * Math.PI * 2,
    }));
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.nx = (pointer.x / r.width) * 2 - 1;
    pointer.ny = (pointer.y / r.height) * 2 - 1;
    pointer.on = true;
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    pointer.on = false;
    pointer.nx = 0;
    pointer.ny = 0;
  });

  function render(t) {
    const still = reduced();
    const ms = t * 0.001;

    // Aim: turn toward the pointer, and drift slowly when nobody is hovering
    // so the object never looks frozen.
    const aimY = pointer.on ? pointer.nx * 0.62 : Math.sin(ms * 0.22) * 0.42;
    const aimX = pointer.on ? -pointer.ny * 0.40 : Math.sin(ms * 0.17) * 0.14;

    if (still) {
      ry = 0.36;
      rx = 0.1;
    } else {
      ry += (aimY - ry) * 0.06;
      rx += (aimX - rx) * 0.06;
    }

    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);

    order.length = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const breathe = still ? 0 : Math.sin(ms * 1.2 + p.ph) * 1.4;

      const x1 = p.bx * cy + p.bz * sy;
      const z1 = p.bz * cy - p.bx * sy;
      const yy = p.by + breathe;
      const y2 = yy * cx - z1 * sx;
      const z2 = z1 * cx + yy * sx;

      const f = FOCAL / (FOCAL + z2);
      const px = w / 2 + x1 * f;
      const py = h / 2 + y2 * f;

      if (!still) {
        if (pointer.on) {
          const dx = px + p.ox - pointer.x;
          const dy = py + p.oy - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < PUSH) {
            const k = (1 - d / PUSH) * 4.4;
            p.vx += (dx / d) * k;
            p.vy += (dy / d) * k;
          }
        }
        p.vx = (p.vx - p.ox * 0.12) * 0.82;
        p.vy = (p.vy - p.oy * 0.12) * 0.82;
        p.ox += p.vx;
        p.oy += p.vy;
      } else {
        p.ox = 0;
        p.oy = 0;
      }

      order.push({ x: px + p.ox, y: py + p.oy, f, r: p.r });
    }

    // Painter's algorithm: far dots first, so near ones overlap them.
    order.sort((a, b) => a.f - b.f);

    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < order.length; i += 1) {
      const d = order[i];
      const depth = Math.max(0, Math.min(1, (d.f - 0.78) / 0.44));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (0.55 + depth * 0.95), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${87 + depth * 23},${199 + depth * 32},${92 + depth * 43},${0.16 + depth * 0.82})`;
      ctx.fill();
    }
  }

  /* The glyph is measured from the font, so sampling before Unbounded loads
     would fit the shape to fallback metrics and leave it the wrong size. */
  const start = () => {
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
  };

  if (document.fonts?.load) {
    document.fonts.load(`800 100px Unbounded`, SYMBOL).then(start, start);
  } else {
    start();
  }
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
