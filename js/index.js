/* ==========================================================================
   index.js — 首页：画面上金色星点的随机闪烁 + 启程按钮
   ========================================================================== */

/* 由封面图逐像素检测出的金色星点（x/y 为画面内百分比，r 为实测星芒半径）
   检测条件：中心偏暖且高亮、四周为暗部夜空，因此月亮与岛屿本体不会被当成星星点亮 */
const STARS = [
  { x:  3.91, y:  8.59, r: 11 },  { x: 36.66, y:  3.81, r: 11 },
  { x: 52.79, y:  5.57, r:  7 },  { x: 67.41, y:  3.71, r:  7 },
  { x: 79.74, y:  4.49, r:  6 },  { x: 45.98, y: 18.46, r:  6 },
  { x: 56.75, y: 17.29, r:  6 },  { x: 70.81, y: 10.94, r:  6 },
  { x: 68.81, y: 10.06, r:  9 },  { x: 82.42, y: 16.99, r:  6 },
  { x: 86.27, y: 14.84, r:  6 },  { x: 49.39, y: 25.20, r:  6 },
  { x: 92.63, y: 26.37, r:  7 },  { x: 89.01, y: 27.25, r:  6 },
  { x: 96.65, y: 29.88, r: 10 },  { x: 98.72, y: 35.55, r:  7 },
  { x: 49.94, y: 68.75, r:  9 },  { x: 98.27, y: 68.65, r:  9 },
  { x: 85.16, y: 76.66, r:  9 },  { x: 57.31, y: 81.84, r:  9 },
  { x: 58.31, y: 83.69, r:  6 },  { x: 47.10, y: 84.67, r:  6 },
  { x: 60.83, y: 84.86, r:  6 },  { x:  9.26, y: 86.43, r:  6 },
  { x: 93.08, y: 84.08, r:  6 },  { x: 44.81, y: 93.26, r:  6 },
  { x: 55.58, y: 94.53, r:  6 },  { x: 46.93, y: 95.80, r:  7 }
];

/* 少量额外的微弱星屑，只落在左侧夜空的开放区域，避开标题文字带 */
const DUST_COUNT = 12;

const layer = document.getElementById('stars');

function makeStar({ x, y, r, o }) {
  const el = document.createElement('i');
  el.className = 'star';
  el.style.left = x + '%';
  el.style.top = y + '%';
  el.style.setProperty('--w', (r * 0.5).toFixed(2) + 'vh');      // 光晕直径随画面高度缩放
  el.style.setProperty('--o', o.toFixed(2));
  el.style.setProperty('--dur', (2.6 + Math.random() * 2.8).toFixed(2) + 's');
  el.style.setProperty('--delay', (-Math.random() * 6).toFixed(2) + 's');
  layer.appendChild(el);
}

STARS.forEach(s => makeStar({ ...s, o: Math.min(1, 0.45 + s.r * 0.045) }));

for (let i = 0; i < DUST_COUNT; i++) {
  makeStar({
    x: 1.5 + Math.random() * 42,
    y: Math.random() < 0.5 ? 4 + Math.random() * 20 : 76 + Math.random() * 19,
    r: 3 + Math.random() * 3,
    o: 0.3 + Math.random() * 0.2
  });
}

/* --------------------------------------------------------------------------
   点击 · 开始旅程 → map.html
   -------------------------------------------------------------------------- */
const btn = document.getElementById('startBtn');
const curtain = document.getElementById('curtain');
let leaving = false;

function goToMap() {
  if (leaving) return;
  leaving = true;
  curtain.classList.add('is-on');
  setTimeout(() => { window.location.href = 'map.html'; }, 760);
}

btn.addEventListener('click', (e) => { e.preventDefault(); goToMap(); });

window.addEventListener('keydown', (e) => {
  if (!leaving && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    goToMap();
  }
});
