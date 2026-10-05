// Layered procedural animation for the auto-rigged character.
//
//  final pose =  stance (contrapposto base, state dependent)
//             +  idle noise (breathing, sway, head drift)
//             ⊕  gesture (keyframed clips, blended in/out per bone)
//             →  per-bone damped springs (follow-through / overshoot)
//             +  look-at (head / neck / chest, own smoothing)
//             +  talking micro-motion
//             +  turn-in-place foot shuffle
//
// All angles are in degrees in the model axes (see rig.js).

import * as THREE from 'three';
import { GESTURES } from './gestures.js';

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// cheap layered "noise": sum of incommensurate sines, in [-1, 1]
function noise1(t, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.31 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.73 + seed * 0.3) * 0.2
  );
}

// per-bone spring parameters [frequency Hz, damping ratio]
const SPRING = {
  default: [3.0, 0.9],
  hips: [2.2, 1.0], spine: [2.0, 1.0], chest: [2.2, 1.0], upperChest: [2.4, 0.95], neck: [3.0, 0.85],
  head: [3.2, 0.75],
  shoulderR: [3.0, 0.8], shoulderL: [3.0, 0.8],
  upperArmR: [2.8, 0.7], upperArmL: [2.8, 0.7],
  lowerArmR: [3.4, 0.6], lowerArmL: [3.4, 0.6],
  handR: [4.5, 0.5], handL: [4.5, 0.5], fingersR: [5, 0.6], fingersL: [5, 0.6],
  upperLegR: [3.0, 0.9], upperLegL: [3.0, 0.9], lowerLegR: [3.5, 0.8], lowerLegL: [3.5, 0.8],
  footR: [4, 0.8], footL: [4, 0.8],
};

class Spring3 {
  constructor(f, z) { this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); this.set(f, z); }
  set(f, z) { this.k = Math.pow(2 * Math.PI * f, 2); this.c = 2 * z * Math.sqrt(this.k); }
  step(target, dt) {
    // semi-implicit Euler with sub-steps for stability
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v.x += (this.k * (target.x - this.x.x) - this.c * this.v.x) * h;
      this.v.y += (this.k * (target.y - this.x.y) - this.c * this.v.y) * h;
      this.v.z += (this.k * (target.z - this.x.z) - this.c * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
  }
  snap(target) { this.x.copy(target); this.v.set(0, 0, 0); }
}

// ----------------------------------------------------------------------------
// Stances (base poses). Values: bone → [rx, ry, rz] in degrees.
// side: which leg carries the weight.
// ----------------------------------------------------------------------------
// Right hand lives in the trouser pocket (solved numerically, scripts/solve-pose.mjs):
// wrist ≈ (0.044, 0.038, 0.106), fingertips inside the thigh.
const POCKET_R = { upperArmR: [6.1, 25.4, -5], lowerArmR: [0, 16.8, 40.3], handR: [-1.7, 0, -13.1], fingersR: [40, 0, -10] };
const POCKET_L = { upperArmL: [-3.2, 10.4, 4.1], lowerArmL: [0, -63.6, 34.8], handL: [-4.1, 0, -18.8], fingersL: [-40, 0, -10] };

