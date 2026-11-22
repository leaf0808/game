(() => {
  const sceneOrder = ['rabbit_hole', 'caterpillar_tree', 'duchess_cottage'];
  const storageKey = 'wonderland.completed-scenes';
  const completed = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) {
      saved.filter((scene) => sceneOrder.includes(scene)).forEach((scene) => completed.add(scene));
    }
  } catch {
    // 本地进度不可读时，从首关重新开始。
  }

  function isUnlocked(scene) {
    const index = sceneOrder.indexOf(scene);
    return index === 0 || (index > 0 && completed.has(sceneOrder[index - 1]));
  }

  function applyMapState() {
    document.querySelectorAll('.hotspot[data-scene]').forEach((hotspot) => {
      const unlocked = isUnlocked(hotspot.dataset.scene);
      hotspot.classList.toggle('is-locked', !unlocked);

      if (unlocked) {
        hotspot.removeAttribute('aria-disabled');
        hotspot.removeAttribute('tabindex');
        hotspot.setAttribute('aria-label', hotspot.dataset.unlockedLabel);
      } else {
        hotspot.setAttribute('aria-disabled', 'true');
        hotspot.setAttribute('tabindex', '-1');
        hotspot.setAttribute('aria-label', `未解锁：${hotspot.dataset.unlockedLabel}`);
      }
    });
  }

  function completeScene(scene) {
    if (!sceneOrder.includes(scene)) return;

    completed.add(scene);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...completed]));
    } catch {
      return;
    }
    applyMapState();
  }

  window.WonderlandProgress = { completeScene, isUnlocked };

  document.querySelectorAll('.hotspot[data-scene]').forEach((hotspot) => {
    hotspot.dataset.unlockedLabel = hotspot.getAttribute('aria-label');
    hotspot.addEventListener('click', (event) => {
      if (hotspot.classList.contains('is-locked')) event.preventDefault();
    });
  });

  applyMapState();
  window.addEventListener('pageshow', applyMapState);
})();
