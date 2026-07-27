/**
 * Scroll- and pointer-driven motion. Like fx.js, every export is a no-op
 * when its nodes are missing or the environment asks for less motion.
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth < 900;
const coarse = () => matchMedia('(pointer: coarse)').matches;

/* ─── Reveal on scroll ───────────────────────────────────────────────── */
export function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const delay = Number(el.dataset.revealDelay) || 0;
      el.style.transitionDelay = `${delay * 90}ms`;
      el.classList.add('is-in');
      io.unobserve(el);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el) => io.observe(el));
}

/* ─── 3D tilt ─────────────────────────────────────────────────────────
   One delegated listener rather than one per card. Writes --mx/--my for
   the CSS highlight and --tx/--ty for the hero canvas to read.        */
export function initTilt() {
  if (reduced() || narrow() || coarse()) return;
  if (!document.querySelector('[data-tilt]')) return;

  let active = null;

  document.addEventListener('pointermove', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-tilt]') : null;

    if (el !== active && active) reset(active);
    active = el;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const tx = (e.clientX - r.left) / r.width - 0.5;
    const ty = (e.clientY - r.top) / r.height - 0.5;

    el.style.setProperty('--mx', `${((tx + 0.5) * 100).toFixed(2)}%`);
    el.style.setProperty('--my', `${((ty + 0.5) * 100).toFixed(2)}%`);
    el.style.setProperty('--tx', tx.toFixed(4));
    el.style.setProperty('--ty', ty.toFixed(4));
    el.style.transition = 'transform .12s linear';
    el.style.transform =
      `perspective(900px) rotateX(${(-ty * 7).toFixed(2)}deg) rotateY(${(tx * 9).toFixed(2)}deg)`;
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    if (active) reset(active);
    active = null;
  }, { passive: true });

  function reset(el) {
    el.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
    el.style.transform = '';
    el.style.setProperty('--tx', '0');
    el.style.setProperty('--ty', '0');
  }
}

/* ─── Magnetic buttons ───────────────────────────────────────────────── */
export function initMagnetic() {
  const items = document.querySelectorAll('[data-magnetic]');
  if (!items.length || reduced() || narrow() || coarse()) return;

  const RADIUS = 80;
  const PULL = 0.28;
  const MAX = 12;

  addEventListener('pointermove', (e) => {
    for (const el of items) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const inside = Math.abs(dx) < r.width / 2 + RADIUS && Math.abs(dy) < r.height / 2 + RADIUS;

      if (inside) {
        const mx = Math.max(-MAX, Math.min(MAX, dx * PULL));
        const my = Math.max(-MAX, Math.min(MAX, dy * PULL));
        el.style.transition = 'transform .18s linear';
        el.style.transform = `translate3d(${mx.toFixed(1)}px,${my.toFixed(1)}px,0)`;
      } else if (el.style.transform) {
        el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
      }
    }
  }, { passive: true });
}

/* ─── Counters ───────────────────────────────────────────────────────── */
export function initCounters() {
  const items = document.querySelectorAll('[data-counter]');
  if (!items.length) return;

  const write = (el) => { el.textContent = String(Number(el.dataset.counter) || 0); };

  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach(write);
    return;
  }

  const DURATION = 1400;
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);

      // The markup ships the final number so it survives a JS failure;
      // only zero it once we know the animation is about to run.
      const target = Number(el.dataset.counter) || 0;
      el.textContent = '0';
      const start = performance.now();

      const step = (now) => {
        const p = Math.min(1, (now - start) / DURATION);
        el.textContent = String(Math.round(target * easeOutExpo(p)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.5 });

  items.forEach((el) => io.observe(el));
}

/* ─── Type-in headline ───────────────────────────────────────────────
   Splits into per-character spans. The wrapper keeps an aria-label so a
   screen reader still reads one sentence, not one letter at a time.   */
export function initTypeIn() {
  const items = document.querySelectorAll('[data-type-in]');
  if (!items.length || reduced()) return;

  let offset = 0;

  for (const el of items) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';

    const frag = document.createDocumentFragment();
    for (const char of text) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = char === ' ' ? ' ' : char;
      span.style.setProperty('--i', String(offset));
      frag.append(span);
      offset += 1;
    }
    el.append(frag);
    offset += 3; // a beat between lines
  }
}
