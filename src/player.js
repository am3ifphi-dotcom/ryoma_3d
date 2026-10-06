// First-person controller: pointer-lock mouse look, WASD, run, head-bob, AABB collisions, touch fallback.
import * as THREE from 'three';
import { sfx } from './audio/sfx.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Player {
  constructor(camera, domElement, { colliders = [], bounds, eyeHeight = 1.6, radius = 0.28 } = {}) {
    this.camera = camera;
    this.dom = domElement;
    this.colliders = colliders;
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.eyeHeight = eyeHeight;
    this.radius = radius;
    this.position = new THREE.Vector3(3.95, 0, 3.3); // aisle between the last desk column and the corridor wall
    this.velocity = new THREE.Vector3();
    this.yaw = 0.5; // yaw 0 = looking down -z (towards the board)
    this.pitch = -0.03;
    this.keys = new Set();
    this.locked = false;
    this.enabled = true; // movement enabled (false during dialogue)
    this.sensitivity = 0.0022;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepTimer = 0;
    this.speed = 0;
    this.extraColliders = []; // dynamic (e.g. the character)
    this.touch = { move: null, look: null, moveVec: new THREE.Vector2() };
    this.onInteract = null;
    this.camera.rotation.order = 'YXZ';
    this._bind();
  }

  _bind() {
    const dom = this.dom;
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; document.body.classList.toggle('locked', this.locked); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.35, 1.35);
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.onInteract?.('e'); }
      if (/^Digit[1-4]$/.test(e.code)) this.onInteract?.(Number(e.code.slice(5)));
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // ---- touch controls ----
    const isTouch = 'ontouchstart' in window;
    if (isTouch) document.body.classList.add('touch');
    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const left = t.clientX < window.innerWidth * 0.45;
        if (left && !this.touch.move) this.touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY };
        else if (!left && !this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      this._updateJoystick();
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move && t.identifier === this.touch.move.id) {
          const dx = t.clientX - this.touch.move.x0, dy = t.clientY - this.touch.move.y0;
          const l = Math.hypot(dx, dy), max = 60;
          const k = l > max ? max / l : 1;
          this.touch.moveVec.set((dx * k) / max, (dy * k) / max);
        } else if (this.touch.look && t.identifier === this.touch.look.id) {
          this.yaw -= (t.clientX - this.touch.look.x) * 0.0045;
          this.pitch = clamp(this.pitch - (t.clientY - this.touch.look.y) * 0.0045, -1.35, 1.35);
          this.touch.look.x = t.clientX; this.touch.look.y = t.clientY;
        }
      }
      this._updateJoystick();
    }, { passive: true });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move && t.identifier === this.touch.move.id) { this.touch.move = null; this.touch.moveVec.set(0, 0); }
        if (this.touch.look && t.identifier === this.touch.look.id) this.touch.look = null;
      }
      this._updateJoystick();
    };
    dom.addEventListener('touchend', endTouch);
    dom.addEventListener('touchcancel', endTouch);
  }

  _updateJoystick() {
    const j = document.getElementById('joystick');
    if (!j) return;
    if (this.touch.move) {
      j.style.display = 'block';
      j.style.left = `${this.touch.move.x0 - 60}px`; j.style.top = `${this.touch.move.y0 - 60}px`;
      j.firstElementChild.style.transform = `translate(${this.touch.moveVec.x * 40}px, ${this.touch.moveVec.y * 40}px)`;
    } else j.style.display = 'none';
  }

  lock() { this.dom.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => this.dom.requestPointerLock()); }

  /** Smoothly aim the camera at a world point (used when a conversation starts). */
  lookAt(target, dt, strength = 4) {
    const d = target.clone().sub(this.camera.position);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-strength * dt);
    this.yaw += dy * k;
    this.pitch += (pitch - this.pitch) * k;
  }

  _collides(x, z) {
    const r = this.radius;
    const b = this.bounds;
    if (b && (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ)) return true;
    for (const c of this.colliders) if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    for (const c of this.extraColliders) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true; }
    return false;
  }

  update(dt) {
    const k = this.keys;
    let fwd = 0, side = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) side += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) side -= 1;
      fwd -= this.touch.moveVec.y; side += this.touch.moveVec.x;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const maxSpeed = run ? 3.6 : 1.9;
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    // camera-relative direction
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dirX = (-sin) * fwd + cos * side;
    const dirZ = (-cos) * fwd - sin * side;
    const targetVx = dirX * maxSpeed, targetVz = dirZ * maxSpeed;
    const accel = len > 0 ? 12 : 10;
    const a = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetVx - this.velocity.x) * a;
    this.velocity.z += (targetVz - this.velocity.z) * a;

    // axis-separated collision
    // if we are already inside something (bad spawn, moved collider…) never block → always possible to escape
    const stuck = this._collides(this.position.x, this.position.z);
    const nx = this.position.x + this.velocity.x * dt;
    if (stuck || !this._collides(nx, this.position.z)) this.position.x = nx; else this.velocity.x = 0;
    const nz = this.position.z + this.velocity.z * dt;
    if (stuck || !this._collides(this.position.x, nz)) this.position.z = nz; else this.velocity.z = 0;

    // head bob + footsteps
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.speed > 0.2;
    const freq = run ? 2.9 : 1.9;
    if (moving) {
      const prev = this.bobPhase;
      this.bobPhase += dt * freq * Math.PI * 2;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI)) sfx.footstep(run);
    }
    this.bobAmount += ((moving ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 6);
    const bobY = Math.sin(this.bobPhase) * 0.028 * this.bobAmount * (run ? 1.4 : 1);
    const bobX = Math.cos(this.bobPhase * 0.5) * 0.016 * this.bobAmount;
    const idleY = Math.sin(performance.now() * 0.0011) * 0.004;

    this.camera.position.set(this.position.x + bobX * cos, this.eyeHeight + bobY + idleY, this.position.z - bobX * sin);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase * 0.5) * 0.004 * this.bobAmount);
  }
}
