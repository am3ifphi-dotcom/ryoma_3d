// Numeric arm IK helper (dev tool). Solves shoulder / elbow / wrist Euler angles (deg) so that the
// wrist and fingertip reach model-space targets, under anatomical joint limits, in the context of the
// real animator stance (torso lean, hips offset …).
//
// Conventions (see animator.js):
//   upperArm  YXZ  rx = adduction(+ for R) / abduction, ry = humeral rotation, rz = forward raise
//   lowerArm  ZXY  rz = elbow flexion (0…145), ry = pronation/supination (−85…85), rx unused
//   hand      YXZ  rx = ulnar/radial deviation, rz = flexion/extension
//
//   node scripts/solve-pose.mjs            → prints JSON { task: { upperArm, lowerArm, hand } }
import * as THREE from 'three';
import { buildSkeleton } from '../src/character/rig.js';
import { CharacterAnimator, TWIST_WRIST } from '../src/character/animator.js';

const DEG = Math.PI / 180;
const { root, bones } = buildSkeleton();
const scene = new THREE.Object3D(); const model = new THREE.Group(); scene.add(model); model.add(root);
const anim = new CharacterAnimator({ bones, root: scene, model });
anim.setState('talk'); anim.side = 1; anim.nextShift = 1e9; anim.glanceTimer = 1e9;
for (let i = 0; i < 180; i++) anim.update(1 / 60);
bones.handR.scale.setScalar(1); bones.handL.scale.setScalar(1);
scene.updateMatrixWorld(true);

const headRel = (x, y, z) => bones.head.localToWorld(new THREE.Vector3(x + 0.02, y - 0.362, z)).toArray();
const hipRel = (x, y, z) => bones.hips.localToWorld(new THREE.Vector3(x + 0.02, y, z)).toArray();
const chestRel = (x, y, z) => bones.upperChest.localToWorld(new THREE.Vector3(x + 0.02, y - 0.27, z)).toArray();
const mirror = ([x, y, z]) => [x, y, -z];

function setPose(side, q) {
  const [ux, uy, uz, ly, lz, hx, hz] = q;
  const s = side === 'R' ? 1 : -1;
  bones['upperArm' + side].rotation.set(ux * s * DEG, uy * s * DEG, uz * DEG, 'YXZ');
  bones['lowerArm' + side].rotation.set(0, ly * s * (1 - TWIST_WRIST) * DEG, lz * DEG, 'ZXY');
  bones['hand' + side].rotation.set(hx * s * DEG, ly * s * TWIST_WRIST * DEG, hz * DEG, 'YXZ');
  scene.updateMatrixWorld(true);
}
const wp = (b) => new THREE.Vector3().setFromMatrixPosition(bones[b].matrixWorld);

// joint limits [ux, uy, uz, ly, lz, hx, hz]
const LIM = [[-70, 95], [-80, 80], [-45, 175], [-85, 85], [0, 145], [-30, 30], [-70, 70]];

