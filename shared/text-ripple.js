const rippleShell = document.querySelector('.scene-shell');
const reduceRippleMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (rippleShell && !reduceRippleMotion) {
  const rippleTargets = rippleShell.querySelectorAll(
    '.scene-topbar > span, .scene-eyebrow, .scene-copy h1, .scene-english-title, .scene-description, .scene-quote'
  );
  const characters = [];
  let pointerX = -1000;
  let pointerY = -1000;
  let pointerActive = false;
  let animationFrame = null;

  rippleTargets.forEach((target) => {
    const text = target.textContent;
    const tokens = text.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*|\s+|./gu) || [];
    const fragment = document.createDocumentFragment();

    target.textContent = '';
    target.setAttribute('aria-label', text.trim());

    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) {
        fragment.appendChild(document.createTextNode(token));
        return;
      }

      const word = document.createElement('span');
      word.className = 'ripple-word';
      word.setAttribute('aria-hidden', 'true');

      for (const letter of token) {
        const character = document.createElement('span');
        character.className = 'ripple-char';
        character.textContent = letter;
        word.appendChild(character);
        characters.push({ element: character, x: 0, y: 0, near: false });
      }

      fragment.appendChild(word);
    });

    target.appendChild(fragment);
  });

  function cacheCharacterPositions() {
    characters.forEach((character) => {
      const bounds = character.element.getBoundingClientRect();
      character.x = bounds.left + bounds.width / 2;
      character.y = bounds.top + bounds.height / 2;
    });
  }

  function resetCharacter(character) {
    character.element.style.transform = '';
    character.element.style.filter = '';
    character.element.classList.remove('is-near');
    character.near = false;
  }

  function renderRipple(time) {
    const radius = Math.max(72, Math.min(125, window.innerWidth * 0.09));

    characters.forEach((character) => {
      const deltaX = pointerX - character.x;
      const deltaY = pointerY - character.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < radius) {
        const strength = 1 - distance / radius;
        const phase = distance * 0.085 - time * 0.011;
        const wave = Math.sin(phase);
        const moveX = Math.cos(phase) * 2.5 * strength;
        const moveY = wave * 8 * strength;
        const rotation = wave * 2.4 * strength;

        character.element.style.transform = `translate(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg)`;
        character.element.style.filter = 'url(#nearby-water)';
        character.element.classList.add('is-near');
        character.near = true;
      } else if (character.near) {
        resetCharacter(character);
      }
    });

    animationFrame = pointerActive ? window.requestAnimationFrame(renderRipple) : null;
  }

  rippleShell.addEventListener('pointerenter', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerActive = true;
    cacheCharacterPositions();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    renderRipple(performance.now());
  });

  rippleShell.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });

  rippleShell.addEventListener('pointerleave', () => {
    pointerActive = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    characters.forEach(resetCharacter);
  });

  window.addEventListener('resize', cacheCharacterPositions);
  window.addEventListener('scroll', cacheCharacterPositions, { passive: true });
  document.fonts.ready.then(cacheCharacterPositions);
}
