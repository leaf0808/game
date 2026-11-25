import * as THREE from 'three';
import { clamp, damp } from './lib.js';

const DECL = /* glsl */ `
uniform float uPhase;
uniform float uMove;
uniform float uSway;
uniform float uAir;
uniform float uClimb;
uniform float uSlide;
uniform float uClimbPhase;
uniform float uTime;
uniform float uLift;
uniform vec2 uLag;
attribute float aArm;
`;

// 坐标均为模型原始单位：脚底 y=0，头顶 y≈0.98，面朝 +Z。
const BODY = /* glsl */ `
{
  float side = position.x >= 0.0 ? 1.0 : -1.0;
  float opp = step(side, -0.5) * 3.14159265;
  float up = max(uAir, 0.0), down = max(-uAir, 0.0);
  float free = 1.0 - uClimb - uSlide;
  float legW = 1.0 - smoothstep(0.10, 0.19, position.y);
  float armW = aArm * (1.0 - smoothstep(0.74, 0.79, position.y));
  float skW = (1.0 - smoothstep(0.36, 0.56, position.y)) * smoothstep(0.15, 0.19, position.y) * (1.0 - legW) * (1.0 - armW);

  // 腿：绕髋前后摆，左腿相位在 0，右腿在 π
  if (legW > 0.0) {
    float a = uMove * free * sin(uPhase + opp) * 0.55
      + uClimb * sin(uClimbPhase + opp) * 0.5 + uSlide * 0.3 + (0.25 * up - 0.08 * down) * free;
    vec3 q = transformed - vec3(0.0, 0.17, 0.0);
    float c = cos(a), s = sin(a);
    q.yz = vec2(q.y * c - q.z * s, q.y * s + q.z * c);
    transformed = mix(transformed, q + vec3(0.0, 0.17, 0.0), legW);
  }
  // 手臂：与同侧腿反相摆动；攀爬时交替上举抓藤蔓
  if (armW > 0.0) {
    float a = -uMove * free * sin(uPhase + opp) * 0.35
      + uClimb * (-2.3 + 0.4 * sin(uClimbPhase + opp)) - uSlide * 2.9 - (0.9 * up + 0.4 * down) * free;
    float b = side * (0.3 * up + 0.5 * down) * free;
    vec3 p = vec3(side * 0.11, 0.75, 0.0);
    vec3 q = transformed - p;
    float c = cos(a), s = sin(a);
    q.yz = vec2(q.y * c - q.z * s, q.y * s + q.z * c);
    c = cos(b); s = sin(b);
    q.xy = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    transformed = mix(transformed, q + p, armW);
  }
  // 裙摆：腰部固定，整片绕腰口向外倾（刚体旋转，叠层褶皱不会互相穿插）。
  // 拖尾 + 髋部摆动 + 行走褶皱 + 上升下坠 / 下落上扬 + 落地回弹
  if (skW > 0.0) {
    vec2 rad = transformed.xz;
    float r = length(rad);
    vec2 dir = r > 1e-5 ? rad / r : vec2(side, 0.0);
    float ang = atan(dir.y, dir.x);
    float tilt = 0.04 * uMove - 0.04 * up + 0.22 * down + 0.12 * uClimb + 0.22 * uSlide + 4.0 * uLift
      + 0.03 * uMove * sin(ang * 3.0 + uPhase) + 0.02 * sin(uTime * 2.2 + ang * 3.0 + position.y * 9.0)
      + 0.035 * (up + down) * sin(uTime * 11.0 + ang * 2.0);
    float depth = 0.56 - transformed.y;
    float c = cos(tilt), s = sin(tilt);
    vec2 off = uLag + vec2(uSway * 0.02 + (uClimb + uSlide) * sin(uClimbPhase) * 0.025, 0.0);
    transformed.xz = mix(rad, dir * (r * c + depth * s), skW) + off * skW;
    transformed.y = mix(transformed.y, transformed.y + depth * (1.0 - c) + r * s, skW);
  }
}
`;

