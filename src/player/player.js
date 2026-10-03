import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 歩ける範囲（教室・廊下・扉の通路） */
export function makeRooms(ROOM) {
  return [
    { minX: ROOM.xMin + 0.32, maxX: ROOM.xMax - 0.32, minZ: ROOM.zMin + 0.32, maxZ: ROOM.zMax - 0.32 },
    { minX: ROOM.xMin - 3.3, maxX: ROOM.xMin - 0.25, minZ: ROOM.zMin - 0.6, maxZ: ROOM.zMax + 1.0 },
    { minX: ROOM.xMin - 0.6, maxX: ROOM.xMin + 0.35, minZ: 0.85, maxZ: 1.75 },  // 扉の通路
  ];
}

/**
 * 一人称移動。
 *  WASD / 矢印 ＝ 歩く、Shift ＝ 小走り、C ＝ しゃがむ
 *  マウス ＝ 視点（クリックでロック、Esc で解除）
 *  E ＝ 近くの物・人に話しかける
 */
export class Player {
  constructor(camera, {
    dom = null, colliders = [], rooms = [], eye = 1.62, radius = 0.27,
    onInteract = null, onLockChange = null, sound = null,
  } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.rooms = rooms;
    this.radius = radius;
    this.eye = eye;
    this.eyeTarget = eye;
    this.onInteract = onInteract;
    this.onLockChange = onLockChange;
    this.sound = sound;

    this.pos = new THREE.Vector3(0.6, 0, 1.6);
    this.vel = new THREE.Vector3();
    this.yaw = 0;           // 黒板（-Z）の方を向く
    this.pitch = -0.05;
    this.enabled = false;
    this.locked = false;
    this.keys = new Set();
    this.bob = 0;
    this.stepPhase = 0;
    this.crouch = 0;
    this.sprinting = false;
    this.interactables = [];
    this.focus = null;
    this.touchMove = null;
    this.touchLook = null;
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this._bind();
  }

  /* ── 入力 ── */
  _bind() {
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'e' && !e.repeat) { e.preventDefault(); this.tryInteract(); }
      if ([' ', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this._onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
      }
    };
    this._onMouseDown = (e) => {
      if (!this.enabled || this.mobile) return;
      if (e.target.closest('button,a,input,textarea,select,label,.panel,#chat,.ui')) return;
      this.dragging = true;
      if (!this.locked && this.dom) this.requestLock();
    };
    this._onMouseUp = () => { this.dragging = false; };
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    };
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() { this.dom?.requestPointerLock?.(); }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  enable(v = true) {
    this.enabled = v;
    if (!v) { this.keys.clear(); this.vel.set(0, 0, 0); this.exitLock(); }
  }

  /** 位置・向きを直接指定（カメラプリセット用） */
  teleport(x, z, yaw = this.yaw, pitch = this.pitch) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
  }

  tryInteract() {
    if (this.focus) this.onInteract?.(this.focus);
  }

  /** 調べられる物を探す（前方・距離優先） */
  _updateFocus() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const eye = this.camera.position;
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      if (it.disabled) continue;
      const p = typeof it.getPos === 'function' ? it.getPos() : it.pos;
      const d = p.distanceTo(eye);
      if (d > (it.range || 2.2)) continue;
      const dir = new THREE.Vector3().subVectors(p, eye).normalize();
      const dot = dir.dot(fwd);
      if (dot < 0.55 && d > 1.15) continue;          // 視線に入っていない遠い物は除外
      const score = d * (1.25 - dot) - (it.bonus || 0);
      if (score < bestD) { bestD = score; best = it; }
    }
    this.focus = best;
    return best;
  }

  /* ── 当たり判定 ── */
  _resolve(p) {
    const r = this.radius;
    for (const c of this.colliders) {
      const nx = clamp(p.x, c.minX, c.maxX);
      const nz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-7) {
        const d = Math.sqrt(d2), push = r - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
      } else {
        const l = p.x - c.minX, rr = c.maxX - p.x, b = p.z - c.minZ, t = c.maxZ - p.z;
        const m = Math.min(l, rr, b, t);
        if (m === l) p.x = c.minX - r;
        else if (m === rr) p.x = c.maxX + r;
        else if (m === b) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      }
    }
  }

  /** 歩ける範囲の外に出たら押し戻す */
  _clampRooms(p) {
    if (!this.rooms.length) return;
    for (const r of this.rooms) {
      if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ) return;
    }
    let best = null, bd = Infinity;
    for (const r of this.rooms) {
      const cx = clamp(p.x, r.minX, r.maxX), cz = clamp(p.z, r.minZ, r.maxZ);
      const d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      if (d < bd) { bd = d; best = { cx, cz }; }
    }
    p.x = best.cx; p.z = best.cz;
  }

  update(dt) {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('arrowup')) fz -= 1;
    if (k.has('s') || k.has('arrowdown')) fz += 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    if (this.touchMove) { fx += this.touchMove.x; fz += this.touchMove.y; }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }

    this.sprinting = k.has('shift') && len > 0;
    const wantCrouch = k.has('c') || k.has('control');
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 8);
    this.eyeTarget = this.eye - this.crouch * 0.52;

    const speed = (this.sprinting ? 3.15 : 1.55) * (1 - this.crouch * 0.45);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // three のカメラは -Z を向く。yaw=0 で -Z、右が +X。
    //   前方 forward = (-sin, -cos)／右 right = (cos, -sin)
    //   W は fz=-1（前）、D は fx=+1（右）
    const wx = fx * cos + fz * sin;
    const wz = fz * cos - fx * sin;

    const accel = len > 0 ? 16 : 12;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const p = new THREE.Vector3(nx, 0, nz);
    this._resolve(p);
    this._clampRooms(p);
    this.pos.x = p.x; this.pos.z = p.z;

    // 頭の上下動（歩行）
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.stepPhase += moving * dt * (this.sprinting ? 3.4 : 2.6);
    const bobY = moving > 0.15 ? Math.sin(this.stepPhase * 2) * 0.032 * (this.sprinting ? 1.5 : 1) : 0;
    const bobX = moving > 0.15 ? Math.cos(this.stepPhase) * 0.014 : 0;
    if (moving > 0.4 && Math.sin(this.stepPhase * 2) > 0.985) this.sound?.step?.(this.sprinting);

    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 10);
    this.camera.position.set(this.pos.x + bobX, this.eye + bobY, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = bobX * 0.35;

    this._updateFocus();
    return this.focus;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
