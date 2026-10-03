import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { crossSprite } from './textures.js';

const TARGET_HEIGHT = 1.72;

/** 接地面の影（円形グラデーション） */
function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 8, 128, 128, 126);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Ryoma {
  constructor(model, { position = new THREE.Vector3(0.5, 0, -2.75), flip = false } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'ryoma';
    this.model = model;
    this.root.add(model);

    // 正規化：身長 TARGET_HEIGHT、足元 y=0、水平中心を 0 に
    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = bbox.getCenter(new THREE.Vector3());
    const s = TARGET_HEIGHT / Math.max(size.y, 0.001);
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -bbox.min.y * s, -center.z * s);

    this.height = TARGET_HEIGHT;
    this.flipped = flip;
    this.baseRotation = flip ? Math.PI : 0;
    model.rotation.y = this.baseRotation;
    this.root.position.copy(position);

    // 頭上あたり（吹き出しのアンカー）
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, TARGET_HEIGHT * 0.98, 0.05);
    this.root.add(this.anchor);

    // 接地影
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    this.root.add(shadow);
    this.contactShadow = shadow;

    this.t = 0;
    this.talkUntil = 0;
    this.talkEnergy = 0;
    this.excite = 0;
    this.lookTarget = null;
    this._lookY = 0;
  }

  flip(v) {
    this.flipped = v ?? !this.flipped;
    this.baseRotation = this.flipped ? Math.PI : 0;
  }

  /** 話しはじめ（秒数ぶん身振りを強める） */
  speak(seconds = 2.2, energy = 1) {
    this.talkUntil = Math.max(this.talkUntil, this.t + seconds);
    this.talkEnergy = Math.max(this.talkEnergy, energy);
  }

  /** ✝本質✝ が出たときの盛り上がり */
  cheer() { this.excite = Math.min(1.6, this.excite + 1); }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    const talking = t < this.talkUntil;
    this.talkEnergy = Math.max(0, this.talkEnergy - dt * 0.9);
    this.excite = Math.max(0, this.excite - dt * 1.1);

    const m = this.model;
    // 呼吸
    const breath = Math.sin(t * 1.5) * 0.006;
    // 話すときの細かい上下動
    const talkBob = talking
      ? Math.abs(Math.sin(t * 11)) * 0.014 * (0.5 + this.talkEnergy)
      : 0;
    // 興奮（✝本質✝）
    const ex = this.excite * (Math.abs(Math.sin(t * 17)) * 0.02 + Math.sin(t * 3.1) * 0.006);

    m.position.y = (this.baseY ?? (this.baseY = m.position.y)) + breath + talkBob + ex;
    m.rotation.z = Math.sin(t * 0.7) * 0.008 + (this.excite ? Math.sin(t * 9) * 0.012 : 0);
    m.rotation.x = Math.sin(t * 0.53 + 1) * 0.005;

    // カメラの方を（気持ちだけ）向く
    if (camera) {
      const dx = camera.position.x - this.root.position.x;
      const dz = camera.position.z - this.root.position.z;
      let want = Math.atan2(dx, dz) - this.baseRotation;
      while (want > Math.PI) want -= Math.PI * 2;
      while (want < -Math.PI) want += Math.PI * 2;
      const clamp = 0.42;
      want = Math.max(-clamp, Math.min(clamp, want));
      this._lookY += (want - this._lookY) * Math.min(1, dt * 2.4);
    }
    m.rotation.y = this.baseRotation + this._lookY + Math.sin(t * 0.41) * 0.02;

    this.particles?.update(dt);
  }
}

/** ✝ のパーティクル */
export class CrossBurst {
  constructor(scene, count = 44) {
    this.scene = scene;
    this.tex = crossSprite();
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.userData = { life: 0, max: 1, vel: new THREE.Vector3(), spin: 0 };
      scene.add(sp);
      this.pool.push(sp);
    }
  }

  burst(origin, n = 12) {
    let spawned = 0;
    for (const sp of this.pool) {
      if (spawned >= n) break;
      if (sp.visible) continue;
      sp.visible = true;
      sp.position.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.35) * 0.4,
        (Math.random() - 0.5) * 0.4
      ));
      const sc = 0.1 + Math.random() * 0.16;
      sp.scale.setScalar(sc);
      sp.userData.vel.set((Math.random() - 0.5) * 0.35, 0.45 + Math.random() * 0.65, (Math.random() - 0.5) * 0.3);
      sp.userData.max = 1.1 + Math.random() * 0.9;
      sp.userData.life = sp.userData.max;
      sp.userData.size = sc;
      sp.material.opacity = 0.95;
      spawned += 1;
    }
  }

  update(dt) {
    for (const sp of this.pool) {
      if (!sp.visible) continue;
      const u = sp.userData;
      u.life -= dt;
      if (u.life <= 0) { sp.visible = false; sp.material.opacity = 0; continue; }
      sp.position.addScaledVector(u.vel, dt);
      u.vel.y -= dt * 0.25;
      u.vel.x *= 1 - dt * 0.6;
      const k = u.life / u.max;
      sp.material.opacity = Math.min(1, k * 1.4) * 0.95;
      sp.scale.setScalar(u.size * (0.7 + (1 - k) * 0.9));
    }
  }
}

/** GLB を読む */
export function loadRyoma(url, onProgress) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m) continue;
            m.side = THREE.FrontSide;
            if (m.map) { m.map.anisotropy = 8; m.map.needsUpdate = true; }
            if (m.metalnessRoughnessTexture) m.metalnessRoughnessTexture.anisotropy = 8;
            if (m.normalTexture) m.normalTexture.anisotropy = 8;
            m.envMapIntensity = 0.85;
          }
        });
        resolve(model);
      },
      (e) => {
        if (e.total) onProgress?.(e.loaded / e.total);
      },
      (err) => reject(err)
    );
  });
}
