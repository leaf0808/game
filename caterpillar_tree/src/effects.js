import * as THREE from 'three';
import { glowTexture, mulberry } from './lib.js';

// 场景特效：烟圈、粒子、蘑菇晃动。全部是临时网格，用完即销毁。
export class Effects {
  constructor(g) {
    this.g = g;
    this.items = [];
    this.wobbles = new Map();
    this.rnd = mulberry(77);
    this.tex = glowTexture();
    this.ringGeo = new THREE.TorusGeometry(0.12, 0.026, 6, 24);
  }

  update(dt, t) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.t += dt;
      item.tick(item, dt);
      if (item.t >= item.life) {
        item.obj.removeFromParent();
        item.dispose?.();
        this.items.splice(i, 1);
      }
    }
    this.wobbles.forEach((w, obj) => {
      w.k = Math.max(0, w.k - dt * 1.6);
      if (w.k <= 0) {
        obj.scale.copy(w.base);
        this.wobbles.delete(obj);
        return;
      }
      const s = 1 + Math.sin(t * 16) * 0.07 * w.k;
      obj.scale.set(w.base.x * s, w.base.y * (2 - s), w.base.z * s);
    });
  }

  smoke(pos, { color = 0xcfeef7, rise = 0.38, size = 1, flat = true, life = 2.2, drift = null } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.copy(pos);
    if (flat) ring.rotation.set(Math.PI / 2 + (this.rnd() - 0.5) * 0.5, 0, (this.rnd() - 0.5) * 0.5);
    else ring.quaternion.copy(this.g.camera.quaternion);
    const side = (this.rnd() - 0.5) * 0.25;
    this.g.scene.add(ring);
    this.items.push({
      obj: ring, t: 0, life,
      tick: (it, dtc) => {
        it.obj.position.y += rise * dtc;
        it.obj.position.x += side * dtc;
        if (drift) it.obj.position.addScaledVector(drift, dtc);
        const k = it.t / it.life;
        it.obj.scale.setScalar(size * (0.35 + k * 1.5));
        it.obj.material.opacity = 0.5 * (1 - k);
      },
      dispose: () => mat.dispose(),
    });
    return ring;
  }

  // 一串烟圈拼出笑脸（FN05 彩蛋）。
  smiley(center) {
    const right = new THREE.Vector3().setFromMatrixColumn(this.g.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.g.camera.matrixWorld, 1);
    const points = [[-0.34, 0.26], [0.34, 0.26]];
    for (let i = 0; i <= 4; i += 1) {
      const a = Math.PI * (1.17 + (i / 4) * 0.66);
      points.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.1]);
    }
    points.forEach(([x, y], index) => {
      const p = center.clone().addScaledVector(right, x).addScaledVector(up, y);
      setTimeout(() => this.smoke(p, { rise: 0.12, size: 0.75, flat: false, life: 3.4 }), index * 90);
    });
  }

  burst(pos, color, { count = 18, speed = 1.6, size = 0.16, life = 0.8, gravity = 2.4 } = {}) {
    const positions = new Float32Array(count * 3);
    const velocity = [];
    for (let i = 0; i < count; i += 1) {
      positions.set([pos.x, pos.y, pos.z], i * 3);
      const v = new THREE.Vector3(this.rnd() - 0.5, this.rnd() * 0.8 + 0.2, this.rnd() - 0.5).normalize().multiplyScalar(speed * (0.5 + this.rnd()));
      velocity.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    this.g.scene.add(points);
    this.items.push({
      obj: points, t: 0, life,
      tick: (it, dtc) => {
        const attr = it.obj.geometry.attributes.position;
        for (let i = 0; i < count; i += 1) {
          velocity[i].y -= gravity * dtc;
          attr.setXYZ(i, attr.getX(i) + velocity[i].x * dtc, attr.getY(i) + velocity[i].y * dtc, attr.getZ(i) + velocity[i].z * dtc);
        }
        attr.needsUpdate = true;
        it.obj.material.opacity = 1 - it.t / it.life;
      },
      dispose: () => { geo.dispose(); mat.dispose(); },
    });
  }

  wobble(obj, strength = 1) {
    const base = this.wobbles.get(obj)?.base || obj.scale.clone();
    this.wobbles.set(obj, { base, k: strength });
  }
}
