import * as THREE from 'three';
import { damp } from './lib.js';
import { LAYOUT } from './world.js';
import { AliceRig } from './aliceRig.js';

export const ALICE_HEIGHT = 0.978;

// 体型阶梯：0 小小一团 < 1 Small < 2 Normal < 3 Big < 4 长脖子。咬左(+1)/咬右(-1)。
export const SIZES = [
  { key: 'hyper-small', label: '小小一团', scale: 0.28, speed: 0.6, warm: false },
  { key: 'small', label: '缩小', scale: 0.5, speed: 1.1, warm: false },
  { key: 'normal', label: '正常', scale: 1, speed: 1, warm: false },
  { key: 'big', label: '巨大', scale: 1.9, speed: 0.85, warm: true },
  { key: 'hyper-tall', label: '长脖子', scale: 2.7, speed: 0.6, warm: true },
];

export const SIZE_LINES = {
  normal: '嗯……这次总算是我自己了。',
  small: '我现在还没有一把茶壶高呢！',
  big: '小心，我的头快碰到树顶了。',
  'hyper-tall': '我的脖子去哪儿了？它自己跑去看了看风景！',
  'hyper-small': '我觉得我可以钻进一片叶子底下喝茶了。',
  nine: '九英寸，正好不会吓到人。',
};

export class Player {
  constructor(g, model) {
    this.g = g;
    this.obj = new THREE.Group();
    this.model = model;
    model.scale.setScalar(1);
    this.obj.add(model);
    g.scene.add(this.obj);
    this.pos = new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
    this.vel = new THREE.Vector3();
    this.velY = 0;
    this.sizeIndex = 2;
    this.nineInch = false;
    this.vis = 1;
    this.yaw = Math.PI;
    this.heading = Math.PI;
    this.phase = 0;
    this.auto = null;
    this.radius = 0.22;
    this.height = ALICE_HEIGHT;
    this.moving = false;
    this.blockedBy = null;
    this.hidden = false;
    this.climbing = null;
    this.landed = false;
    this.jumped = false;
    this.rig = new AliceRig(model);
  }

  get def() { return SIZES[this.sizeIndex]; }
  // 九英寸沿用 Small 碰撞体，只是展示比例更小
  get colliderScale() { return this.nineInch ? SIZES[1].scale : this.def.scale; }
  get displayScale() { return this.nineInch ? 0.68 : this.def.scale; }

  setSize(index, { silent = false } = {}) {
    const next = Math.max(0, Math.min(SIZES.length - 1, index));
    const wasNine = this.nineInch;
    this.nineInch = false;
    if (next === this.sizeIndex && !wasNine) return false;
    const prev = this.sizeIndex;
    this.sizeIndex = next;
    if (!silent) this.g.onSizeChanged?.(prev, next);
    return true;
  }

  walkTo(x, z, speed = 1) {
    this.auto = { x, z, speed };
    return new Promise((resolve) => { this.auto.resolve = resolve; });
  }

  groundHeight() {
    const l = LAYOUT.ledge;
    const inside = this.pos.x > l.minX && this.pos.x < l.maxX && this.pos.z > l.minZ && this.pos.z < l.maxZ;
    return inside && this.pos.y > l.top - 0.4 ? l.top : 0;
  }

  hit() {
    const r = this.radius, h = this.height;
    const p = this.pos;
    for (const c of this.g.world.colliders) {
      if (!c.active()) continue;
      if (p.x + r > c.min[0] && p.x - r < c.max[0] && p.y + h > c.min[1] && p.y < c.max[1] && p.z + r > c.min[2] && p.z - r < c.max[2]) {
        return c;
      }
    }
    return null;
  }

  collides() {
    this.blockedBy = this.hit()?.name ?? null;
    return !!this.blockedBy;
  }

