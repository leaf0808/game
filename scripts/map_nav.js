const fireflyField = document.querySelector('#firefly-field');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reduceMotion.matches) {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 20; index += 1) {
    const firefly = document.createElement('span');
    const randomDrift = () => Math.round(Math.random() * 180 - 90);

    firefly.className = 'firefly';
    firefly.style.setProperty('--start-x', `${Math.random() * 100}vw`);
    firefly.style.setProperty('--start-y', `${Math.random() * 100}vh`);
    firefly.style.setProperty('--drift-x', `${randomDrift()}px`);
    firefly.style.setProperty('--drift-y', `${randomDrift()}px`);
    firefly.style.setProperty('--drift-x-two', `${randomDrift()}px`);
    firefly.style.setProperty('--drift-y-two', `${randomDrift()}px`);
    firefly.style.setProperty('--size', `${(Math.random() * 2.4 + 1.8).toFixed(1)}px`);
    firefly.style.setProperty('--duration', `${(Math.random() * 8 + 9).toFixed(1)}s`);
    firefly.style.setProperty('--delay', `${(Math.random() * -16).toFixed(1)}s`);
    fragment.appendChild(firefly);
  }

  fireflyField.appendChild(fragment);
}
