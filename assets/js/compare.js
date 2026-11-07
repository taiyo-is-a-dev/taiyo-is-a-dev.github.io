/* Before/after frame on the school site case. Kept out of site.js because only
   two pages have one. The input drives --pos; a single sweep on first sight
   shows that the line moves, and it stops the moment the visitor touches it. */
const motionOk = matchMedia('(prefers-reduced-motion: no-preference)').matches;

for (const frame of document.querySelectorAll('[data-compare]')) {
  const input = frame.querySelector('input');
  const set = (v) => frame.style.setProperty('--pos', `${v}%`);
  let touched = false;

  input.addEventListener('input', () => { touched = true; set(input.value); });

  if (!motionOk) continue;
  const seen = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.disconnect();
    const from = 82;
    const to = 50;
    const start = performance.now();
    const step = (now) => {
      if (touched) return;
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - (1 - t) ** 4;
      const v = from + (to - from) * eased;
      set(v);
      input.value = String(Math.round(v));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.45 });
  seen.observe(frame);
}