function solve(side, { wrist, tip, elbowPref, elbowW = 0.25, fingers = [0, 0, 0], reg = 1e-7, limits = LIM }) {
  const fs = side === 'R' ? 1 : -1;
  bones['fingers' + side].rotation.set(fingers[0] * fs * DEG, fingers[1] * DEG, fingers[2] * DEG, 'YXZ');
  const W = wrist && new THREE.Vector3(...wrist), T = tip && new THREE.Vector3(...tip), E = elbowPref && new THREE.Vector3(...elbowPref);
  const cost = (q) => {
    for (let i = 0; i < 7; i++) if (q[i] < limits[i][0] || q[i] > limits[i][1]) return 1e9;
    setPose(side, q);
    let c = 0;
    if (W) c += wp('hand' + side).distanceToSquared(W);
    if (T) c += wp('handEnd' + side).distanceToSquared(T);
    if (E) c += elbowW * wp('lowerArm' + side).distanceToSquared(E);
    // prefer small twists / deviations (natural-looking)
    c += reg * (q[1] * q[1] * 0.5 + q[3] * q[3] + q[5] * q[5] * 2);
    return c;
  };
  let best = null, bc = 1e9;
  for (let restart = 0; restart < 14; restart++) {
    let q = restart === 0 ? [10, 0, 20, 0, 40, 0, 0] : LIM.map(([a, b]) => a + Math.random() * (b - a));
    let c = cost(q); let step = 40;
    while (step > 0.05) {
      let improved = false;
      for (let i = 0; i < 7; i++) for (const d of [step, -step]) {
        const t = q.slice(); t[i] += d; const tc = cost(t);
        if (tc < c) { q = t; c = tc; improved = true; }
      }
      if (!improved) step *= 0.5;
    }
    if (c < bc) { bc = c; best = q; }
  }
  setPose(side, best);
  const r = (v) => +v.toFixed(1);
  const s = side === 'R' ? 1 : -1;
  return {
    upperArm: [r(best[0] * s), r(best[1] * s), r(best[2])],
    lowerArm: [0, r(best[3] * s), r(best[4])],
    hand: [r(best[5] * s), 0, r(best[6])],
    err: +Math.sqrt(bc).toFixed(4),
    wrist: wp('hand' + side).toArray().map((v) => +v.toFixed(3)),
    tip: wp('handEnd' + side).toArray().map((v) => +v.toFixed(3)),
    elbow: wp('lowerArm' + side).toArray().map((v) => +v.toFixed(3)),
  };
}

