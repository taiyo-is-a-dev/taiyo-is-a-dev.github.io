/**
 * Navigation, page transitions, mobile menu, and the entry point that boots
 * every effect. Loaded by every page as a single <script type="module">.
 */

import { initBgGrid, initHeroGlyph, initCursor } from './fx.js';
import { initReveal, initTilt, initMagnetic, initCounters, initTypeIn } from './motion.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── Active-section highlight + hide-on-scroll ──────────────────────── */
export function initNavSpy() {
  const nav = document.querySelector('[data-nav]');
  const links = [...document.querySelectorAll('[data-nav-link]')];
  const pill = document.querySelector('.nav__pill');

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

  const movePill = (link) => {
    if (!pill || innerWidth < 900) return;
    pill.style.left = `${link.offsetLeft}px`;
    pill.style.width = `${link.offsetWidth}px`;
    pill.classList.add('is-on');
  };

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
      movePill(link);
    }
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach((s) => io.observe(s));

  addEventListener('resize', () => {
    const current = links.find((l) => l.getAttribute('aria-current') === 'true');
    if (current) movePill(current);
    else pill?.classList.remove('is-on');
  });
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

/* ─── Mobile menu ────────────────────────────────────────────────────── */
export function initMobileMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
    document.body.style.overflow = open ? 'hidden' : '';
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) setOpen(false);
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  addEventListener('resize', () => {
    if (innerWidth >= 900) setOpen(false);
  });
}

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
    initNavSpy, initPageFx, initMobileMenu,
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
