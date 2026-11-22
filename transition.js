const smokeOverlay = document.querySelector('.smoke-transition');
const smokeStorageKey = 'wonderland.smoke-transition';
const reduceSmokeMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (document.documentElement.classList.contains('smoke-arriving')) {
  try {
    sessionStorage.removeItem(smokeStorageKey);
  } catch {
    // 无法访问存储时仍继续清除转场遮罩。
  }

  window.setTimeout(() => {
    document.documentElement.classList.remove('smoke-arriving');
    smokeOverlay.classList.add('is-clearing');
    window.setTimeout(() => {
      smokeOverlay.classList.remove('is-clearing');
      smokeOverlay.classList.add('is-finished');
    }, reduceSmokeMotion ? 0 : 900);
  }, reduceSmokeMotion ? 0 : 80);
}

document.querySelectorAll('[data-smoke-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      link.classList.contains('is-locked') ||
      link.getAttribute('aria-disabled') === 'true' ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (document.body.classList.contains('is-smoke-leaving')) return;
    document.body.classList.add('is-smoke-leaving');

    try {
      sessionStorage.setItem(smokeStorageKey, 'arrive');
    } catch {
      // 目标页没有存储标记时会直接显示。
    }

    smokeOverlay.classList.remove('is-finished');
    smokeOverlay.classList.add('is-active');
    window.setTimeout(() => window.location.assign(link.href), reduceSmokeMotion ? 0 : 800);
  });
});
