import * as THREE from 'three';
import { clamp, damp, lerp } from './lib.js';
import { LAYOUT, PALETTE as P } from './world.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
const part = (parent, geo, material, pos) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.castShadow = true;
  parent.add(m);
  return m;
};

// AI05 鸽子：高空巡逻 → 视野捕获大体型 → 俯冲 → Small 或躲进伞盖下则丢失目标。
export class Pigeon {
  constructor(g) {
    this.g = g;
    this.obj = new THREE.Group();
    const grey = mat(P.pigeon), dark = mat(new THREE.Color(P.pigeon).multiplyScalar(0.72));
    part(this.obj, new THREE.SphereGeometry(0.34, 12, 9).scale(1, 0.8, 1.45), grey, [0, 0, 0]);
    part(this.obj, new THREE.SphereGeometry(0.21, 10, 8), grey, [0, 0.2, 0.46]);
    part(this.obj, new THREE.SphereGeometry(0.04, 6, 6), mat(0xc0402f), [-0.1, 0.24, 0.63]);
    part(this.obj, new THREE.SphereGeometry(0.04, 6, 6), mat(0xc0402f), [0.1, 0.24, 0.63]);
    part(this.obj, new THREE.ConeGeometry(0.05, 0.18, 6).rotateX(Math.PI / 2), mat(P.beak), [0, 0.18, 0.7]);
    part(this.obj, new THREE.BoxGeometry(0.3, 0.04, 0.5), dark, [0, 0.02, -0.6]);
    this.wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.2, 0.08, 0);
      const wing = part(pivot, new THREE.BoxGeometry(0.95, 0.04, 0.5).translate(side * 0.47, 0, 0), grey, [0, 0, 0]);
      wing.rotation.z = side * -0.1;
      this.obj.add(pivot);
      return pivot;
    });
    this.obj.scale.setScalar(1.5);
    g.scene.add(this.obj);
    this.pos = LAYOUT.perch.clone();
    this.state = 'perch';
    this.timer = 0;
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.t = 0;
    this.lost = 0;
    this.wasSafe = true;
  }

  reset() {
    this.state = 'perch';
    this.pos.copy(LAYOUT.perch);
    this.obj.visible = true;
  }

  get alertRadius() {
    const idx = this.g.player.sizeIndex;
    return idx >= 3 ? 12 : idx === 2 ? 8 : 0;
  }

  playerTarget(out) {
    const pl = this.g.player;
    return out.set(pl.pos.x + pl.vel.x * 0.45, pl.pos.y + pl.height * 0.7, pl.pos.z + pl.vel.z * 0.45);
  }

  update(dt, t) {
    const g = this.g, pl = g.player, w = g.world;
    const flying = this.state !== 'perch';
    this.wings.forEach((pivot, i) => { pivot.rotation.z = (i ? -1 : 1) * (flying ? Math.sin(t * 22) * 0.75 : -0.08); });

    if (!g.canMove() && this.state === 'alert') this.timer = Math.min(this.timer, 0.2);

    if (this.state === 'perch') {
      this.pos.copy(LAYOUT.perch);
      this.pos.y += Math.sin(t * 2) * 0.03;
      this.obj.rotation.set(0, 2.6 + Math.sin(t * 0.7) * 0.5, 0);
      const z = pl.pos.z;
      const detectable = g.flags.mushroom_control && z < -11.8 && z > LAYOUT.pigeonZone.minZ && pl.pos.y < 1 && g.canMove();
      const safe = this.alertRadius === 0 || w.inCover();
      if (detectable && !safe && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < this.alertRadius) {
        this.state = 'alert';
        this.timer = 0;
        g.audio.play('screech');
        g.ui.callout('“蛇！”', this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 1300);
        g.onPigeonAlert?.();
      }
    } else if (this.state === 'alert') {
      this.timer += dt;
      this.lookAt(pl.pos);
      this.pos.y = LAYOUT.perch.y + Math.sin(this.timer * 30) * 0.04;
      if (this.isSafe()) return this.loseTarget();
      if (this.timer > 1.5) {
        this.state = 'dive';
        this.from.copy(this.pos);
        this.playerTarget(this.target);
        this.t = 0;
        this.len = Math.max(0.35, this.from.distanceTo(this.target) / 15);
        g.audio.play('wing');
      }
    } else if (this.state === 'dive') {
      this.t += dt / this.len;
      this.pos.lerpVectors(this.from, this.target, this.t * this.t);
      const dir = this.target.clone().sub(this.pos);
      if (dir.lengthSq() > 0.0001) this.obj.rotation.set(0, Math.atan2(dir.x, dir.z), 0.5);
      if (this.t >= 1) {
        const hit = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 0.6 + pl.radius && !this.isSafe();
        this.state = 'recover';
        this.timer = 0;
        this.from.copy(this.pos);
        this.target.set(this.pos.x, 6.5, this.pos.z - 1.5);
        if (hit) g.onPigeonHit?.();
        else {
          g.effects.burst(this.pos, 0xe8e2d0, { count: 10, speed: 1.2, size: 0.12, life: 0.6 });
          this.loseTarget();
        }
      }
    } else if (this.state === 'recover') {
      this.timer += dt;
      this.pos.y = damp(this.pos.y, 6.5, 2.2, dt);
      this.obj.rotation.x = damp(this.obj.rotation.x, 0, 6, dt);
      if (this.timer > 2.4) {
        if (this.isSafe() || pl.pos.z > LAYOUT.pigeonZone.maxZ || pl.pos.z < LAYOUT.pigeonZone.minZ) this.loseTarget();
        else {
          this.state = 'alert';
          this.timer = 0.5;
          g.audio.play('screech');
        }
      }
    } else if (this.state === 'return') {
      this.timer += dt;
      const k = clamp(this.timer / 2.2, 0, 1);
      this.pos.lerpVectors(this.from, this.target, k * k * (3 - 2 * k));
      this.obj.rotation.x = damp(this.obj.rotation.x, 0, 5, dt);
      const d = this.target.clone().sub(this.pos);
      this.obj.rotation.y = Math.atan2(d.x, d.z);
      if (k >= 1) this.state = 'perch';
    }
    this.obj.position.copy(this.pos);
  }

  isSafe() {
    return this.alertRadius === 0 || this.g.world.inCover();
  }

  lookAt(p) {
    const d = p.clone().sub(this.pos);
    this.obj.rotation.set(0.35, Math.atan2(d.x, d.z), 0);
  }

  loseTarget() {
    const g = this.g;
    this.state = 'return';
    this.timer = 0;
    this.from.copy(this.pos);
    this.target.set(LAYOUT.perch.x, LAYOUT.perch.y + 0.5, LAYOUT.perch.z);
    if (this.lost++ === 0) g.ui.hint('鸽子丢失了目标，扑棱棱飞回了树枝。');
  }
}
