// Procedural auto-rig for the (static) Tripo model of 両馬二郎.
//
// The GLB has no skeleton, so we build one ourselves in *model space*
// (the raw GLB coordinates: +Y up, +X = the direction the face points,
// +Z = the character's right hand side) and derive smooth skin weights from
// the vertex positions. Measurements come from scripts/measure (see README).
//
// Bone axes are aligned with the model axes (no rest rotation), so:
//   rotation.z  →  pitch (sagittal plane: nod / arm forward raise / elbow flex)
//   rotation.x  →  roll  (lateral: head tilt / arm abduction)
//   rotation.y  →  yaw   (turn / twist)

import * as THREE from 'three';

// name, parent, absolute position in model space
export const BONE_DEFS = [
  ['hips', null, [-0.02, 0.0, 0]],
  ['spine', 'hips', [-0.02, 0.08, 0]],
  ['chest', 'spine', [-0.02, 0.18, 0]],
  ['upperChest', 'chest', [-0.02, 0.27, 0]],
  ['neck', 'upperChest', [-0.03, 0.335, 0]],
  ['head', 'neck', [-0.02, 0.362, 0]],
  ['headTop', 'head', [-0.01, 0.49, 0]],

  ['shoulderR', 'upperChest', [-0.02, 0.31, 0.04]],
  ['upperArmR', 'shoulderR', [-0.02, 0.295, 0.115]],
  ['lowerArmR', 'upperArmR', [-0.02, 0.15, 0.155]],
  ['handR', 'lowerArmR', [-0.02, 0.02, 0.195]],
  ['fingersR', 'handR', [-0.02, -0.02, 0.2]],
  ['handEndR', 'fingersR', [-0.02, -0.06, 0.205]],

  ['shoulderL', 'upperChest', [-0.02, 0.31, -0.04]],
  ['upperArmL', 'shoulderL', [-0.02, 0.295, -0.115]],
  ['lowerArmL', 'upperArmL', [-0.02, 0.15, -0.155]],
  ['handL', 'lowerArmL', [-0.02, 0.02, -0.195]],
  ['fingersL', 'handL', [-0.02, -0.02, -0.2]],
  ['handEndL', 'fingersL', [-0.02, -0.06, -0.205]],

  ['upperLegR', 'hips', [-0.03, -0.01, 0.055]],
  ['lowerLegR', 'upperLegR', [-0.03, -0.22, 0.065]],
  ['footR', 'lowerLegR', [-0.03, -0.42, 0.07]],
  ['toeR', 'footR', [0.05, -0.48, 0.08]],

  ['upperLegL', 'hips', [-0.03, -0.01, -0.055]],
  ['lowerLegL', 'upperLegL', [-0.03, -0.22, -0.065]],
  ['footL', 'lowerLegL', [-0.03, -0.42, -0.07]],
  ['toeL', 'footL', [0.05, -0.48, -0.08]],
];

