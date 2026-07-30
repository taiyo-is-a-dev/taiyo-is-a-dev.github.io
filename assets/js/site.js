/**
 * Navigation, page transitions, mobile menu, and the entry point that boots
 * every effect. Loaded by every page as a single <script type="module">.
 */

import { initBgGrid, initHeroGlyph, initCursor } from './fx.js';
import { initReveal, initTilt, initMagnetic, initCounters, initTypeIn } from './motion.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── Active-section highlight + hide-on-scroll ────────────────────────
   The sliding `.nav__pill` indicator is gone along with the multi-link row it
   used to track: the bar now carries a single link, so there is nothing to
   slide between. What stays is the active-link marking (for the one link) and
   hiding the bar on scroll-down.                                          */
export function initNavSpy() {
  const nav = document.querySelector('[data-nav]');
  const links = [...document.querySelectorAll('[data-nav-link]')];

  if (nav) {
    let last = scrollY;
    let ticking = false;

    const onScroll = () => {
      const y = scrollY;
      nav.classList.toggle('nav--solid', y > 40);
      if (y > 200 && y > last + 4) nav.classList.add('nav--hidden');
      else if (y < last - 4) nav.classList.remove('nav--hidden');
      last = y;
      ticking = false;
    };

    addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScroll);
    }, { passive: true });

    onScroll();
  }

  if (!links.length) return;

  const sections = links
    .map((link) => {
      const id = link.getAttribute('href') ?? '';
      return id.startsWith('#') ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if (!sections.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const link = links.find((l) => l.getAttribute('href') === `#${entry.target.id}`);
      if (!link) continue;
      links.forEach((l) => l.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach((s) => io.observe(s));
}

/* ─── One gesture, one slide ────────────────────────────────────────────
   CSS snap alone cannot do what this does. `mandatory` guarantees you never
   rest between two slides, but it decides where to land from where the gesture
   *ends* — so a small flick (measured: 260px on a 900px slide) falls short of
   halfway and gets pulled straight back to where it started. Nothing in CSS
   makes the decision eager.

   So this takes over the wheel, and only the wheel: it converts any wheel
   gesture, however small, into a jump to the neighbouring snap position.
   Keyboard, scrollbar, touch, find-in-page and anchor links are untouched and
   still handled by native snap — which is the part a full scroll-hijack
   library would have broken.

   Only runs where the full-height slide layout is active. Every slide is
   exactly one viewport tall there (verified), so there is never in-slide
   content that this could make unreachable.                              */
export function initSlideWheel() {
  const root = document.documentElement;
  if (!root.classList.contains('slides')) return;

  const engaged = () => !reduced() && innerWidth >= 901 && innerHeight >= 600;

  /* Snap positions in document order. `.snap` sections and the project track's
     anchors are start-aligned, so their position is their offset from the top;
     the footer is end-aligned, so its position is the bottom of the document. */
  let stops = [];
  const measure = () => {
    const seen = new Set();
    stops = [...document.querySelectorAll('.snap, .pjtrack__anchor')]
      .map((el) => Math.round(el.getBoundingClientRect().top + scrollY))
      .concat([Math.round(root.scrollHeight - innerHeight)])
      .filter((y) => y >= 0 && !seen.has(y) && seen.add(y))
      .sort((a, b) => a - b);
  };

  let lockedUntil = 0;

  addEventListener('wheel', (e) => {
    // Zoom, modified gestures and horizontal scrolling are not ours.
    if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    if (Math.abs(e.deltaY) < 4 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (!engaged()) return;

    const now = performance.now();
    // A trackpad sends a long tail of decaying deltas after one flick; the lock
    // is what keeps that tail from walking through three slides.
    if (now < lockedUntil) {
      e.preventDefault();
      return;
    }

    if (!stops.length) measure();

    const here = scrollY;
    const dir = e.deltaY > 0 ? 1 : -1;
    // Nearest stop to where we are, then step one along.
    let i = 0;
    for (let k = 1; k < stops.length; k += 1) {
      if (Math.abs(stops[k] - here) < Math.abs(stops[i] - here)) i = k;
    }
    const next = stops[i + dir];
    if (next === undefined) return;   // at either end: let the page behave normally

    e.preventDefault();
    lockedUntil = now + 620;
    scrollTo({ top: next, behavior: 'smooth' });
  }, { passive: false });

  measure();
  addEventListener('resize', debounceLocal(measure, 180));
  addEventListener('load', measure);
}

/* Small local debounce so this module does not reach into fx.js internals. */
function debounceLocal(fn, ms) {
  let id = 0;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/* ─── Horizontal project track ─────────────────────────────────────────
   Turns downward scroll progress through a tall section into sideways
   movement of the panels inside its sticky stage. All this does is write one
   custom property, `--p` (0 → 1); the transform lives in CSS. Scrolling is
   never intercepted, so the scrollbar, keyboard, and find-in-page behave
   normally — only the painting goes sideways.

   Below 760px or with reduced motion the CSS keeps the panels stacked, so
   this bails out and leaves `--p` unset.                                  */
export function initProjectTrack() {
  const track = document.querySelector('[data-pjtrack]');
  const row = track?.querySelector('[data-pjrow]');
  if (!track || !row) return;

  const dots = [...(track.querySelector('[data-pjdots]')?.children ?? [])];
  const anchors = [...track.querySelectorAll('.pjtrack__anchor')];
  const horizontal = () => !reduced() && innerWidth >= 760;

  let ticking = false;

  const update = () => {
    ticking = false;

    if (!horizontal() || anchors.length < 2) {
      row.style.removeProperty('--p');
      return;
    }

    /* Progress is measured against the anchors themselves, not the section
       top. It has to be: `html` carries `scroll-padding-top` for the fixed
       nav, so `scroll-snap-align:start` parks an anchor at that padding line
       rather than at y=0. Reading the anchors makes the maths self-correcting
       — change the padding, or the number of panels, and this still lands
       each panel exactly in frame. */
    const padTop = Number.parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    ) || 0;

    const firstTop = anchors[0].getBoundingClientRect().top;
    const lastTop = anchors[anchors.length - 1].getBoundingClientRect().top;
    const total = lastTop - firstTop;   // constant: the track's travel distance

    // 0 when the first anchor sits on the padding line, 1 when the last does.
    const p = total > 0
      ? Math.min(1, Math.max(0, (padTop - firstTop) / total))
      : 0;

    row.style.setProperty('--p', p.toFixed(4));

    if (dots.length) {
      const active = Math.min(dots.length - 1, Math.round(p * (dots.length - 1)));
      dots.forEach((d, i) => d.classList.toggle('is-on', i === active));
    }
  };

  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  addEventListener('resize', update);
  update();
}

/* ─── Page transition wipe ───────────────────────────────────────────── */
export function initPageFx() {
  const wipe = document.querySelector('.page-wipe');
  if (!wipe) return;

  // Play the panel out on arrival, including back/forward cache restores.
  const playIn = () => {
    wipe.classList.remove('is-out');
    wipe.classList.add('is-in');
    setTimeout(() => wipe.classList.remove('is-in'), 700);
  };
  addEventListener('pageshow', playIn);

  if (reduced()) return;

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target instanceof Element ? e.target.closest('[data-page-link]') : null;
    if (!link || link.target === '_blank') return;

    const href = link.getAttribute('href');
    if (!href) return;

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;

    e.preventDefault();
    wipe.classList.remove('is-in');
    wipe.classList.add('is-out');

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      location.href = url.href;
    };
    wipe.addEventListener('transitionend', go, { once: true });
    setTimeout(go, 600);
  });
}

/* `initMobileMenu()` lived here. It drove the burger drawer, which every page
   has now dropped in favour of the slim bar — three items fit a 320px screen
   without hiding anything, so there is nothing left to toggle. Deleted rather
   than kept dormant: a function that silently bails is the kind of thing that
   later gets read as still in use. */

/* ─── Boot ───────────────────────────────────────────────────────────
   Each module is isolated: a broken effect must never take navigation
   down with it.                                                      */
function boot() {
  // The inline head script armed a failsafe that force-shows revealed
  // content if this module never got here. It did, so disarm it.
  clearTimeout(window.__taiyoFailsafe);

  const modules = [
    initBgGrid, initHeroGlyph, initCursor,
    initReveal, initTilt, initMagnetic, initCounters, initTypeIn,
    initNavSpy, initSlideWheel, initProjectTrack, initPageFx,
  ];
  for (const init of modules) {
    try {
      init();
    } catch (err) {
      console.error(`${init.name} failed`, err);
    }
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
