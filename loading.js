const mapImage = document.querySelector('#map-image');
const journey = document.querySelector('.journey');

function revealMap() {
  mapImage.classList.add('is-loaded');
  journey.classList.add('is-ready');
}

if (mapImage.complete && mapImage.naturalWidth > 0) {
  revealMap();
} else {
  mapImage.addEventListener('load', revealMap, { once: true });
}
