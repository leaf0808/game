import * as THREE from 'three';
import { clamp, hsl, labelTexture, lerp, mulberry, sprite, vnoise, vary, glowTexture } from './lib.js';

// 场景与道具的自动配色：以紫粉蘑菇、蓝毛毛虫为基准的森林色板，实例物件在色板附近随机偏移。
export const PALETTE = {
  moss: hsl(98, 30, 36), mossDark: hsl(140, 26, 24), mossLight: hsl(78, 36, 50), clearing: hsl(84, 38, 52),
  path: hsl(34, 30, 54), trunk: hsl(22, 34, 34), rock: hsl(230, 13, 50), rockDark: hsl(232, 16, 34),
  wood: hsl(30, 40, 44), woodDark: hsl(26, 42, 28), brass: hsl(43, 70, 56),
  cap: hsl(272, 50, 68), capPink: hsl(320, 60, 78), capCream: hsl(44, 52, 88), stalk: hsl(44, 42, 88),
  gold: hsl(44, 86, 64), cool: hsl(196, 80, 72), warm: hsl(38, 92, 64), violet: hsl(268, 60, 66),
  vine: hsl(96, 36, 44), sky: hsl(198, 58, 76), horizon: hsl(40, 62, 88), fog: hsl(152, 30, 86),
  pigeon: hsl(222, 12, 62), beak: hsl(30, 80, 58),
};