  update(dt) {
    const def = this.def;
    this.radius = 0.22 * this.colliderScale;
    this.height = ALICE_HEIGHT * this.colliderScale;
    this.blockedBy = null;

    let mx = 0, mz = 0;
    const canMove = this.g.canMove();
    if (this.auto) {
      const dx = this.auto.x - this.pos.x, dz = this.auto.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.auto.resolve?.();
        this.auto = null;
      } else {
        const s = Math.min(d, 3.2 * this.auto.speed * dt);
        mx = (dx / d) * s; mz = (dz / d) * s;
        this.heading = Math.atan2(dx, dz);
      }
    } else if (canMove) {
      const inp = this.g.input;
      const f = inp.forward(), s = inp.strafe();
      if (f || s) {
        const yaw = this.g.cam.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = -fz, rz = fx;
        const len = Math.hypot(f, s);
        const sp = 3.3 * def.speed * dt;
        mx = ((fx * f + rx * s) / len) * sp;
        mz = ((fz * f + rz * s) / len) * sp;
        this.heading = Math.atan2(mx, mz);
      }
    }

    const step = (axis, delta) => {
      if (!delta) return;
      const prev = this.pos[axis];
      this.pos[axis] += delta;
      if (axis === 'x') {
        const onLedge = this.pos.y > LAYOUT.ledge.top - 0.4;
        const bound = onLedge ? LAYOUT.ledge.maxX - this.radius : LAYOUT.boundX;
        this.pos.x = Math.max(-bound, Math.min(bound, this.pos.x));
      } else this.pos.z = Math.max(LAYOUT.minZ, Math.min(LAYOUT.maxZ, this.pos.z));
      const c = this.hit();
      if (!c) return false;
      const i = axis === 'x' ? 0 : 2;
      // 贴到离自己近的一侧边缘，这样下落时刚激活的碰撞体不会把人卡死
      const nearMin = this.pos[axis] - c.min[i] < c.max[i] - this.pos[axis];
      this.pos[axis] = nearMin ? c.min[i] - this.radius : c.max[i] + this.radius;
      if (this.hit()) this.pos[axis] = prev;
      this.blockedBy = c.name;
      if (c.name === 'tunnel' && axis === 'z' && delta < 0) this.g.onTunnelBlocked?.();
      return true;
    };
    const blockedX = step('x', mx);
    const blockedZ = step('z', mz);
    this.moving = (mx !== 0 || mz !== 0) && !(blockedX && blockedZ);
    this.vel.set(this.moving ? mx / dt : 0, 0, this.moving ? mz / dt : 0);

    if (!this.flying) {
      const ground = this.groundHeight();
      if (this.pos.y > ground + 0.001) {
        this.velY -= 24 * dt;
        const ny = this.pos.y + this.velY * dt;
        if (ny > ground + 0.001) this.pos.y = ny;
        else {
          if (this.velY < -3) this.landed = true;
          this.velY = 0;
          this.pos.y = ground;
        }
      } else {
        this.velY = 0;
        this.pos.y = ground;
      }
    }

    // 表现层：体型渐变、走路起伏、朝向
    this.vis = damp(this.vis, this.displayScale, 5, dt);
    this.model.scale.setScalar(this.vis);
    const turn = this.heading - this.yaw;
    this.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-12 * dt));
    this.obj.rotation.y = this.yaw;
    this.phase += dt * (this.moving ? (13 * def.speed) / (0.5 + 0.5 * def.scale) : 0);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const pose = this.rig.update(dt, {
      moving: this.moving, phase: this.phase, vis: this.vis, velY: this.velY, climb: this.climbing,
      grounded: !this.flying && this.pos.y <= this.groundHeight() + 0.001,
      velX: this.vel.x * cy - this.vel.z * sy, velZ: this.vel.x * sy + this.vel.z * cy, landed: this.landed,
      jumped: this.jumped,
    });
    this.landed = false;
    this.jumped = false;
    const bob =this.moving ? Math.abs(Math.sin(this.phase)) * 0.035 : Math.sin(this.phase) * 0.006;
    this.model.position.y = bob * this.vis;
    this.model.rotation.z = -Math.sin(this.phase * 0.5) * 0.035 * pose.move;
    const lean = (this.moving ? 0.06 : 0) - pose.up * 0.05 + pose.down * 0.08;
    this.obj.rotation.x = damp(this.obj.rotation.x, lean, 8, dt);
    this.obj.position.copy(this.pos);
  }

  jump() {
    if (this.flying || this.pos.y > this.groundHeight() + 0.001) return false;
    this.velY = 5;
    this.pos.y += 0.002;
    this.jumped = true;
    this.g.audio.play('jump');
    return true;
  }

  focus(out) {
    return out.set(this.pos.x, this.pos.y + ALICE_HEIGHT * this.vis * 0.62, this.pos.z);
  }
}
