import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import aliceGlb from '../../assets/models/alice.glb';
import caterpillarGlb from '../../assets/models/caterpillar.glb';
import mushroomGlb from '../../assets/models/mushroom.glb';
import cottageGlb from '../../assets/models/duchess_house.glb';
import { clamp, damp, wait } from './lib.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { buildWorld, LAYOUT } from './world.js';
import { Player, SIZE_LINES } from './player.js';
import { Pigeon } from './pigeon.js';
import { runStory, REPLAY_TITLES } from './story.js';

const root = document.getElementById('roam-root');
const $ = (id) => document.getElementById(id);

const g = {
  flags: {
    caterpillar_met: false, verse_passed: false, mushroom_control: false, mushroom_side_known: false,
    trial_cleared: false, nine_inch: false, spores: [], bites: 0, easter_egg: false, gallery: false,
  },
  items: { potion: true, cake: true },
  lock: 0,
  paused: false,
  checkpoint: null,
  replays: {},
};

// ---------- 渲染 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
root.appendChild(renderer.domElement);

g.renderer = renderer;
g.scene = new THREE.Scene();
g.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.08, 220);
g.audio = new Audio();
g.ui = new UI();
g.ui.audio = g.audio;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  g.camera.aspect = window.innerWidth / window.innerHeight;
  g.camera.updateProjectionMatrix();
});

g.canMove = () => g.lock === 0 && !g.ui.blocking && !g.paused;
g.lockInput = () => { g.lock = 1; };
g.unlockInput = () => { g.lock = 0; };