// 关卡布局：小径从 z=+30（森林入口）通向 z=-37（公爵夫人的小屋）。
export const LAYOUT = {
  spawn: { x: 0, z: 27 },
  boundX: 4.6,
  minZ: -34.0,
  maxZ: 31,
  platform: { x: 0, z: 13, scale: 2.3 },
  hedgeZ: 8,
  tunnelZ: 2,
  ledge: { minX: 2.4, maxX: 5.4, minZ: -8.6, maxZ: -5.4, top: 2.3 },
  plate: { x: 3.9, z: -7.0 },
  vine: { x: 1.95, z: -6.5 },
  gateZ: -9.7,
  pigeonZone: { minZ: -23.5, maxZ: -10.5 },
  perch: new THREE.Vector3(0.7, 7.55, -16.7),
  covers: [{ x: -2.6, z: -15.2, r: 1.75 }, { x: 2.7, z: -19.6, r: 1.75 }],
  saves: [{ x: -3.4, z: 15.2 }, { x: -3.4, z: 10.2 }, { x: 0, z: -25.5 }],
  sign: { x: 1.9, z: -30 },
  // 小屋模型原点在正门地面、门朝 +Z，进深 0.674：这里记的是门口位置
  cottage: { x: 0, z: -34.4, scale: 5.2 },
  doorZ: -33.4,
  smallMushrooms: [[3.4, 5.2, -0.6], [-3.4, -4.3, 0.7], [-3.4, -11.4, 0.8], [3.5, -21.6, -0.7], [-3.5, -27.8, 0.7]],
  spores: [[2.6, 23.6], [-2.9, 0.4], [-2.9, -17.9], [2.9, -12.6], [-3.2, -31.8]],
};

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, flatShading: true, ...extra });
const add = (parent, geo, mat, pos = [0, 0, 0], rot = null) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
const between = (parent, a, b, radius, mat) => {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = add(parent, new THREE.CylinderGeometry(radius, radius * 1.1, dir.length(), 7), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
};

export function buildWorld(g) {
  const rnd = mulberry(20261125);
  const P = PALETTE;
  const world = {
    colliders: [], mushrooms: [], spores: [], saves: [], glow: glowTexture(),
    flags: g.flags, player: g.player, group: new THREE.Group(),
  };
  const F = world.flags;
  g.scene.add(world.group);
  const G = world.group;

  const topAt = (obj, x, z, from = 14) => {
    obj.updateWorldMatrix(true, true);
    const ray = new THREE.Raycaster(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(obj, true)[0];
    return hit ? hit.point.y : 0;
  };
  world.topAt = topAt;

  // ---------- 地面：小径内平坦，两侧隆起为丘 ----------
  {
    const mound = (x, z) => {
      const dx = Math.max(0, Math.abs(x) - 6.5);
      const dz = Math.max(0, z - 33, -43 - z);
      const e = clamp(Math.hypot(dx, dz) / 16, 0, 1);
      return e * e * (1.2 + vnoise(x * 0.08 + 3, z * 0.08) * 6.5);
    };
    const geo = new THREE.PlaneGeometry(170, 170, 100, 100).rotateX(-Math.PI / 2).toNonIndexed();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) pos.setY(i, mound(pos.getX(i), pos.getZ(i)));
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const n = vnoise(x * 0.3, z * 0.3), n2 = vnoise(x * 1.3 + 9, z * 1.3);
      c.copy(P.mossDark).lerp(P.mossLight, n * 0.8 + n2 * 0.2);
      const pathW = 2.3 + Math.sin(z * 0.6) * 0.5;
      c.lerp(P.path, 1 - clamp((Math.abs(x) - pathW + 0.3) / 1.1, 0, 1));
      c.lerp(P.rock, 1 - clamp((Math.hypot(x, z - 13) - 2.9) / 0.7, 0, 1));
      c.lerp(P.clearing, 1 - clamp((Math.hypot(x, z + 36) - 4.2) / 2, 0, 1));
      for (let k = 0; k < 3; k += 1) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    ground.receiveShadow = true;
    G.add(ground);
  }

  // ---------- 天空与光 ----------
  {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(160, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: P.sky }, bottom: { value: P.horizon } },
        vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vW; void main(){ float h = clamp(normalize(vW).y, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.55)), 1.0); }',
      }),
    );
    G.add(sky);
    g.scene.fog = new THREE.Fog(P.fog, 20, 64);
    G.add(new THREE.HemisphereLight(0xd8f1ff, 0x3d5a3a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -16;
    sun.shadow.camera.right = sun.shadow.camera.top = 16;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    G.add(sun, sun.target);
    world.sun = sun;
  }

  // ---------- 森林：树干、树冠、草丛、装饰蘑菇、岩石（全部实例化） ----------
  {
    const trees = [];
    for (let i = 0; i * 4 < 1400 && trees.length < 240; i += 1) {
      const x = (rnd() * 2 - 1) * 38, z = -56 + rnd() * 100;
      if (Math.abs(x) < 5.8 + rnd() * 1.6) continue;
      if (z < -29 && Math.abs(x) < 8.5) continue;
      if (z > 22 && Math.abs(x) < 7.5) continue;
      if (trees.some((s) => Math.hypot(s.x - x, s.z - z) < 2.7)) continue;
      trees.push({ x, z, h: 3.2 + rnd() * 4.4, r: 0.2 + rnd() * 0.2, kind: rnd() < 0.62 ? 'blob' : 'pine', fol: rnd() < 0.12 ? vary(hsl(270, 30, 50), rnd) : vary(hsl(96 + rnd() * 74, 38, 36), rnd, 6, 8, 10) });
    }
    [[5.9, -6.4, 9.5, 0.8, 'blob'], [-4.9, -17.9, 8.6, 0.66, 'blob'], [-4.6, 16.6, 7, 0.5, 'blob'], [4.8, 15.4, 7.6, 0.52, 'pine'], [-5.1, 10.6, 6.4, 0.46, 'pine'], [5.0, 10.2, 6.8, 0.5, 'blob'], [-4.4, 25.2, 7.2, 0.5, 'blob'], [4.6, 27.6, 6.6, 0.48, 'pine'], [-5.4, -33, 6.8, 0.52, 'pine'], [5.6, -34.2, 7.4, 0.54, 'blob'], [-4.9, -0.6, 6.9, 0.5, 'blob'], [5.0, -23.4, 7.8, 0.55, 'pine']]
      .forEach(([x, z, h, r, kind]) => trees.push({ x, z, h, r, kind, fol: vary(hsl(104 + rnd() * 60, 40, 38), rnd) }));
    const blobs = [], pines = [];
    trees.forEach((t) => {
      if (t.kind === 'blob') {
        const cr = 1.1 + rnd() * 1.0 + t.r;
        blobs.push({ x: t.x, y: t.h + cr * 0.75, z: t.z, sx: cr, sy: cr * 0.82, sz: cr, c: t.fol });
        blobs.push({ x: t.x + (rnd() - 0.5) * cr * 1.3, y: t.h + cr * 0.3, z: t.z + (rnd() - 0.5) * cr * 1.3, sx: cr * 0.62, sy: cr * 0.55, sz: cr * 0.62, c: vary(t.fol, rnd, 6, 6, 8) });
      } else {
        for (let k = 0; k < 3; k += 1) pines.push({ x: t.x, y: t.h + 0.6 + k * 1.15, z: t.z, sx: (1.9 - k * 0.45) * (0.8 + t.r), sy: 2.0 - k * 0.3, sz: (1.9 - k * 0.45) * (0.8 + t.r), c: vary(t.fol, rnd, 6, 6, 6) });
      }
    });
    const inst = (geo, mat, list, place) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach((item, i) => { place(o, item); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, item.c || P.trunk); });
      m.castShadow = m.receiveShadow = true;
      G.add(m);
      return m;
    };
    inst(new THREE.CylinderGeometry(0.72, 1, 1, 7), std(P.trunk), trees, (o, t) => { o.position.set(t.x, t.h / 2, t.z); o.scale.set(t.r, t.h, t.r); });
    inst(new THREE.IcosahedronGeometry(1, 1), std(0xffffff), blobs, (o, b) => { o.position.set(b.x, b.y, b.z); o.scale.set(b.sx, b.sy, b.sz); o.rotation.y = rnd() * 6; });
    inst(new THREE.ConeGeometry(1, 1, 8), std(0xffffff), pines, (o, p) => { o.position.set(p.x, p.y, p.z); o.scale.set(p.sx, p.sy, p.sz); o.rotation.y = rnd() * 6; });
    world.trees = trees;

    const tufts = [];
    for (let i = 0; i < 620; i += 1) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (2.5 + rnd() * 3.6), z = -37 + rnd() * 67;
      if (Math.hypot(x, z - 13) < 3.5) continue;
      tufts.push({ x, z, s: 0.6 + rnd() * 1.1, wide: rnd() < 0.3, c: vary(rnd() < 0.15 ? hsl(168, 40, 44) : hsl(100 + rnd() * 40, 42, 34 + rnd() * 14), rnd) });
    }
    const tuftMesh = inst(new THREE.ConeGeometry(0.09, 0.46, 5), std(0xffffff), tufts, (o, t) => { o.position.set(t.x, 0.2 * t.s, t.z); o.scale.set(t.wide ? 2.6 * t.s : t.s, t.s, t.wide ? 2.6 * t.s : t.s); o.rotation.y = rnd() * 6; });
    tuftMesh.castShadow = false;

    const shrooms = [];
    for (let i = 0; i < 95; i += 1) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (2.7 + rnd() * 4.2), z = -37 + rnd() * 67;
      if (Math.hypot(x, z - 13) < 3.6 || (x > 2 && z > -9.4 && z < -4.8)) continue;
      const s = 0.6 + rnd() * 1.1;
      shrooms.push({ x, z, s, c: vary([P.cap, P.capPink, P.capCream][Math.floor(rnd() * 3)], rnd, 8, 6, 6) });
    }
    inst(new THREE.CylinderGeometry(0.5, 0.65, 1, 8), std(P.stalk), shrooms, (o, m) => { o.position.set(m.x, 0.13 * m.s, m.z); o.scale.set(0.06 * m.s, 0.26 * m.s, 0.06 * m.s); });
    inst(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff), shrooms, (o, m) => { o.position.set(m.x, 0.25 * m.s, m.z); o.scale.set(0.2 * m.s, 0.15 * m.s, 0.2 * m.s); });

    const rocks = [];
    for (let i = 0; i < 70; i += 1) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (3.9 + rnd() * 2.6), z = -37 + rnd() * 67;
      if (Math.hypot(x, z - 13) < 4) continue;
      rocks.push({ x, z, s: 0.3 + rnd() * 0.9, c: vary(rnd() < 0.5 ? P.rock : P.rockDark, rnd) });
    }
    inst(new THREE.DodecahedronGeometry(1, 0), std(0xffffff), rocks, (o, r) => { o.position.set(r.x, r.s * 0.42, r.z); o.scale.set(r.s * 1.2, r.s * 0.8, r.s); o.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); });
  }

  // ---------- 巨型蘑菇平台：毛毛虫、水烟壶 ----------
  const makeMushroom = (scale) => {
    const m = g.models.mushroom.clone(true);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.scale.setScalar(scale);
    m.userData.baseScale = scale;
    return m;
  };
  world.makeMushroom = makeMushroom;
  {
    const { x, z, scale } = LAYOUT.platform;
    const disc = add(G, new THREE.CircleGeometry(3.5, 30).rotateX(-Math.PI / 2), std(P.rockDark));
    disc.position.set(x, 0.015, z);
    disc.castShadow = false;
    const giant = makeMushroom(scale);
    giant.position.set(x, 0, z);
    G.add(giant);
    const top = topAt(giant, x, z);
    world.giant = giant;
    world.giantTop = top;
    const cat = g.models.caterpillar.clone(true);
    cat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    cat.scale.setScalar(0.95);
    cat.rotation.y = -Math.PI / 2;
    cat.position.set(0.02, top - 0.01, z + 0.08);
    G.add(cat);
    world.caterpillar = cat;
    world.caterpillarHead = new THREE.Vector3(0.05, top + 0.86, z + 0.34);
    world.caterpillarHome = cat.position.clone();

    const hookah = new THREE.Group();
    const brass = std(P.brass, { metalness: 0.85, roughness: 0.32, flatShading: false });
    add(hookah, new THREE.SphereGeometry(0.15, 14, 10), brass, [0, 0.13, 0]);
    add(hookah, new THREE.CylinderGeometry(0.028, 0.035, 0.44, 8), brass, [0, 0.4, 0]);
    add(hookah, new THREE.SphereGeometry(0.085, 12, 8), std(P.woodDark), [0, 0.66, 0]);
    const hosePts = [new THREE.Vector3(0.03, 0.36, 0), new THREE.Vector3(-0.16, 0.22, 0.12), new THREE.Vector3(-0.3, 0.3, 0.14), new THREE.Vector3(-0.42, 0.52, 0.06)];
    add(hookah, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 16, 0.02, 6, false), std(P.woodDark));
    hookah.position.set(0.72, top, z + 0.3);
    hookah.rotation.y = -0.5;
    G.add(hookah);
    world.hookah = hookah;
    world.hookahTop = new THREE.Vector3(0.72, top + 0.78, z + 0.3);

    // 茧与蝴蝶：化蝶演出时才出现。
    const cocoon = add(G, new THREE.CapsuleGeometry(0.14, 0.3, 6, 10), std(hsl(150, 30, 80), { emissive: hsl(170, 50, 40), emissiveIntensity: 0.6 }), [0.75, top + 0.28, z + 0.95]);
    cocoon.visible = false;
    world.cocoon = cocoon;
    const butterfly = new THREE.Group();
    const wingGeo = new THREE.CircleGeometry(0.2, 10).scale(1, 0.7, 1);
    const wingMat = std(hsl(205, 70, 58), { emissive: hsl(205, 80, 30), emissiveIntensity: 0.5, side: THREE.DoubleSide });
    add(butterfly, new THREE.CapsuleGeometry(0.02, 0.12, 4, 6).rotateX(Math.PI / 2), std(P.woodDark));
    const wl = add(butterfly, wingGeo, wingMat, [-0.19, 0, 0]);
    const wr = add(butterfly, wingGeo, wingMat, [0.19, 0, 0]);
    butterfly.visible = false;
    butterfly.userData = { wl, wr };
    G.add(butterfly);
    world.butterfly = butterfly;
    world.mushrooms.push({ name: '巨型蘑菇', obj: giant, x, z, scale, rotY: 0, giant: true, stemR: 0.42 * scale, left: new THREE.Vector3(-0.78, 0.5, 0.36), right: new THREE.Vector3(0.78, 0.5, 0.36) });
  }

  // ---------- 试炼入口：藤蔓闸门 ----------
  {
    const z = LAYOUT.hedgeZ;
    const bark = std(P.woodDark);
    [-2.95, 2.95].forEach((x) => add(G, new THREE.CylinderGeometry(0.24, 0.32, 3.7, 8), bark, [x, 1.85, z]));
    add(G, new THREE.TorusGeometry(2.95, 0.2, 8, 26, Math.PI), bark, [0, 3.6, z]);
    const barrier = new THREE.Group();
    const vineMat = std(P.vine);
    for (let i = 0; i < 11; i += 1) {
      const y = 0.35 + i * 0.3;
      add(barrier, new THREE.CylinderGeometry(0.05, 0.06, 5.9, 5), vineMat, [0, y, (rnd() - 0.5) * 0.2], [0, 0, (i % 2 ? 1 : -1) * (0.18 + rnd() * 0.5)]);
    }
    const glow = add(barrier, new THREE.PlaneGeometry(5.9, 3.5), new THREE.MeshBasicMaterial({ color: P.violet, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), [0, 1.75, 0]);
    glow.castShadow = false;
    barrier.position.set(0, 0, z);
    G.add(barrier);
    world.barrier = barrier;
    world.colliders.push({ name: 'hedge', min: [-6, 0, z - 0.35], max: [6, 4, z + 0.35], active: () => !F.mushroom_control });
  }

  // ---------- 障碍一：矮门洞（倒木 + 巨石） ----------
  {
    const z = LAYOUT.tunnelZ;
    const log = add(G, new THREE.CylinderGeometry(0.5, 0.56, 9.4, 11).rotateZ(Math.PI / 2), std(P.trunk), [0.1, 1.3, z]);
    world.tunnelLog = log;
    const rockMat = std(P.rock);
    [[-3.7, 0.6, z, 1.15, 0.78], [3.7, 0.6, z, 1.15, 0.78], [-1.2, 1.95, z + 0.05, 0.75, 0.7], [0.3, 2.1, z - 0.1, 0.8, 0.75], [1.6, 1.9, z + 0.1, 0.7, 0.66]].forEach(([x, y, zz, s, sy]) => {
      add(G, new THREE.DodecahedronGeometry(1, 0), rockMat, [x, y, zz]).scale.set(s, sy, s * 0.9);
    });
    world.colliders.push({ name: 'tunnel', min: [-6, 0, z - 0.55], max: [6, 0.78, z + 0.55], active: () => g.player.height > 0.74 });
  }

  // ---------- 障碍二：高处藤蔓 → 压力开关 → 机关门 ----------
  {
    const { minX, maxX, minZ, maxZ, top } = LAYOUT.ledge;
    const wood = std(P.wood);
    add(G, new THREE.BoxGeometry(maxX - minX, 0.24, maxZ - minZ), wood, [(minX + maxX) / 2, top - 0.12, (minZ + maxZ) / 2]);
    [[maxX - 0.2, minZ + 0.2], [maxX - 0.2, maxZ - 0.2], [minX + 0.2, minZ + 0.2], [minX + 0.2, maxZ - 0.2]].forEach(([x, z]) => between(G, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, top - 0.24, z), 0.11, std(P.woodDark)));
    for (let i = 0; i < 6; i += 1) add(G, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6).rotateX(Math.PI / 2), wood, [minX + 0.05, 0.35 + i * 0.36, (minZ + maxZ) / 2]);
    world.colliders.push({ name: 'ledge', min: [minX, 0, minZ], max: [maxX + 0.4, top - 0.16, maxZ], active: () => g.player.pos.y < top - 0.2 });
    const railZ = minZ + 0.08;
    for (let i = 0; i <= 3; i += 1) add(G, new THREE.CylinderGeometry(0.05, 0.06, 0.95, 6), std(P.woodDark), [minX + 0.25 + (i / 3) * (maxX - minX - 0.5), top + 0.47, railZ]);
    add(G, new THREE.CylinderGeometry(0.05, 0.05, maxX - minX - 0.3, 6).rotateZ(Math.PI / 2), wood, [(minX + maxX) / 2, top + 0.95, railZ]);
    world.colliders.push({ name: 'rail', min: [minX, 0, minZ - 0.3], max: [maxX + 0.4, top + 1.5, railZ], active: () => true });
    const plate = add(G, new THREE.CylinderGeometry(0.9, 0.98, 0.14, 24), std(hsl(200, 16, 72), { emissive: P.warm, emissiveIntensity: 0 }), [LAYOUT.plate.x, top + 0.07, LAYOUT.plate.z]);
    world.plate = plate;
    const vinePts = [];
    for (let i = 0; i <= 8; i += 1) vinePts.push(new THREE.Vector3(LAYOUT.vine.x + Math.sin(i * 1.3) * 0.07, 5.3 - (i / 8) * 5.0, LAYOUT.vine.z + Math.cos(i * 1.7) * 0.07));
    const vineGroup = new THREE.Group();
    add(vineGroup, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vinePts), 40, 0.075, 7, false), std(P.vine));
    for (let i = 0; i < 7; i += 1) add(vineGroup, new THREE.SphereGeometry(0.13, 6, 5).scale(1, 0.35, 0.6), std(hsl(110, 45, 42)), [LAYOUT.vine.x + (rnd() - 0.5) * 0.3, 0.5 + rnd() * 4.4, LAYOUT.vine.z + 0.1]);
    G.add(vineGroup);
    world.vine = vineGroup;
    between(G, new THREE.Vector3(5.9, 5.35, -6.4), new THREE.Vector3(1.5, 5.3, -6.5), 0.2, std(P.trunk));

    const z = LAYOUT.gateZ;
    const dark = std(P.woodDark);
    [-3.0, 3.0].forEach((x) => add(G, new THREE.CylinderGeometry(0.3, 0.38, 5.1, 8), dark, [x, 2.55, z]));
    add(G, new THREE.BoxGeometry(7, 0.45, 0.6), dark, [0, 5.0, z]);
    const leaves = new THREE.Group();
    const iron = std(hsl(220, 10, 30), { metalness: 0.6, roughness: 0.5, flatShading: false });
    [-1.36, 1.36].forEach((x) => {
      add(leaves, new THREE.BoxGeometry(2.68, 4.3, 0.22), std(P.wood), [x, 2.15, 0]);
      [0.9, 3.4].forEach((y) => add(leaves, new THREE.BoxGeometry(2.7, 0.16, 0.26), iron, [x, y, 0]));
    });
    leaves.position.set(0, 0, z);
    G.add(leaves);
    world.gateLeaves = leaves;
    world.gateT = 0;
    world.gateOpen = false;
    world.gateTimer = 0;
    world.colliders.push({ name: 'gate', min: [-3.2, 0, z - 0.4], max: [3.2, 5, z + 0.4], active: () => world.gateT < 0.75 });
    const rockMat = std(P.rock);
    [[-4.6, 0.55, z + 0.1, 1.7, 1.05, 1.35], [-3.5, 0.4, z - 0.2, 1.0, 0.7, 0.9], [4.6, 0.55, z + 0.1, 1.7, 1.05, 1.35], [3.7, 0.4, z - 0.2, 1.0, 0.7, 0.9]].forEach(([x, y, zz, s, sy, sz]) => {
      add(G, new THREE.DodecahedronGeometry(1, 0), rockMat, [x, y, zz]).scale.set(s, sy, sz);
    });
    [[-6, -3.1], [3.1, 6]].forEach(([x0, x1]) => world.colliders.push({ name: 'gate', min: [x0, 0, z - 1.1], max: [x1, 5, z + 1.0], active: () => true }));
  }

  // ---------- 障碍三：鸽子栖枝 + 低矮掩体蘑菇 ----------
  {
    between(G, new THREE.Vector3(-4.9, 6.6, -17.9), LAYOUT.perch.clone().add(new THREE.Vector3(0.5, 0, 0)), 0.17, std(P.trunk));
    LAYOUT.covers.forEach((cover, index) => {
      const m = makeMushroom(2.45);
      m.position.set(cover.x, 0, cover.z);
      m.rotation.y = index * 1.7;
      G.add(m);
      const ring = add(G, new THREE.RingGeometry(cover.r - 0.12, cover.r, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.cool, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), [cover.x, 0.03, cover.z]);
      ring.castShadow = false;
      world[`coverRing${index}`] = ring;
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2;
        add(G, new THREE.ConeGeometry(0.16, 0.5, 5), std(hsl(140, 42, 30)), [cover.x + Math.cos(a) * (cover.r + 0.25), 0.22, cover.z + Math.sin(a) * (cover.r + 0.25)]);
      }
    });
  }

  // ---------- 存档点、孢子、出口光、路牌、小屋 ----------
  const beamMat = () => new THREE.MeshBasicMaterial({ color: P.cool, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  LAYOUT.saves.forEach(({ x, z }, index) => {
    const group = new THREE.Group();
    add(group, new THREE.TorusGeometry(0.56, 0.05, 6, 30).rotateX(Math.PI / 2), std(P.rockDark), [0, 0.04, 0]);
    const crystal = add(group, new THREE.OctahedronGeometry(0.2, 0), std(hsl(170, 60, 70), { emissive: hsl(172, 80, 50), emissiveIntensity: 0.2, flatShading: true }), [0, 0.78, 0]);
    const beam = add(group, new THREE.CylinderGeometry(0.12, 0.26, 3.4, 12, 1, true), beamMat(), [0, 1.7, 0]);
    beam.castShadow = false;
    const halo = sprite(world.glow, 0x9ff0ff, 1.3);
    halo.position.y = 0.8;
    group.add(halo);
    group.position.set(x, 0, z);
    G.add(group);
    world.saves.push({ index, x, z, group, crystal, beam, halo, active: false, pulse: 0 });
  });
  world.colliders.push({ name: 'cottage', min: [-6, 0, -60], max: [6, 6, LAYOUT.doorZ - 0.3], active: () => true });

  LAYOUT.spores.forEach(([x, z], index) => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4c2 }));
    group.add(core, sprite(world.glow, 0xffe08a, 1.0));
    const light = new THREE.PointLight(0xffd27a, 0.9, 4.5, 2);
    group.add(light);
    group.position.set(x, 0.55, z);
    G.add(group);
    world.spores.push({ index, x, z, group, core, light, taken: false, hover: 0 });
  });

  const exitGlow = sprite(world.glow, 0xfff0b8, 7);
  exitGlow.position.set(0, 2.2, -28);
  exitGlow.visible = false;
  G.add(exitGlow);
  world.exitGlow = exitGlow;

  LAYOUT.smallMushrooms.forEach(([x, z, rotY], index) => {
    const s = 0.62;
    const m = makeMushroom(s);
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    G.add(m);
    world.mushrooms.push({ name: `小蘑菇${index + 1}`, obj: m, x, z, scale: s, rotY, stemR: 0.42 * s, left: new THREE.Vector3(-0.21, 0.17, 0.1), right: new THREE.Vector3(0.21, 0.17, 0.1) });
  });

  {
    const { x, z } = LAYOUT.sign;
    const post = new THREE.Group();
    add(post, new THREE.CylinderGeometry(0.07, 0.09, 1.9, 7), std(P.woodDark), [0, 0.95, 0]);
    // 箭头画在牌面左侧：来路上看，小屋在牌子的左手边
    const tex = labelTexture(['公爵夫人', '← 宅邸'], { width: 512, height: 256, font: 'bold 76px "Songti SC", SimSun, Georgia, serif' });
    const side = std(P.wood);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.72, 0.08), [side, side, side, side, std(0xffffff, { map: tex, flatShading: false }), side]);
    // 牌面挂在立柱左侧、贴在柱子后面，文字和箭头不被柱子挡住
    board.position.set(-0.7, 1.6, -0.035);
    board.castShadow = true;
    post.add(board);
    post.position.set(x, 0, z);
    post.rotation.y = -0.55;
    G.add(post);
    world.sign = post;
  }

  {
    const cottage = g.models.cottage.clone(true);
    cottage.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    cottage.scale.setScalar(LAYOUT.cottage.scale);
    cottage.position.set(LAYOUT.cottage.x, 0.02, LAYOUT.cottage.z);
    G.add(cottage);
    world.cottage = cottage;
    const doorLight = new THREE.PointLight(0xffd9a0, 6, 9, 2);
    doorLight.position.set(LAYOUT.cottage.x, 1.1, LAYOUT.cottage.z + 1.0);
    G.add(doorLight);
  }

  // ---------- 萤火虫 ----------
  {
    const count = 150;
    const positions = new Float32Array(count * 3);
    world.fireflies = [];
    for (let i = 0; i < count; i += 1) {
      const p = new THREE.Vector3((rnd() * 2 - 1) * 9, 0.4 + rnd() * 4.5, -36 + rnd() * 66);
      positions.set([p.x, p.y, p.z], i * 3);
      world.fireflies.push({ p, phase: rnd() * 6 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffe49a, size: 0.16, map: world.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    G.add(new THREE.Points(geo, mat));
    world.fireflyGeo = geo;
  }

  world.update = (dt, t) => {
    // 闸门开启动画
    const barrierTarget = F.mushroom_control ? 0 : 1;
    world.barrier.scale.y = lerp(world.barrier.scale.y, barrierTarget, 1 - Math.exp(-3 * dt));
    world.barrier.visible = world.barrier.scale.y > 0.03;
    // 机关门
    world.gateT = clamp(world.gateT + (world.gateOpen ? dt : -dt) / 1.1, 0, 1);
    world.gateLeaves.position.y = world.gateT * 4.15;
    // 压力开关（P02：仅 Big/长脖子能压动，离开 5 秒复位）
    const pl = g.player;
    const onPlate = Math.hypot(pl.pos.x - LAYOUT.plate.x, pl.pos.z - LAYOUT.plate.z) < 0.95 && pl.pos.y > LAYOUT.ledge.top - 0.3;
    world.onPlate = onPlate;
    world.plate.material.emissiveIntensity = lerp(world.plate.material.emissiveIntensity, onPlate && pl.sizeIndex >= 3 ? 0.9 : 0, 1 - Math.exp(-8 * dt));
    world.plate.position.y = LAYOUT.ledge.top + (onPlate && pl.sizeIndex >= 3 ? 0.015 : 0.07);
    if (onPlate && pl.sizeIndex >= 3 && !world.gateOpen) {
      world.gateOpen = true;
      g.audio.play('gate');
    }
    if (world.gateOpen && !onPlate) {
      const inGate = Math.abs(pl.pos.z - LAYOUT.gateZ) < 1.2;
      world.gateTimer += dt;
      if (world.gateTimer > 5 && !inGate) {
        world.gateOpen = false;
        g.audio.play('gate');
      }
    } else if (onPlate) world.gateTimer = 0;

    world.saves.forEach((s) => {
      s.pulse += dt;
      const k = s.active ? 1 : 0.12;
      const f = k * (0.75 + Math.sin(s.pulse * 3) * 0.25);
      s.crystal.material.emissiveIntensity = 0.3 + f * 1.6;
      s.crystal.rotation.y += dt * (s.active ? 1.6 : 0.4);
      s.crystal.position.y = 0.78 + Math.sin(s.pulse * 2) * 0.05;
      s.halo.material.opacity = 0.25 + f * 0.6;
      s.beam.material.opacity = 0.03 + f * 0.16;
    });
    world.spores.forEach((s) => {
      if (s.taken) return;
      s.group.position.y = 0.55 + Math.sin(t * 2 + s.index) * 0.1;
      s.group.rotation.y += dt;
    });
    world.exitGlow.visible = F.trial_cleared;
    if (F.trial_cleared) world.exitGlow.material.opacity = 0.35 + Math.sin(t * 1.5) * 0.12;
    const attr = world.fireflyGeo.attributes.position;
    world.fireflies.forEach((f, i) => attr.setXYZ(i, f.p.x + Math.sin(t * 0.5 + f.phase) * 0.6, f.p.y + Math.sin(t * 0.9 + f.phase * 2) * 0.3, f.p.z + Math.cos(t * 0.4 + f.phase) * 0.6));
    attr.needsUpdate = true;
    if (world.caterpillar.visible) world.caterpillar.scale.y = 0.95 * (1 + Math.sin(t * 1.6) * 0.02);
    // 太阳阴影跟随玩家
    world.sun.position.set(pl.pos.x + 12, 20, pl.pos.z + 9);
    world.sun.target.position.set(pl.pos.x, 0, pl.pos.z);
    world.sun.target.updateMatrixWorld();
  };

  world.inCover = () => {
    if (g.player.sizeIndex > 1) return false;
    return LAYOUT.covers.some((c) => Math.hypot(g.player.pos.x - c.x, g.player.pos.z - c.z) < c.r);
  };

  return world;
}