// ---- tasks (model space: +X forward, +Y up, +Z = his right) ---------------------------------
const CURL = [40, 0, -10];
const tasks = {
  // base stances
  pocketR: { side: 'R', wrist: hipRel(0.05, 0.035, 0.105), tip: hipRel(0.035, -0.04, 0.07), elbowPref: hipRel(-0.05, 0.15, 0.16), fingers: CURL },
  pocketL: { side: 'L', wrist: hipRel(0.05, 0.035, -0.105), tip: hipRel(0.035, -0.04, -0.07), elbowPref: hipRel(-0.05, 0.15, -0.16), fingers: CURL },
  phoneHipL: { side: 'L', wrist: hipRel(0.0, 0.03, -0.125), tip: hipRel(0.03, -0.03, -0.08), elbowPref: hipRel(-0.06, 0.15, -0.16), fingers: [25, 0, 0] },
  phoneLookL: { side: 'L', wrist: chestRel(0.13, 0.25, -0.05), tip: chestRel(0.16, 0.28, 0.01), elbowPref: chestRel(-0.01, 0.16, -0.14), elbowW: 0.6, fingers: [30, 0, 0] },
  // contact gestures (right)
  glasses: { side: 'R', tip: headRel(0.06, 0.404, 0.004), wrist: headRel(0.115, 0.335, 0.03), elbowPref: headRel(0.07, 0.19, 0.08), fingers: [0, 0, 0] },
  chin: { side: 'R', tip: headRel(0.05, 0.36, 0.012), wrist: headRel(0.1, 0.3, 0.05), elbowPref: headRel(0.06, 0.17, 0.12), fingers: [10, 0, 0] },
  scratch: { side: 'R', tip: headRel(-0.01, 0.46, 0.06), wrist: headRel(0.03, 0.4, 0.11), elbowPref: headRel(0.1, 0.32, 0.17), fingers: [20, 0, 0] },
  facepalm: { side: 'R', tip: headRel(0.055, 0.44, 0.015), wrist: headRel(0.085, 0.37, 0.03), elbowPref: headRel(0.06, 0.2, 0.1), fingers: [0, 0, 0] },
  chestHand: { side: 'R', tip: chestRel(0.075, 0.3, -0.01), wrist: chestRel(0.09, 0.25, 0.07), elbowPref: chestRel(0.02, 0.17, 0.17), fingers: [5, 0, 0] },
  // pointing / showing
  point: { side: 'R', wrist: chestRel(0.3, 0.3, 0.1), tip: chestRel(0.38, 0.31, 0.09), elbowPref: chestRel(0.14, 0.27, 0.13), fingers: [0, 0, 0] },
  pointUp: { side: 'R', wrist: chestRel(0.12, 0.33, 0.14), tip: chestRel(0.12, 0.41, 0.14), elbowPref: chestRel(0.05, 0.19, 0.16), fingers: [0, 0, 0] },
  wave: { side: 'R', wrist: chestRel(0.1, 0.42, 0.2), tip: chestRel(0.1, 0.5, 0.21), elbowPref: chestRel(0.02, 0.25, 0.2), fingers: [0, 0, 0] },
  handWaveNo: { side: 'R', wrist: chestRel(0.2, 0.3, 0.06), tip: chestRel(0.22, 0.38, 0.08), elbowPref: chestRel(0.05, 0.17, 0.14), fingers: [0, 0, 0] },
  phoneShowL: { side: 'L', wrist: chestRel(0.3, 0.3, -0.08), tip: chestRel(0.33, 0.33, -0.02), elbowPref: chestRel(0.12, 0.22, -0.12), fingers: [30, 0, 0] },
  // two-handed (each side solved separately)
  crossR: { side: 'R', wrist: chestRel(0.17, 0.27, 0.01), tip: chestRel(0.17, 0.35, 0.0), elbowPref: chestRel(0.08, 0.15, 0.1), fingers: [0, 0, 0] },
  crossL: { side: 'L', wrist: chestRel(0.19, 0.3, -0.05), tip: chestRel(0.19, 0.31, 0.03), elbowPref: chestRel(0.05, 0.22, -0.17), fingers: [0, 0, 0] },
  spreadR: { side: 'R', wrist: hipRel(0.18, 0.12, 0.25), tip: hipRel(0.25, 0.12, 0.3), elbowPref: hipRel(0.0, 0.15, 0.18), fingers: [-5, 0, 0] },
  spreadL: { side: 'L', wrist: hipRel(0.18, 0.12, -0.25), tip: hipRel(0.25, 0.12, -0.3), elbowPref: hipRel(0.0, 0.15, -0.18), fingers: [-5, 0, 0] },
  shrugR: { side: 'R', wrist: chestRel(0.12, 0.16, 0.22), tip: chestRel(0.17, 0.18, 0.26), elbowPref: chestRel(-0.03, 0.14, 0.17), elbowW: 0.6, fingers: [-5, 0, 0] },
  shrugL: { side: 'L', wrist: chestRel(0.12, 0.16, -0.22), tip: chestRel(0.17, 0.18, -0.26), elbowPref: chestRel(-0.03, 0.14, -0.17), elbowW: 0.6, fingers: [-5, 0, 0] },
  excitedR: { side: 'R', wrist: chestRel(0.1, 0.5, 0.2), tip: chestRel(0.1, 0.58, 0.22), elbowPref: chestRel(0.03, 0.33, 0.2), fingers: [0, 0, 0] },
  excitedL: { side: 'L', wrist: chestRel(0.1, 0.5, -0.2), tip: chestRel(0.1, 0.58, -0.22), elbowPref: chestRel(0.03, 0.33, -0.2), fingers: [0, 0, 0] },
  thinkL: { side: 'L', wrist: chestRel(0.1, 0.15, -0.08), tip: chestRel(0.14, 0.16, 0.0), elbowPref: chestRel(-0.02, 0.14, -0.16), fingers: [20, 0, 0] }, // left arm folded under the right elbow
};

const out = {};
for (const [k, t] of Object.entries(tasks)) {
  const r = solve(t.side, t);
  out[k] = r;
  console.error(k.padEnd(11), 'err', r.err.toFixed(4).padStart(7), 'U', JSON.stringify(r.upperArm), 'L', JSON.stringify(r.lowerArm), 'H', JSON.stringify(r.hand), 'elbow', JSON.stringify(r.elbow));
  // reset the arm so the next task starts clean
  setPose(t.side, [0, 0, 0, 0, 0, 0, 0]);
}
console.log(JSON.stringify(out));