// ---------- 输入 ----------
const keys = new Set();
g.input = {
  forward: () => (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
  strafe: () => (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
};

// ---------- 相机：第三人称环绕，距离随体型变化（S04） ----------
g.cam = {
  yaw: 0, pitch: 0.3, zoom: 1,
  dist: 6, target: new THREE.Vector3(), pos: new THREE.Vector3(0, 3, 33),
  override: null, overrideBlend: 0,
  setOverride(pos, look) { this.override = { pos, look }; },
  clearOverride() { this.override = null; },
  update(dt) {
    const pl = g.player;
    const focus = pl.focus(this.target);
    const wantDist = (2.9 + 2.9 * pl.vis) * this.zoom;
    this.dist = damp(this.dist, wantDist, 4, dt);
    this.overrideBlend = damp(this.overrideBlend, this.override ? 1 : 0, 2.6, dt);
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.dist);
    const followPos = focus.clone().add(off);
    followPos.y = Math.max(followPos.y, 0.25);
    avoidObstacles(focus, followPos);
    const blend = this.overrideBlend;
    const p = this.override ? followPos.lerp(this.override.pos, blend) : followPos;
    const look = this.override ? focus.lerp(this.override.look, blend) : focus;
    const k = this.override ? 1 - Math.exp(-5 * dt) : 1 - Math.exp(-14 * dt);
    this.pos.lerp(p, k);
    g.camera.position.copy(this.pos);
    g.camera.lookAt(look);
    this.look = look;
  },
};
g.cam.look = new THREE.Vector3();

// 相机避让：绕开树干；被高台挡住视线时抬高
function avoidObstacles(focus, pos) {
  g.world.trees.forEach((t) => {
    if (pos.y > t.h) return;
    const dx = pos.x - t.x, dz = pos.z - t.z;
    const d = Math.hypot(dx, dz);
    const min = t.r + 0.35;
    if (d < min) {
      const k = d > 0.001 ? min / d : 1;
      pos.x = t.x + (d > 0.001 ? dx * k : min);
      pos.z = t.z + dz * k;
    }
  });
  const l = LAYOUT.ledge;
  const lateral = pos.x > l.minX - 0.6 && pos.x < l.maxX + 0.6;
  const behind = (pos.z > l.maxZ && focus.z < l.minZ) || (pos.z < l.minZ && focus.z > l.maxZ);
  if (lateral && behind) {
    const edge = pos.z > l.maxZ ? l.maxZ : l.minZ;
    const span = pos.z - focus.z;
    const need = focus.y + (l.top + 0.35 - focus.y) * (span / (edge - focus.z));
    pos.y = Math.max(pos.y, need);
  } else if (lateral && pos.z > l.minZ - 0.4 && pos.z < l.maxZ + 0.4 && pos.y < l.top + 0.35) pos.y = l.top + 0.35;
}

// ---------- 加载 ----------
const toBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loadGlb = (bytes) => new Promise((resolve, reject) => new GLTFLoader().parse(toBuffer(bytes), '', resolve, reject));

async function boot() {
  $('boot-status').textContent = '正在走进森林…';
  const [alice, caterpillar, mushroom, cottage] = await Promise.all([loadGlb(aliceGlb), loadGlb(caterpillarGlb), loadGlb(mushroomGlb), loadGlb(cottageGlb)]);
  g.models = { alice: alice.scene, caterpillar: caterpillar.scene, mushroom: mushroom.scene, cottage: cottage.scene };
  g.player = new Player(g, g.models.alice);
  g.effects = new Effects(g);
  g.world = buildWorld(g);
  g.pigeon = new Pigeon(g);
  setupHotspots();
  setupInput();
  $('boot-status').textContent = '森林已就绪。';
  const start = $('boot-start');
  start.disabled = false;
  start.textContent = '走进蘑菇森林';
  start.addEventListener('click', () => {
    g.audio.unlock();
    g.ui.hide('boot');
    ['hud', 'hud-items'].forEach((id) => $(id).hidden = false);
    refreshHud();
    g.ui.hint('跟着小径往前走，前面好像有谁在抽烟。');
    runStory(g).catch((error) => console.error(error));
  });
  const frame = () => { loop(); window.requestAnimationFrame(frame); };
  window.requestAnimationFrame(frame);
}

function refreshHud() {
  g.ui.size(g.player);
  g.ui.items(g.items);
  g.ui.spores(g.flags.spores.length, LAYOUT.spores.length);
  g.ui.galleryUnlocked(g.flags.gallery);
}

// ---------- 交互点 ----------
const hotspots = [];
const v = new THREE.Vector3();

function addHotspot(h) {
  hotspots.push(h);
  return h;
}

const UP = new THREE.Vector3(0, 1, 0);
function hotspotPosition(h) {
  if (!h.mushroom) return h.pos();
  const m = h.mushroom;
  const local = (h.side === 'left' ? m.left : m.right).clone().applyAxisAngle(UP, m.rotY);
  return v.set(m.x, 0, m.z).add(local);
}

function setupHotspots() {
  const mkSprite = (color, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.world.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    s.scale.setScalar(size);
    s.visible = false;
    g.scene.add(s);
    return s;
  };

  // 蘑菇：左（暖金）长高 / 右（冷蓝）变矮
  g.world.mushrooms.forEach((m) => {
    ['left', 'right'].forEach((side) => {
      const h = addHotspot({
        kind: 'bite', mushroom: m, side,
        sprite: mkSprite(side === 'left' ? 0xf0b860 : 0x7fd0ea, m.giant ? 0.55 : 0.26),
        radius: m.giant ? 2.6 : 1.15,
        cooldownUntil: 0,
        enabled: () => !m.giant || g.flags.caterpillar_gone,
        label: () => {
          if (performance.now() < h.cooldownUntil) return null;
          return g.flags.mushroom_side_known ? (side === 'left' ? '咬左侧 · 长高' : '咬右侧 · 变矮') : `咬一口${side === 'left' ? '左' : '右'}边`;
        },
        use: () => bite(m, side),
      });
    });
  });

  // 毛毛虫：点击吐烟圈（FN01）
  addHotspot({
    kind: 'click', sprite: null, radius: 0,
    enabled: () => g.world.caterpillar.visible,
    label: () => null,
    pos: () => g.world.caterpillarHead,
    use: () => {
      g.audio.play('smoke');
      for (let i = 0; i < 3; i += 1) setTimeout(() => g.effects.smoke(g.world.caterpillarHead, { size: 0.9 + i * 0.25 }), i * 260);
    },
  });

  // 藤蔓：Big / 长脖子攀爬
  addHotspot({
    kind: 'use', sprite: mkSprite(0xa8e0a0, 0.4), radius: 1.5,
    pos: () => v.set(LAYOUT.vine.x, 1.0, LAYOUT.vine.z + 0.1),
    enabled: () => g.flags.mushroom_control && g.player.pos.y < 1,
    label: () => (g.player.sizeIndex >= 3 ? '抓住藤蔓爬上去' : null),
    use: () => climbVine(),
    deny: () => g.player.sizeIndex < 3 && g.ui.hint('够不到藤蔓……这个高度，需要变得更高大才行。', { once: 'vine-short' }),
  });

  // 从高台顺藤蔓滑下
  addHotspot({
    kind: 'use', sprite: mkSprite(0xa8e0a0, 0.4), radius: 1.6,
    pos: () => v.set(LAYOUT.ledge.minX + 0.2, LAYOUT.ledge.top + 1.0, LAYOUT.ledge.minZ + 0.6),
    enabled: () => g.player.pos.y > LAYOUT.ledge.top - 0.3,
    label: () => '顺着藤蔓滑下去',
    use: () => slideDown(),
  });

  // 路牌：微调到九英寸
  addHotspot({
    kind: 'use', sprite: mkSprite(0xfff0b0, 0.4), radius: 2.2,
    pos: () => v.set(LAYOUT.sign.x, 1.2, LAYOUT.sign.z + 0.3),
    enabled: () => g.flags.trial_cleared && !g.player.nineInch,
    label: () => '调整身高',
    use: () => toNineInches(),
  });
}

function updateHotspots(t) {
  let best = null, bestD = Infinity;
  hotspots.forEach((h) => {
    const en = h.enabled();
    const lbl = en ? h.label() : null;
    const on = en && (h.kind === 'use' || lbl !== null);
    const p = hotspotPosition(h);
    if (h.sprite) {
      h.sprite.position.copy(p);
      h.sprite.visible = on && lbl !== null;
      if (on) h.sprite.material.opacity = 0.6 + Math.sin(t * 4) * 0.25;
    }
    if (!on || h.kind === 'click') return;
    const dx = g.player.pos.x - p.x, dz = g.player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < h.radius && dist < bestD) { best = h; bestD = dist; }
  });
  g.activeHotspot = best;
  g.ui.prompt(best && best.label() && g.canMove() ? best.label() : null);
}