// 从前臂沿网格邻接扩散，只会走到手臂和手，不会串到贴着的裙摆上。
function tagArms(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const n = pos.count;
  const index = geo.index ? geo.index.array : null;
  const adj = new Array(n);
  for (let i = 0; i < n; i++) adj[i] = [];
  const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (let t = 0; t < (index ? index.length : n); t += 3) {
    const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
    link(a, b); link(b, c); link(c, a);
  }
  const x = (i) => pos.getX(i), y = (i) => pos.getY(i), z = (i) => pos.getZ(i);
  const inZone = (i) => Math.abs(x(i)) > 0.1 && y(i) > 0.38 && y(i) < 0.74 && z(i) > -0.09;
  const arm = new Float32Array(n);
  const stack = [];
  for (let i = 0; i < n; i++) if (inZone(i) && y(i) > 0.57 && y(i) < 0.62) { arm[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (const k of adj[i]) if (!arm[k] && inZone(k)) { arm[k] = 1; stack.push(k); }
  }
  for (let i = 0; i < n; i++) if (!arm[i] && Math.abs(x(i)) > 0.104 && y(i) >= 0.66 && y(i) <= 0.76 && z(i) > -0.085) arm[i] = 1;
  // 模型是扫描件，袖子、上臂、手指各是独立的小块网格。按连通块补齐：大半已标记的块整块算手臂；
  // 整块落在手掌范围内、贴图又是肤色的（手指）也算，贴着手掌的裙摆不会被带进去
  const uv = geo.attributes.uv, map = [].concat(mesh.material)[0].map;
  let tex = null, tw = 0, th = 0;
  if (uv && map?.image?.width) {
    const c = document.createElement('canvas');
    c.width = tw = map.image.width;
    c.height = th = map.image.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(map.image, 0, 0);
    tex = ctx.getImageData(0, 0, tw, th).data;
  }
  const island = new Int32Array(n).fill(-1);
  const islands = [];
  for (let s = 0; s < n; s++) {
    if (island[s] >= 0) continue;
    const id = islands.length;
    const isle = (islands[id] = { n: 0, tagged: 0, warm: 0, bb: [9, -9, 9, -9, 9, -9] });
    const bb = isle.bb;
    const q = [s];
    island[s] = id;
    while (q.length) {
      const i = q.pop();
      isle.n++;
      if (arm[i]) isle.tagged++;
      if (tex) {
        const k = (Math.min(th - 1, Math.max(0, uv.getY(i) * th | 0)) * tw + Math.min(tw - 1, Math.max(0, uv.getX(i) * tw | 0))) * 4;
        isle.warm += tex[k] - tex[k + 2];
      }
      const ax = Math.abs(x(i));
      bb[0] = Math.min(bb[0], ax); bb[1] = Math.max(bb[1], ax);
      bb[2] = Math.min(bb[2], y(i)); bb[3] = Math.max(bb[3], y(i));
      bb[4] = Math.min(bb[4], z(i)); bb[5] = Math.max(bb[5], z(i));
      for (const k of adj[i]) if (island[k] < 0) { island[k] = id; q.push(k); }
    }
  }
  for (const isle of islands) {
    const bb = isle.bb;
    const hand = tex && bb[0] > 0.1 && bb[2] > 0.37 && bb[3] < 0.51 && bb[4] > -0.02 && bb[5] < 0.085 && isle.warm > 25 * isle.n;
    if (!hand && isle.tagged < isle.n * 0.45) continue;
    for (let i = 0; i < n; i++) if (islands[island[i]] === isle) arm[i] = 1;
  }
  // 肩口边界柔化两圈，避免袖子顶部出现锯齿
  for (let pass = 0; pass < 2; pass++) {
    const next = arm.slice();
    for (let i = 0; i < n; i++) {
      if (!adj[i].length) continue;
      let sum = 0;
      for (const k of adj[i]) sum += arm[k];
      next[i] = (arm[i] + sum / adj[i].length) * 0.5;
    }
    arm.set(next);
  }
  geo.setAttribute('aArm', new THREE.BufferAttribute(arm, 1));
}

export class AliceRig {
  constructor(model) {
    let mesh = null;
    model.traverse((o) => { if (o.isMesh) mesh = o; });
    this.mesh = mesh;
    tagArms(mesh);
    mesh.frustumCulled = false;
    this.u = {
      uPhase: { value: 0 }, uMove: { value: 0 }, uSway: { value: 0 }, uAir: { value: 0 }, uClimb: { value: 0 },
      uSlide: { value: 0 }, uClimbPhase: { value: 0 }, uTime: { value: 0 }, uLift: { value: 0 }, uLag: { value: new THREE.Vector2() },
    };
    this.patch = (shader) => {
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${DECL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BODY}`);
    };
    for (const m of [].concat(mesh.material)) m.onBeforeCompile = this.patch;
    if (mesh.castShadow) {
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = patch;
      mesh.customDepthMaterial = depth;
    }
    this.move = 0;
    this.air = 0;
    this.climb = 0;
    this.slide = 0;
    this.climbPhase = 0;
    this.time = 0;
    this.lag = new THREE.Vector2();
    this.lagV = new THREE.Vector2();
    this.lift = 0;
    this.liftV = 0;
  }

  // 拖尾用欠阻尼弹簧，裙摆在急停、落地后会多回摆一两下
  update(dt, s) {
    const u = this.u;
    this.time += dt;
    this.move = damp(this.move, s.moving ? 1 : 0, 12, dt);
    const airT = s.climb === 'down' ? -0.8 : s.grounded ? 0 : clamp(s.velY / 5, -1, 1);
    this.air = damp(this.air, airT, airT > this.air ? 14 : 9, dt);
    this.climb = damp(this.climb, s.climb === 'up' ? 1 : 0, 10, dt);
    this.slide = damp(this.slide, s.climb === 'down' ? 1 : 0, 10, dt);
    if (s.climb) this.climbPhase += dt * 9;

    const k = 0.009 / s.vis;
    this.lagV.x += ((-s.velX * k - this.lag.x) * 60 - this.lagV.x * 7) * dt;
    this.lagV.y += ((-s.velZ * k - this.lag.y) * 60 - this.lagV.y * 7) * dt;
    this.lag.addScaledVector(this.lagV, dt);
    if (s.landed) this.liftV += 0.6;
    if (s.jumped) this.liftV += 0.2;
    this.liftV += ((Math.max(-this.air, 0) * 0.03 - this.lift) * 60 - this.liftV * 7) * dt;
    this.lift += this.liftV * dt;

    u.uPhase.value = s.phase;
    u.uMove.value = this.move;
    u.uSway.value = Math.sin(s.phase * 0.5) * this.move;
    u.uAir.value = this.air;
    u.uClimb.value = this.climb;
    u.uSlide.value = this.slide;
    u.uClimbPhase.value = this.climbPhase;
    u.uTime.value = this.time;
    u.uLift.value = this.lift;
    u.uLag.value.copy(this.lag);
    return { move: this.move, up: Math.max(this.air, 0), down: Math.max(-this.air, 0) };
  }
}
