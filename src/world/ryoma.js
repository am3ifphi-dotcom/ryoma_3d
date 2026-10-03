import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { crossSprite } from './textures.js';
import { buildSkeleton, computeSkinWeights, Rig, POSES } from './rig.js';

const TARGET_HEIGHT = 1.72;

/** 接地面の影（円形グラデーション） */
export function contactShadowTexture() {
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

/**
 * GLB の単一メッシュに骨を仕込む（非同期・進捗付き）
 *  - 形状を「身長1.72m・足元y=0・水平中央0」に正規化（ジオメトリに焼き込む）
 *  - 19本のボーンを生成し、距離ベースでウェイトを自動計算
 *  - SkinnedMesh に差し替える（元メッシュは予備として残す）
 */
/** 形状を「身長1.72m・足元y=0・水平中心0」に正規化する（ジオメトリに焼き込む） */
export function normalizeModel(model) {
  model.updateMatrixWorld(true);
  let src = null;
  model.traverse((o) => { if (o.isMesh && !src) src = o; });
  if (!src) throw new Error('メッシュが見つかりません');
  const geo = src.geometry;
  geo.applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const s = TARGET_HEIGHT / Math.max(1e-4, bb.max.y - bb.min.y);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const b2 = geo.boundingBox;
  const cx = (b2.min.x + b2.max.x) / 2, cz = (b2.min.z + b2.max.z) / 2;
  geo.translate(-cx, -b2.min.y, -cz);
  geo.computeBoundingSphere();
  src.position.set(0, 0, 0);
  src.rotation.set(0, 0, 0);
  src.scale.set(1, 1, 1);
  src.castShadow = true;
  src.receiveShadow = true;
  src.frustumCulled = false;
  return src;
}

export async function prepareRig(model, onProgress = () => {}) {
  const src = normalizeModel(model);
  const geo = src.geometry;

  // ── 骨とウェイト ──
  const built = buildSkeleton();
  const iter = computeSkinWeights(geo);
  for (;;) {
    const step = iter.next();
    if (step.done) break;
    onProgress(step.value);
    await new Promise((r) => setTimeout(r, 0)); // 画面を止めない
  }

  // ── SkinnedMesh に差し替え ──
  const skinned = new THREE.SkinnedMesh(geo, src.material);
  skinned.name = 'ryoma_skinned';
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  src.parent.add(skinned);
  src.parent.add(built.root);        // ボーンも同じ親に入れないと matrixWorld が更新されない
  src.visible = false;
  skinned.updateMatrixWorld(true);
  built.root.updateMatrixWorld(true);
  skinned.bind(built.skeleton, skinned.matrixWorld);

  const rig = new Rig(built);
  return { skinned, plain: src, rig, boneRoot: built.root, skeleton: built.skeleton };
}

export class Ryoma {
  /**
   * @param {THREE.Object3D} model 元メッシュ（予備）
   * @param {object} opts { position, rig, skinned, plain }
   */
  constructor(model, { position = new THREE.Vector3(0.55, 0, -2.75), rig = null, skinned = null, plain = null } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'ryoma';
    this.body = new THREE.Group();
    this.root.add(this.body);

    // 念のため：正規化されていなければここで合わせる（静止モデルの保険）
    try {
      const bb = new THREE.Box3().setFromObject(model);
      const h = bb.max.y - bb.min.y;
      if (Math.abs(h - TARGET_HEIGHT) > 0.05) normalizeModel(model);
    } catch { /* */ }

    this.body.add(model);            // plain / skinned / ボーン はこの中に入っている
    this.model = model;
    this.plain = plain || model;
    this.skinned = skinned;
    this.rig = rig;
    this.useRig = !!rig;
    this.plain.visible = !this.useRig;
    if (skinned) skinned.visible = this.useRig;

    this.height = TARGET_HEIGHT;
    this.root.position.copy(position);
    // モデルは +X が正面。+Z（教室の後ろ・プレイヤー側）を向かせる
    this.baseRotation = -Math.PI / 2;
    this.flipped = false;
    this.root.rotation.y = this.baseRotation;

    // 頭上あたり（吹き出しのアンカー）
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, TARGET_HEIGHT * 1.02, 0);
    this.root.add(this.anchor);

    // 接地影
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.root.add(shadow);
    this.contactShadow = shadow;

    this.t = 0;
    this.talkUntil = 0;
    this.talkEnergy = 0;
    this.excite = 0;
    this.baseY = 0;
    this.lookAmount = 1;
    this._pose = 'rest';
  }

  /** リグの ON/OFF（OFF ならスキャンそのままの静止モデル） */
  setRigEnabled(v) {
    this.useRig = v && !!this.rig;
    if (this.skinned) this.skinned.visible = this.useRig;
    this.plain.visible = !this.useRig;
  }

  setFacing(deg) { this.facingOffset = (deg || 0) * Math.PI / 180; this._applyRot(); }
  flip(v) { this.flipped = v ?? !this.flipped; this._applyRot(); }
  _applyRot() {
    this.root.rotation.y = this.baseRotation + (this.facingOffset || 0) + (this.flipped ? Math.PI : 0);
  }

  /** 話しはじめ（秒数ぶん身振りを強める） */
  speak(seconds = 2.2, energy = 1) {
    this.talkUntil = Math.max(this.talkUntil, this.t + seconds);
    this.talkEnergy = Math.max(this.talkEnergy, energy);
    this.rig?.speak(seconds);
    if (energy > 1.1) this.rig?.playOnce(POSES.honshitsu, 1.1, 0.25);
  }

  /** 単発モーション */
  motion(name, hold = 1.8) {
    if (!this.rig || !POSES[name]) return false;
    this._pose = name;
    this.rig.playOnce(POSES[name], hold, 0.35);
    return true;
  }
  /** ポーズを固定（'rest' で戻す） */
  hold(name) {
    if (!this.rig) return;
    this._pose = name;
    this.rig.play([{ pose: POSES[name] || POSES.rest, dur: 0.45 }], { loop: true });
  }
  get pose() { return this._pose; }

  /** ✝本質✝ が出たときの盛り上がり */
  cheer() {
    this.excite = Math.min(1.6, this.excite + 1);
    this.rig?.playOnce(POSES.honshitsu, 1.3, 0.22);
  }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    const talking = t < this.talkUntil;
    this.talkEnergy = Math.max(0, this.talkEnergy - dt * 0.9);
    this.excite = Math.max(0, this.excite - dt * 1.1);

    // 呼吸・話すときの上下動
    const breath = Math.sin(t * 1.5) * 0.006;
    const talkBob = talking ? Math.abs(Math.sin(t * 11)) * 0.012 * (0.5 + this.talkEnergy) : 0;
    const ex = this.excite * (Math.abs(Math.sin(t * 17)) * 0.02 + Math.sin(t * 3.1) * 0.006);
    this.body.position.y = this.baseY + breath + talkBob + ex;
    this.body.rotation.z = Math.sin(t * 0.7) * 0.006;

    if (this.rig) {
      this.rig.update(dt);
      if (camera) this.rig.applyLook(camera.position, this.lookAmount);
    }
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
      (e) => { if (e.total) onProgress?.(e.loaded / e.total); },
      (err) => reject(err)
    );
  });
}