// 屏幕空间拾取：点击毛毛虫 / 蘑菇
function pick(ndcX, ndcY) {
  let best = null, bestPx = 48;
  hotspots.forEach((h) => {
    if (!h.enabled() || (h.sprite && !h.sprite.visible)) return;
    const p = h.kind === 'click' ? h.pos() : h.sprite.position;
    v.copy(p).project(g.camera);
    if (v.z > 1) return;
    const px = Math.hypot((v.x - ndcX) * window.innerWidth / 2, (v.y - ndcY) * window.innerHeight / 2);
    if (px < bestPx) { best = h; bestPx = px; }
  });
  return best;
}

// ---------- 蘑菇机制（MU） ----------
let lastBite = 0;
function bite(m, side) {
  const now = performance.now();
  if (now < lastBite + 450) return;
  const h = hotspots.find((s) => s.mushroom === m && s.side === side);
  if (now < h.cooldownUntil) return;
  lastBite = now;
  const pl = g.player;
  const dir = side === 'left' ? 1 : -1;
  const prev = pl.sizeIndex;
  if (!pl.setSize(prev + dir)) return;
  g.flags.bites += 1;
  // MU06：咬过的地方 3 秒后长出新的碎块
  h.cooldownUntil = now + 3000;
  hotspots.filter((s) => s.mushroom === m && s !== h).forEach((s) => { s.cooldownUntil = now; });
  g.effects.wobble(m.obj, m.giant ? 1 : 0.8);
  g.effects.burst(hotspotPosition(h).clone(), side === 'left' ? 0xf0b860 : 0x7fd0ea, { count: 16, speed: 1.3, size: 0.14 });
  g.audio.play('bite');
  g.tutorialBite?.(side, prev, pl.sizeIndex);
  if (g.flags.bites === 12 && !g.flags.easter_egg) {
    g.flags.easter_egg = true;
    g.ui.callout('毛毛虫大概从没数过自己被咬了多少口……不过我数了。', headAnchor(), 3600);
    g.effects.smiley(new THREE.Vector3(pl.pos.x, 2.6 + pl.pos.y, pl.pos.z - 1.2));
  }
}