export const BONE_INDEX = Object.fromEntries(BONE_DEFS.map((d, i) => [d[0], i]));

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Compute the weights of one vertex into `acc` (bone name → weight). */
function vertexWeights(x, y, z, acc) {
  const az = Math.abs(z);
  const side = z >= 0 ? 'R' : 'L';

  // ---- arm membership ------------------------------------------------
  let A = 0; // arm
  let C = 0; // clavicle (inside the non-arm part)
  if (y > 0.2) {
    A = smooth(0.095, 0.145, az);
    C = smooth(0.03, 0.1, az) * smooth(0.22, 0.29, y) * (1 - smooth(0.325, 0.35, y));
  } else {
    const gap = 0.09 + (0.19 - clamp(y, -0.07, 0.19)) * 0.2;
    A = smooth(gap - 0.01, gap + 0.01, az);
  }
  if (y > 0.33) A *= 1 - smooth(0.33, 0.36, y); // nothing above the shoulder line is arm

  if (A > 0) {
    const t1 = smooth(0.128, 0.172, y); // upper vs lower arm (tight blend → less elbow collapse)
    const t2 = smooth(0.0, 0.045, y); // lower arm vs hand
    const t3 = smooth(-0.03, -0.012, y); // hand (palm) vs fingers
    const up = t1;
    const lo = (1 - t1) * t2;
    const ha = (1 - t1) * (1 - t2) * t3;
    const fi = (1 - t1) * (1 - t2) * (1 - t3);
    acc['fingers' + side] = A * fi;
    // shoulder cap shares with the clavicle bone
    const sc = smooth(0.26, 0.32, y) * (1 - smooth(0.13, 0.17, az)) * 0.7;
    acc['upperArm' + side] = A * up * (1 - sc);
    acc['shoulder' + side] = (acc['shoulder' + side] || 0) + A * up * sc;
    acc['lowerArm' + side] = A * lo;
    acc['hand' + side] = A * ha;
  }

  const rest = 1 - A;
  if (rest <= 0) return;

  // ---- clavicle -------------------------------------------------------
  if (C > 0) acc['shoulder' + side] = (acc['shoulder' + side] || 0) + rest * C;
  const torso = rest * (1 - C);

  // ---- legs -----------------------------------------------------------
  let L = 0;
  if (y < 0.04) L = 1 - smooth(-0.04, 0.04, y);
  if (L > 0) {
    const k1 = smooth(-0.25, -0.19, y); // upper vs lower leg
    const k2 = smooth(-0.44, -0.4, y); // lower leg vs foot
    acc['upperLeg' + side] = torso * L * k1;
    acc['lowerLeg' + side] = torso * L * (1 - k1) * k2;
    acc['foot' + side] = torso * L * (1 - k1) * (1 - k2);
  }
  const col = torso * (1 - L);
  if (col <= 0) return;

  // ---- torso column ---------------------------------------------------
  // (chin bottom ≈ 0.358, visible neck ≈ 0.34–0.358, collar/shoulder top ≈ 0.33)
  if (y >= 0.368) acc.head = (acc.head || 0) + col;
  else if (y >= 0.342) { const t = smooth(0.342, 0.368, y); acc.head = (acc.head || 0) + col * t; acc.neck = (acc.neck || 0) + col * (1 - t); }
  else if (y >= 0.3) { const t = smooth(0.3, 0.342, y); acc.neck = (acc.neck || 0) + col * t; acc.upperChest = (acc.upperChest || 0) + col * (1 - t); }
  else if (y >= 0.2) { const t = smooth(0.2, 0.3, y); acc.upperChest = (acc.upperChest || 0) + col * t; acc.chest = (acc.chest || 0) + col * (1 - t); }
  else if (y >= 0.09) { const t = smooth(0.09, 0.2, y); acc.chest = (acc.chest || 0) + col * t; acc.spine = (acc.spine || 0) + col * (1 - t); }
  else if (y >= 0.0) { const t = smooth(0.0, 0.09, y); acc.spine = (acc.spine || 0) + col * t; acc.hips = (acc.hips || 0) + col * (1 - t); }
  else acc.hips = (acc.hips || 0) + col;
}

/** Adds skinIndex / skinWeight attributes to a geometry whose positions are in model space. */
export function applySkinWeights(geometry) {
  const pos = geometry.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  const acc = {};
  const entries = [];
  for (let i = 0; i < n; i++) {
    for (const k in acc) delete acc[k];
    vertexWeights(pos.getX(i), pos.getY(i), pos.getZ(i), acc);
    entries.length = 0;
    for (const k in acc) if (acc[k] > 1e-4) entries.push([BONE_INDEX[k], acc[k]]);
    entries.sort((a, b) => b[1] - a[1]);
    let sum = 0;
    for (let j = 0; j < 4 && j < entries.length; j++) sum += entries[j][1];
    for (let j = 0; j < 4; j++) {
      if (j < entries.length) { idx[i * 4 + j] = entries[j][0]; wgt[i * 4 + j] = entries[j][1] / sum; }
    }
    if (entries.length === 0) { idx[i * 4] = BONE_INDEX.hips; wgt[i * 4] = 1; }
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
}

/** Builds the THREE.Bone hierarchy + Skeleton. Returns { root, bones (name→Bone), skeleton, list }. */
export function buildSkeleton() {
  const bones = {};
  const list = [];
  let root = null;
  for (const [name, parent, abs] of BONE_DEFS) {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.abs = new THREE.Vector3(...abs);
    if (parent) {
      b.position.copy(b.userData.abs).sub(bones[parent].userData.abs);
      bones[parent].add(b);
    } else {
      b.position.copy(b.userData.abs);
      root = b;
    }
    bones[name] = b;
    list.push(b);
  }
  const skeleton = new THREE.Skeleton(list);
  return { root, bones, skeleton, list };
}
