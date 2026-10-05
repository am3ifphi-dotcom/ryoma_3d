// Numeric arm IK helper (dev tool). Solves upper/lower arm/hand Euler angles (deg, YXZ)
// so that the wrist and/or fingertip reach model-space targets.
// usage: node scripts/solve-pose.mjs
import * as THREE from 'three';
import { buildSkeleton } from '../src/character/rig.js';
import { CharacterAnimator } from '../src/character/animator.js';

const DEG = Math.PI / 180;
const { root, bones } = buildSkeleton();
const scene = new THREE.Object3D(); const model = new THREE.Group(); scene.add(model); model.add(root);
// torso context = the real animator in its settled 'idle' stance (side = +1)
const anim = new CharacterAnimator({ bones, root: scene, model });
anim.setState('idle'); anim.side = 1; anim.nextShift = 1e9; anim.glanceTimer = 1e9;
for (let i = 0; i < 180; i++) anim.update(1 / 60);
bones.handR.scale.setScalar(1); bones.handL.scale.setScalar(1);
scene.updateMatrixWorld(true);
// targets relative to the head bone (model-space offsets from the head pivot at (-0.02, 0.362, 0))
const headRel = (x, y, z) => bones.head.localToWorld(new THREE.Vector3(x + 0.02, y - 0.362, z)).toArray();
const hipRel = (x, y, z) => bones.hips.localToWorld(new THREE.Vector3(x + 0.02, y, z)).toArray();
console.log('head at', bones.head.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)));

function setPose(side, q) {
  const [ux, uy, uz, ly, lz, hx, hz] = q;
  const s = side === 'R' ? 1 : -1;
  bones['upperArm' + side].rotation.set(ux * s * DEG, uy * s * DEG, uz * DEG, 'YXZ');
  bones['lowerArm' + side].rotation.set(0, ly * s * DEG, lz * DEG, 'YXZ');
  bones['hand' + side].rotation.set(hx * s * DEG, 0, hz * DEG, 'YXZ');
  scene.updateMatrixWorld(true);
}
const wp = (b) => new THREE.Vector3().setFromMatrixPosition(bones[b].matrixWorld);

function solve(side, { wrist, tip, elbowPref, limits, fingers = [0, 0, 0], reg = 0.0004 }, q0 = [0, 0, 0, 0, 10, 0, 0]) {
  const fs = side === 'R' ? 1 : -1;
  bones['fingers' + side].rotation.set(fingers[0] * fs * DEG, fingers[1] * DEG, fingers[2] * DEG, 'YXZ');
  const cost = (q) => {
    for (let i = 0; i < 7; i++) if (q[i] < limits[i][0] || q[i] > limits[i][1]) return 1e9;
    setPose(side, q);
    let c = 0;
    if (wrist) c += wp('hand' + side).distanceToSquared(new THREE.Vector3(...wrist));
    if (tip) c += wp('handEnd' + side).distanceToSquared(new THREE.Vector3(...tip));
    if (elbowPref) c += 0.25 * wp('lowerArm' + side).distanceToSquared(new THREE.Vector3(...elbowPref));
    c += reg * 1e-6 * q.reduce((a, v) => a + v * v, 0);
    return c;
  };
  let best = q0.slice(), bc = cost(best);
  for (let restart = 0; restart < 6; restart++) {
    let q = restart === 0 ? best.slice() : best.map((v, i) => Math.min(limits[i][1], Math.max(limits[i][0], v + (Math.random() - 0.5) * 80)));
    let c = cost(q); let step = 30;
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
  return { q: best.map((v) => +v.toFixed(1)), cost: bc, wrist: wp('hand' + side).toArray().map((v) => +v.toFixed(3)), tip: wp('handEnd' + side).toArray().map((v) => +v.toFixed(3)), elbow: wp('lowerArm' + side).toArray().map((v) => +v.toFixed(3)) };
}

const L = [[-60, 60], [-70, 70], [-40, 170], [-110, 110], [0, 150], [-70, 70], [-60, 60]];
const tasks = {
  pocketR: { wrist: hipRel(0.05, 0.035, 0.105), tip: hipRel(0.035, -0.04, 0.07), elbowPref: hipRel(-0.05, 0.15, 0.16), fingers: [40, 0, -10], limits: L },
  pocketL: { wrist: hipRel(0.05, 0.035, -0.105), tip: hipRel(0.035, -0.04, -0.07), elbowPref: hipRel(-0.05, 0.15, -0.16), fingers: [40, 0, -10], limits: L },
  glassesR: { tip: headRel(0.062, 0.404, 0.004), wrist: headRel(0.115, 0.335, 0.03), elbowPref: headRel(0.07, 0.2, 0.06), limits: L },
  chinR: { tip: headRel(0.05, 0.36, 0.012), wrist: headRel(0.1, 0.3, 0.05), limits: L },
  scratchR: { tip: headRel(-0.01, 0.46, 0.06), wrist: headRel(0.03, 0.4, 0.11), limits: L },
  phoneL: { wrist: [0.17, 0.2, -0.05], tip: [0.2, 0.22, 0.0], elbowPref: [0.0, 0.14, -0.16], limits: L },
  phoneShowL: { wrist: [0.26, 0.3, -0.06], tip: [0.3, 0.33, -0.01], limits: L },
  hipL: { wrist: [0.0, 0.02, -0.12], tip: [0.03, -0.02, -0.08], elbowPref: [-0.1, 0.15, -0.19], limits: L },
};
console.log('rest wrist R', (setPose('R', [0, 0, 0, 0, 0, 0, 0]), wp('handR').toArray()), 'elbow', wp('lowerArmR').toArray());
for (const [k, t] of Object.entries(tasks)) {
  const side = k.endsWith('L') ? 'L' : 'R';
  const r = solve(side, t);
  console.log(k, JSON.stringify(r));
}
