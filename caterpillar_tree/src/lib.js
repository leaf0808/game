import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 360) + 360) % 360 / 360, s / 100, l / 100);

export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function vary(color, rnd, dh = 10, ds = 8, dl = 8) {
  const h = {};
  color.getHSL(h);
  return hsl(h.h * 360 + (rnd() - 0.5) * 2 * dh, h.s * 100 + (rnd() - 0.5) * 2 * ds, h.l * 100 + (rnd() - 0.5) * 2 * dl);
}

const fract = (v) => v - Math.floor(v);
const hash2 = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);

export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function labelTexture(lines, { width = 512, height = 192, bg = '#f1e3c3', fg = '#3b342b', font = 'bold 64px "Songti SC", SimSun, Georgia, serif', border = '#8a6b3f' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const list = Array.isArray(lines) ? lines : [lines];
  list.forEach((line, index) => ctx.fillText(line, width / 2, (height / (list.length + 1)) * (index + 1)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function sprite(texture, color, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(scale);
  return s;
}