function stance(kind, side) {
  const s = side; // +1 = weight on the right leg
  const p = {
    // casual: hips pushed to the weighted side, a bit of slouch, chin slightly up
    hips: [2.2 * s, 0, -1],
    spine: [-1.4 * s, 3 * s, -1.5],
    chest: [-1.0 * s, 1 * s, -1.0],
    upperChest: [-0.6 * s, 0, -0.5],
    neck: [0, 0, 1],
    head: [1.5 * s, 0, 2],
    shoulderR: [1, 0, -2], shoulderL: [0, 0, -2],
    ...POCKET_R,
    upperArmL: [-9, 0, 8], lowerArmL: [0, -10, 36], handL: [0, 0, 10], fingersL: [-25, 0, 0],
    upperLegR: [0, 0, 0], lowerLegR: [0, 0, 0], footR: [0, 0, 0],
    upperLegL: [0, 0, 0], lowerLegL: [0, 0, 0], footL: [0, 0, 0],
  };
  // the free leg is relaxed: slightly bent, foot a bit out
  if (s > 0) { p.upperLegL = [3, 0, -2]; p.lowerLegL = [0, 0, 6]; p.footL = [0, 0, -4]; }
  else { p.upperLegR = [-3, 0, -2]; p.lowerLegR = [0, 0, 6]; p.footR = [0, 0, -4]; }

  if (kind === 'phone') {
    // looking down at the phone in the left hand, right hand in the pocket
    p.upperArmL = [-14, 6, 22];
    p.lowerArmL = [0, -22, 98];
    p.handL = [0, 0, 14];
    p.neck = [0, 6, -8];
    p.head = [3, 10, -24];
    p.upperChest = [-0.6 * s, 6, -4];
    p.chest[2] = -3;
  } else if (kind === 'talk') {
    // facing the player: phone lowered to the hip, right hand stays in the pocket until a gesture pulls it out
    p.upperArmL = [-9, 0, 10];
    p.lowerArmL = [0, -10, 42];
    p.handL = [0, 0, 10];
  } else if (kind === 'pockets') {
    Object.assign(p, POCKET_L);
    p.shoulderL = [-1, 0, -2];
  }
  return p;
}

const HIPS_POS_OFFSET = (side) => new THREE.Vector3(0.004, 0, 0.012 * side);

export class CharacterAnimator {
  /**
   * @param {Object} opts
   * @param {Object<string, THREE.Bone>} opts.bones
   * @param {THREE.Object3D} opts.root     outer group (world placement, yaw)
   * @param {THREE.Object3D} opts.model    inner group (model-space frame)
   */
  constructor({ bones, root, model }) {
    this.bones = bones;
    this.root = root;
    this.model = model;
    this.time = 0;
    this.state = 'phone'; // 'phone' | 'idle' | 'talk'
    this.side = 1;
    this.nextShift = 7;
    this.springs = {};
    this.targets = {};
    for (const name in bones) {
      const [f, z] = SPRING[name] || SPRING.default;
      this.springs[name] = new Spring3(f, z);
      this.targets[name] = new THREE.Vector3();
    }
    this.hipsSpring = new Spring3(2.0, 1.0);
    this.hipsTarget = new THREE.Vector3();
    this.hipsRest = bones.hips.position.clone();

    // gesture layer
    this.gesture = null; // { def, t, weight, fadingOut }
    this.gestureWeight = 0;
    this.gestureBoneTargets = {};
    this.queue = [];

    // look-at
    this.lookTarget = new THREE.Vector3();
    this.lookEnabled = false;
    this.lookWeight = 0; // smoothed
    this.lookYaw = new Spring3(1.6, 0.9); // x = yaw, y = pitch
    this.glanceTimer = 4;
    this.glance = 0; // 1 while glancing away
    this.glanceOffset = new THREE.Vector3();

    // body turn
    this.bodyYaw = root.rotation.y;
    this.targetBodyYaw = root.rotation.y;
    this.turning = false;
    this.turnPhase = 0;
    this.turnThreshold = 40;
    this.turnBlend = 0;

    // talking
    this.talking = false;
    this.talkEnergy = 0;

    // hands: 1 = out, 0 = in the pocket (shrinks the hand so it hides inside the thigh)
    this.pocket = { R: 1, L: 0 };
    this.face = null;

    // initial snap
    this._computeTargets(0);
    for (const n in this.springs) this.springs[n].snap(this.targets[n]);
    this.hipsSpring.snap(this.hipsTarget);

    this.onEmote = null; // callback(kind)
  }

