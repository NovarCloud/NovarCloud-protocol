// MOTION — damped-spring solver and the scroll / pointer behaviours built on it.
export const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true, addEventListener() {} };
export const isReduced = () => reducedQuery.matches;

// Semi-implicit Euler on a fixed 1/120 s step: x'' = (-k(x - to) - c x') / m
export function spring({ from = 0, to = 1, stiffness = 170, damping = 20, mass = 1, precision = 0.0008, onUpdate, onDone }) {
  if (isReduced()) {
    onUpdate(to);
    onDone && onDone();
    return () => {};
  }
  let x = from, v = 0, acc = 0, raf = 0, last = performance.now();
  const dt = 1 / 120;
  const step = (now) => {
    acc += Math.min(0.064, (now - last) / 1000);
    last = now;
    while (acc >= dt) {
      v += ((-stiffness * (x - to) - damping * v) / mass) * dt;
      x += v * dt;
      acc -= dt;
    }
    if (Math.abs(x - to) < precision && Math.abs(v) < precision) {
      onUpdate(to);
      onDone && onDone();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// Scroll-reveal with stagger: elements inside a [data-stagger] parent enter 70 ms apart.
export function initReveal() {
  const items = [...document.querySelectorAll('[data-reveal]')];
  const show = (el, delay) => {
    el.classList.add('revealed');
    if (isReduced()) {
      el.style.opacity = '';
      el.style.transform = '';
      return;
    }
    const dir = Number(el.dataset.slide || 0);
    const dist = Number(el.dataset.lift || 34);
    const from = Number(el.dataset.scale || 1);
    const lift = (p) => {
      el.style.opacity = String(Math.max(0, Math.min(1, p)));
      const sc = from === 1 ? '' : ` scale(${(from + (1 - from) * p).toFixed(4)})`;
      el.style.transform = (dir ? `translateX(${(1 - p) * 60 * dir}px)` : `translateY(${(1 - p) * dist}px)`) + sc;
    };
    lift(0);
    setTimeout(() => spring({ stiffness: 150, damping: 17, onUpdate: lift, onDone: () => { el.style.opacity = ''; el.style.transform = ''; } }), delay);
  };
  if (isReduced() || !('IntersectionObserver' in window)) return items.forEach((el) => show(el, 0));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const parent = e.target.closest('[data-stagger]');
      const idx = parent ? [...parent.children].indexOf(e.target) : 0;
      show(e.target, Math.max(0, idx) * 70);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
}

export function initScrollChrome() {
  const bar = document.getElementById('progress');
  const top = document.getElementById('top');
  const hero = document.querySelector('[data-hero]');
  let queued = false;
  const frame = () => {
    queued = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    if (top) y > 8 ? top.setAttribute('data-scrolled', '') : top.removeAttribute('data-scrolled');
    if (hero && !isReduced()) hero.style.setProperty('--hp', String(Math.min(1, y / (hero.offsetHeight * 0.7))));
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  frame();
  if (top && 'ResizeObserver' in window) {
    const set = () => document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
    new ResizeObserver(set).observe(top);
    set();
  }
}

// Hero parallax: pointer + scroll, smoothed toward target each frame while the hero is on screen.
export function initParallax() {
  const hero = document.querySelector('[data-hero]');
  if (!hero || isReduced()) return;
  const layers = [...hero.querySelectorAll('[data-depth]')];
  const t = { x: 0, y: 0 }, c = { x: 0, y: 0 };
  let visible = true, raf = 0;
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    t.x = (e.clientX - r.left) / r.width - 0.5;
    t.y = (e.clientY - r.top) / r.height - 0.5;
  });
  hero.addEventListener('pointerleave', () => { t.x = 0; t.y = 0; });
  const loop = () => {
    c.x += (t.x - c.x) * 0.08;
    c.y += (t.y - c.y) * 0.08;
    const s = Math.min(window.scrollY, hero.offsetHeight);
    for (const el of layers) {
      const d = Number(el.dataset.depth);
      el.style.transform = `translate3d(${(-c.x * d * 60).toFixed(2)}px, ${(-c.y * d * 60 + s * d * 0.22).toFixed(2)}px, 0)`;
    }
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(hero);
  raf = requestAnimationFrame(loop);
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px');
    el.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

export function countTo(el, from, to, format, onDir) {
  if (from == null || to == null || from === to || isReduced()) { el.textContent = format(to); return; }
  if (onDir) onDir(to > from ? 'up' : 'dn');
  spring({ from, to, stiffness: 120, damping: 22, precision: Math.abs(to - from) * 0.001 + 1e-12, onUpdate: (v) => { el.textContent = format(v); } , onDone: () => { el.textContent = format(to); } });
}