function headAnchor() {
  return new THREE.Vector3(g.player.pos.x, g.player.pos.y + 0.978 * g.player.vis + 0.15, g.player.pos.z);
}

g.onSizeChanged = (prev, next) => {
  g.audio.play(next > prev ? 'grow' : 'shrink');
  const key = g.player.def.key;
  g.ui.size(g.player);
  g.ui.callout(SIZE_LINES[key], headAnchor(), 2400);
  refreshHud();
};

// ---------- 藤蔓 / 九英寸 ----------
async function climbVine() {
  if (g.player.sizeIndex < 3) return;
  g.lockInput();
  g.player.auto = null;
  const pl = g.player;
  pl.flying = true;
  pl.climbing = 'up';
  const from = pl.pos.clone();
  const to = new THREE.Vector3(LAYOUT.ledge.minX + 0.5, LAYOUT.ledge.top, LAYOUT.vine.z);
  pl.heading = Math.atan2(to.x - from.x, to.z - from.z);
  for (let k = 0; k <= 1; k += 0.011) {
    pl.pos.lerpVectors(from, to, k);
    pl.pos.y = from.y + (to.y - from.y) * k;
    await wait(16);
  }
  pl.flying = false;
  pl.climbing = null;
  if (g.player.sizeIndex === 4) g.ui.hint('长脖子像蛇一样卷住藤蔓，“嗖”地一下就上去了。');
  pl.velY = 0;
  g.unlockInput();
}

async function slideDown() {
  g.lockInput();
  const pl = g.player;
  pl.flying = true;
  pl.climbing = 'down';
  const from = pl.pos.clone();
  const to = new THREE.Vector3(LAYOUT.vine.x, 0, LAYOUT.vine.z + 0.2);
  pl.heading = Math.atan2(to.x - from.x, to.z - from.z);
  for (let k = 0; k <= 1; k += 0.02) {
    pl.pos.lerpVectors(from, to, k);
    pl.pos.y = from.y + (to.y - from.y) * (k * k);
    await wait(16);
  }
  pl.flying = false;
  pl.climbing = null;
  pl.velY = 0;
  g.unlockInput();
}

async function toNineInches() {
  g.lockInput();
  g.player.nineInch = true;
  g.flags.nine_inch = true;
  g.audio.play('shrink');
  g.ui.callout(SIZE_LINES.nine, headAnchor(), 3200);
  g.ui.size(g.player);
  g.ui.toast('九英寸，正好不会吓到人。');
  g.unlockInput();
}

// 矮门洞：Normal 提示，Big 硬挤卡住 3 秒（TR01 / TR02）
g.onTunnelBlocked = () => {
  if (!g.canMove() || g.stuckUntil > performance.now()) return;
  const pl = g.player;
  if (pl.sizeIndex >= 3) {
    g.stuckUntil = performance.now() + 6000;
    stuckCutscene();
  } else g.ui.hint('这扇门太小，需要想办法变小。', { once: 'tunnel-small' });
};

async function stuckCutscene() {
  g.lockInput();
  const pl = g.player;
  const start = pl.pos.clone();
  g.audio.play('wrong');
  g.ui.callout('我卡住了！这可不是什么漂亮的姿势。', headAnchor(), 3000);
  for (let i = 0; i < 3; i += 1) {
    pl.obj.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    pl.pos.z = start.z - 0.18 - i * 0.03;
    await wait(1000);
  }
  pl.obj.rotation.z = 0;
  pl.pos.z = start.z + 0.9;
  g.effects.burst(headAnchor(), 0xd9c7a0, { count: 10, speed: 1, size: 0.12 });
  g.unlockInput();
}

// ---------- 鸽子命中 ----------
g.onPigeonHit = async () => {
  if (g.paused) return;
  g.paused = true;
  g.audio.play('screech');
  const choice = await g.ui.fail('你被鸽子当成了蛇！');
  g.paused = false;
  if (choice === 'checkpoint') respawn();
};

function respawn() {
  const cp = g.checkpoint;
  if (!cp) return;
  Object.assign(g.flags, cp.flags);
  g.items = { ...cp.items };
  g.player.setSize(2, { silent: true });
  g.player.nineInch = false;
  g.player.pos.set(cp.x, 0, cp.z);
  g.player.velY = 0;
  g.player.vis = 1;
  g.pigeon.reset();
  g.world.gateOpen = false;
  g.world.spores.forEach((s) => {
    s.taken = cp.flags.spores.includes(s.index);
    s.group.visible = !s.taken;
  });
  refreshHud();
}