  // ---- public API ----------------------------------------------------------
  setState(s) { if (this.state !== s) { this.state = s; } }
  setLookTarget(v, enabled = true) { this.lookTarget.copy(v); this.lookEnabled = enabled; }
  setTalking(b) { this.talking = b; }
  /** Make the body face `yawRad` (world yaw). The character turns with a foot shuffle if the delta is large. */
  faceYaw(yawRad, force = false) {
    this.targetBodyYaw = yawRad;
    if (force) this.turning = true;
  }
  playGesture(name, opts = {}) {
    const def = GESTURES[name];
    if (!def) { console.warn('unknown gesture', name); return; }
    this.gesture = { def, t: 0, speed: opts.speed || 1, hold: opts.hold ?? def.hold ?? 0, done: false };
  }
  stopGesture() { if (this.gesture) this.gesture.done = true; }
  get isGesturing() { return !!this.gesture && !this.gesture.done; }

  // ---- internals -------------------------------------------------------------
  _computeTargets(dt) {
    const t = this.time;
    const base = stance(this.state, this.side);

    // idle noise layer (additive)
    const breath = Math.sin(t * 2 * Math.PI * 0.21);
    const add = {
      chest: [0, 0, 1.2 * breath],
      upperChest: [0, 0, 0.8 * breath],
      shoulderR: [-0.8 * breath, 0, 0],
      shoulderL: [0.8 * breath, 0, 0],
      head: [2.0 * noise1(t * 0.35, 1), 3.5 * noise1(t * 0.3, 2), 1.6 * noise1(t * 0.4, 3)],
      neck: [0.6 * noise1(t * 0.35, 1), 1.0 * noise1(t * 0.3, 2), 0],
      spine: [0.8 * noise1(t * 0.2, 5), 1.0 * noise1(t * 0.15, 6), 0.5 * noise1(t * 0.25, 7)],
      hips: [0.5 * noise1(t * 0.2, 8), 0, 0],
      upperArmR: [0.8 * noise1(t * 0.3, 9), 0, 1.2 * noise1(t * 0.27, 10)],
      upperArmL: [0.8 * noise1(t * 0.3, 11), 0, 1.0 * noise1(t * 0.27, 12)],
      lowerArmR: [0, 0, 1.0 * noise1(t * 0.33, 13)],
      lowerArmL: [0, 0, 0.8 * noise1(t * 0.31, 16)],
      handR: [0, 0, 2.0 * noise1(t * 0.5, 14)],
      handL: [0, 0, 1.5 * noise1(t * 0.5, 15)],
    };
    // talking micro-motion
    if (this.talkEnergy > 0.01) {
      const e = this.talkEnergy;
      const n = Math.sin(t * 14.0) * 0.5 + Math.sin(t * 9.3) * 0.5;
      add.head[2] += (-2.0 * Math.abs(n) + 1.0) * e;
      add.head[0] += 1.2 * Math.sin(t * 5.1) * e;
      add.upperChest[2] += 0.6 * n * e;
      add.upperArmR[2] += 2.5 * Math.sin(t * 6.3) * e;
      add.lowerArmR[2] += 4.0 * Math.max(0, Math.sin(t * 6.3)) * e;
      add.lowerArmL[2] += 3.0 * Math.max(0, Math.sin(t * 5.2 + 1)) * e;
    }

    // gesture layer
    const g = this.gesture;
    let gw = 0;
    const gt = this.gestureBoneTargets;
    for (const k in gt) delete gt[k];
    if (g) {
      const def = g.def;
      const dur = def.duration;
      const total = dur + g.hold;
      if (!g.done) g.t += dt * g.speed;
      const fadeIn = clamp(g.t / 0.25, 0, 1);
      let fadeOut = 1;
      if (def.loop) {
        if (g.done) fadeOut = 0;
      } else if (g.t > total) {
        fadeOut = clamp(1 - (g.t - total) / 0.45, 0, 1);
        if (fadeOut <= 0) this.gesture = null;
      }
      if (g.done && !def.loop) fadeOut = Math.min(fadeOut, clamp(1 - (g.t - (g.doneAt ?? (g.doneAt = g.t))) / 0.35, 0, 1));
      gw = Math.min(fadeIn, fadeOut);
      if (g.done && gw <= 0) this.gesture = null;
      // sample the tracks
      const local = def.loop ? g.t % dur : Math.min(g.t, dur);
      for (const bone in def.tracks) {
        const keys = def.tracks[bone];
        let a = keys[0], b = keys[keys.length - 1];
        for (let i = 0; i < keys.length - 1; i++) {
          if (local >= keys[i][0] && local <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
        }
        let u = a === b ? 0 : (local - a[0]) / (b[0] - a[0]);
        if (!(u >= 0)) u = 0;
        u = easeInOut(clamp(u, 0, 1));
        gt[bone] = [lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
      }
      if (def.emote && !g.emoted && g.t > (def.emoteAt || 0)) { g.emoted = true; this.onEmote?.(def.emote); }
    }
    this.gestureWeight = gw;

    // pocket factor: the base pose has the right hand (and in 'pockets' both) in the pocket;
    // a non-additive gesture that drives the arm pulls it out.
    const inPocket = (side) => {
      const baseIn = side === 'R' ? true : this.state === 'pockets';
      if (!baseIn) return 0;
      const drives = g && !g.def.additive && (gt['upperArm' + side] || gt['lowerArm' + side]);
      return drives ? 1 - gw : 1;
    };
    this.pocketTarget = { R: inPocket('R'), L: inPocket('L') };

    // compose
    for (const name in this.bones) {
      const b = base[name] || [0, 0, 0];
      const a = add[name] || [0, 0, 0];
      let x = b[0] + a[0], y = b[1] + a[1], z = b[2] + a[2];
      const gv = gt[name];
      if (gv && gw > 0) {
        if (this.gesture.def.additive) { x += gv[0] * gw; y += gv[1] * gw; z += gv[2] * gw; }
        else { x = x * (1 - gw) + gv[0] * gw; y = y * (1 - gw) + gv[1] * gw; z = z * (1 - gw) + gv[2] * gw; }
      }
      this.targets[name].set(x, y, z);
    }

    // hips position (sway + gesture bounce)
    const hp = HIPS_POS_OFFSET(this.side);
    hp.x += 0.004 * noise1(t * 0.18, 20);
    hp.z += 0.005 * noise1(t * 0.14, 21);
    hp.y += 0.0015 * breath;
    if (gt.hipsY && gw > 0) hp.y += gt.hipsY[1] * gw;
    this.hipsTarget.copy(hp);
  }

  update(dt, playerPos) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;

    // weight shift events
    this.nextShift -= dt;
    if (this.nextShift <= 0 && !this.isGesturing) {
      this.side *= -1;
      this.nextShift = 6 + Math.random() * 8;
    }

    // talking energy smoothing
    this.talkEnergy += ((this.talking ? 1 : 0) - this.talkEnergy) * Math.min(1, dt * 6);

    // ---- body turn -----------------------------------------------------
    let dYaw = this.targetBodyYaw - this.bodyYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const dYawDeg = Math.abs(dYaw) / DEG;
    if (!this.turning && dYawDeg > this.turnThreshold) this.turning = true;
    if (this.turning) {
      const speed = 2.6; // rad/s
      const step = Math.sign(dYaw) * Math.min(Math.abs(dYaw), speed * dt * (0.35 + 0.65 * Math.min(1, dYawDeg / 25)));
      this.bodyYaw += step;
      this.turnPhase += dt * 3.4;
      if (dYawDeg < 2) { this.turning = false; this.bodyYaw = this.targetBodyYaw; }
    }
    this.root.rotation.y = this.bodyYaw;
    this.turnBlend += ((this.turning ? 1 : 0) - this.turnBlend) * Math.min(1, dt * 8);

    this._computeTargets(dt);

    // turn shuffle: alternate feet, counter-rotate the upper body a bit
    if (this.turnBlend > 0.001) {
      const ph = this.turnPhase * Math.PI;
      const sgn = Math.sign(dYaw || 1);
      const liftR = Math.max(0, Math.sin(ph)) * this.turnBlend;
      const liftL = Math.max(0, -Math.sin(ph)) * this.turnBlend;
      this.targets.upperLegR.z += -22 * liftR; this.targets.lowerLegR.z += 38 * liftR; this.targets.footR.z += -14 * liftR;
      this.targets.upperLegL.z += -22 * liftL; this.targets.lowerLegL.z += 38 * liftL; this.targets.footL.z += -14 * liftL;
      this.targets.upperLegR.y += -10 * sgn * liftR; this.targets.upperLegL.y += -10 * sgn * liftL;
      this.targets.upperChest.y += 10 * sgn * this.turnBlend; // head leads the turn
      this.targets.spine.y += 6 * sgn * this.turnBlend;
      this.targets.upperArmR.z += 6 * liftR; this.targets.upperArmL.z += 6 * liftL;
      this.hipsTarget.y += 0.006 * Math.abs(Math.sin(ph)) * this.turnBlend;
    }

    // ---- springs -----------------------------------------------------------
    for (const name in this.bones) {
      this.springs[name].step(this.targets[name], dt);
    }
    this.hipsSpring.step(this.hipsTarget, dt);

    // ---- look-at (head / neck / chest) -------------------------------------
    const lookOn = this.lookEnabled && !(this.gesture && this.gesture.def.noLook && this.gestureWeight > 0.5);
    this.lookWeight += ((lookOn ? 1 : 0) - this.lookWeight) * Math.min(1, dt * 3);
    const look = new THREE.Vector3();
    if (this.lookEnabled) {
      // target in model space; head position in model space
      const headWorld = new THREE.Vector3();
      this.bones.head.getWorldPosition(headWorld);
      const dir = this.model.worldToLocal(this.lookTarget.clone()).sub(this.model.worldToLocal(headWorld.clone()));
      // dir in model space: forward +X, up +Y, right +Z
      let yaw = Math.atan2(-dir.z, dir.x) / DEG;
      let pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) / DEG;
      yaw = clamp(yaw, -75, 75);
      pitch = clamp(pitch, -35, 30);
      look.set(yaw, pitch, 0);
    }
    // occasional glance away (natural eye-contact breaks)
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      if (this.glance === 0 && Math.random() < 0.6) {
        this.glance = 1;
        this.glanceOffset.set((Math.random() - 0.5) * 36, -4 - Math.random() * 10, 0);
        this.glanceTimer = 0.6 + Math.random() * 0.9;
      } else { this.glance = 0; this.glanceTimer = 3 + Math.random() * 6; }
    }
    const glanceNow = this.glance && !this.talking ? 1 : 0;
    const lt = new THREE.Vector3(look.x + this.glanceOffset.x * glanceNow, look.y + this.glanceOffset.y * glanceNow, 0).multiplyScalar(this.lookWeight);
    this.lookYaw.step(lt, dt);
    const ly = this.lookYaw.x.x, lp = this.lookYaw.x.y;
    // distribution: head 55%, neck 15%, upperChest 20%, chest 10% (yaw); pitch mostly head
    const dist = {
      head: [0, ly * 0.55, lp * 0.7],
      neck: [0, ly * 0.15, lp * 0.15],
      upperChest: [0, ly * 0.2, lp * 0.1],
      chest: [0, ly * 0.1, 0],
    };

    // ---- apply ------------------------------------------------------------
    for (const name in this.bones) {
      const s = this.springs[name].x;
      const d = dist[name] || [0, 0, 0];
      this.bones[name].rotation.set((s.x + d[0]) * DEG, (s.y + d[1]) * DEG, (s.z + d[2]) * DEG, 'YXZ');
    }
    this.bones.hips.position.copy(this.hipsRest).add(this.hipsSpring.x);

    // hand scale (hide the hand inside the thigh while it is in the pocket)
    for (const side of ['R', 'L']) {
      const tgt = this.pocketTarget?.[side] ?? 0;
      this.pocket[side] += (tgt - this.pocket[side]) * Math.min(1, dt * 7);
      const sc = 1 - 0.45 * this.pocket[side];
      this.bones['hand' + side].scale.setScalar(sc);
    }
  }
}