function saveAt(index) {
  const s = g.world.saves[index];
  s.active = true;
  g.checkpoint = { x: s.x + 0.2, z: s.z + 0.6, flags: { ...g.flags, spores: [...g.flags.spores] }, items: { potion: true, cake: true } };
  g.items = { potion: true, cake: true };
  g.player.nineInch = false;
  if (g.player.sizeIndex !== 2) g.player.setSize(2, { silent: true });
  g.audio.play('save');
  g.ui.toast('已存档 · 体型回到正常');
  refreshHud();
}
g.saveAt = saveAt;

// ---------- 输入绑定 ----------
function setupInput() {
  const canvas = renderer.domElement;
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    g.cam.yaw -= dx * 0.0055;
    g.cam.pitch = clamp(g.cam.pitch + dy * 0.004, 0.05, 1.15);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved > 6 || !g.canMove()) return;
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    const h = pick(ndcX, ndcY);
    if (!h) return;
    if (h.kind === 'click') return h.use();
    if (h.kind === 'bite') {
      const near = Math.hypot(g.player.pos.x - h.sprite.position.x, g.player.pos.z - h.sprite.position.z) < h.radius;
      return near ? h.use() : g.clickMushroom?.(h.mushroom);
    }
    const near = Math.hypot(g.player.pos.x - h.sprite.position.x, g.player.pos.z - h.sprite.position.z) < h.radius;
    if (!near) return;
    if (h.label()) return h.use();
    h.deny?.();
  });
  canvas.addEventListener('wheel', (e) => { g.cam.zoom = clamp(g.cam.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.55, 1.7); e.preventDefault(); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Escape') return togglePause();
    if (g.ui.shown.has('dialogue') && ['KeyE', 'Space', 'Enter'].includes(e.code)) {
      e.preventDefault();
      return g.ui.pending?.();
    }
    if (['KeyE', 'Space'].includes(e.code) && g.activeHotspot && g.canMove()) {
      e.preventDefault();
      const h = g.activeHotspot;
      return h.label() ? h.use() : h.deny?.();
    }
    if (e.code === 'Space' && g.canMove()) {
      e.preventDefault();
      g.player.jump();
    }
    if (e.code === 'Digit1' && g.canMove()) useItem('potion');
    if (e.code === 'Digit2' && g.canMove()) useItem('cake');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  $('dialogue').addEventListener('click', () => { if (!g.ui.pending) g.advanceChoice?.(); else g.ui.pending(); });
  $('hint-close').addEventListener('click', () => g.ui.hide('hint'));
  document.querySelectorAll('.slot').forEach((el) => el.addEventListener('click', () => useItem(el.dataset.item)));

  $('btn-pause').addEventListener('click', togglePause);
  $('pause-resume').addEventListener('click', togglePause);
  $('pause-help').addEventListener('click', () => { $('pause-help-text').hidden = !$('pause-help-text').hidden; });
  $('btn-replay').addEventListener('click', () => openReplay(false));
  $('pause-replay').addEventListener('click', () => { g.ui.hide('pause'); openReplay(true); });
  $('replay-close').addEventListener('click', () => { g.ui.hide('replay'); if (g.replayFromPause) togglePause(); });
  $('replay-back').addEventListener('click', () => { $('replay-lines').replaceChildren(); $('replay-back').hidden = true; });
  $('btn-gallery').addEventListener('click', () => { if (!g.flags.gallery) return; g.ui.show('gallery'); });
  $('gallery-close').addEventListener('click', () => g.ui.hide('gallery'));
}

function togglePause() {
  if (g.ui.shown.has('boot') || g.ui.shown.has('ending') || g.ui.shown.has('fail')) return;
  if (g.ui.shown.has('replay')) { g.ui.hide('replay'); if (g.replayFromPause) return; }
  if (g.ui.shown.has('gallery')) return g.ui.hide('gallery');
  const on = !g.ui.shown.has('pause');
  if (on) g.ui.show('pause'); else g.ui.hide('pause');
}

function useItem(name) {
  if (!g.items[name] || g.lock) return;
  const target = name === 'potion' ? 1 : 3;
  if (g.player.sizeIndex === target && !g.player.nineInch) return;
  g.items[name] = false;
  g.player.setSize(target);
  g.ui.toast(name === 'potion' ? '喝我药水：缩成了 Small。' : '吃我蛋糕：长成了 Big。');
  refreshHud();
}

// ---------- 剧情回看（FN06 / RV01–RV02） ----------
function openReplay(fromPause) {
  g.replayFromPause = fromPause;
  const list = $('replay-list');
  list.replaceChildren();
  $('replay-lines').replaceChildren();
  $('replay-back').hidden = true;
  Object.entries(REPLAY_TITLES).forEach(([id, title]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = title;
    const unlocked = !!g.replays[id];
    b.classList.toggle('is-locked', !unlocked);
    b.addEventListener('click', () => {
      if (!unlocked) return;
      $('replay-lines').replaceChildren();
      g.replays[id].forEach(({ speaker, zh, en }) => {
        const p = document.createElement('p');
        const name = document.createElement('b');
        name.textContent = speaker;
        p.appendChild(name);
        p.appendChild(document.createTextNode(zh));
        if (en) { const i = document.createElement('i'); i.textContent = ` ${en}`; p.appendChild(i); }
        $('replay-lines').appendChild(p);
      });
      $('replay-back').hidden = false;
    });
    list.appendChild(b);
  });
  g.ui.show('replay');
}

// ---------- 主循环 ----------
const timer = new THREE.Timer();
let smokeTimer = 0;

function loop() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  if (!g.paused) {
    g.player.update(dt);
    g.pigeon.update(dt, t);
    g.world.update(dt, t);
    g.effects.update(dt, t);
    updateHotspots(t);
    collectSpores(dt);
    // 毛毛虫的水烟：每隔几秒吐一口烟圈
    smokeTimer += dt;
    if (smokeTimer > 2.6 && g.world.caterpillar.visible) {
      smokeTimer = 0;
      g.effects.smoke(g.world.caterpillarHead, { size: 0.55 });
      g.effects.smoke(g.world.hookahTop, { size: 0.35, rise: 0.5 });
    }
    g.storyTick?.(t, dt);
  }
  g.cam.update(dt);
  g.ui.updateCallout((anchor) => {
    v.copy(anchor).project(g.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  });
  renderer.render(g.scene, g.camera);
}

// 孢子：走近自动拾取，鼠标悬停高亮（FN04）
function collectSpores(dt) {
  const pl = g.player;
  g.world.spores.forEach((s) => {
    if (s.taken) return;
    const d = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z);
    s.hover = damp(s.hover, g.hoveredSpore === s ? 1 : 0, 8, dt);
    s.group.scale.setScalar(1 + s.hover * 0.5);
    if (d < 0.9 && g.canMove()) {
      s.taken = true;
      s.group.visible = false;
      g.flags.spores.push(s.index);
      g.audio.play('spore');
      g.effects.burst(s.group.position, 0xffe08a, { count: 16, speed: 1.2, size: 0.14, gravity: 0.6 });
      g.ui.spores(g.flags.spores.length, LAYOUT.spores.length);
      if (g.flags.spores.length === LAYOUT.spores.length) {
        g.flags.gallery = true;
        g.ui.galleryUnlocked(true);
        g.audio.play('ding');
        g.ui.toast('集齐 5 枚孢子！图鉴解锁「毛毛虫三视图」', 4200);
      } else g.ui.toast(`拾取孢子（${g.flags.spores.length}/${LAYOUT.spores.length}）`);
    }
  });
}

// 鼠标悬停孢子高亮
window.addEventListener('pointermove', (e) => {
  const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  g.hoveredSpore = g.world?.spores.find((s) => {
    if (s.taken) return false;
    v.copy(s.group.position).project(g.camera);
    return Math.hypot((v.x - ndcX) * window.innerWidth / 2, (v.y - ndcY) * window.innerHeight / 2) < 26;
  }) || null;
});

boot().catch((error) => {
  console.error(error);
  $('boot-status').textContent = `加载失败：${error.message}`;
});
