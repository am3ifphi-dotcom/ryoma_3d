/**
 * 自動リグの検証（Node・DOM 無し）
 *  - ウェイト計算の時間と、各ボーンに割り当たった頂点の分布を出す
 *  - 「手」ボーンの支配下にある頂点の位置＝ポケットの手が正しく取れているか
 *  - rest 姿勢で変形が起きていないか（＝スキニングが壊れていないか）
 * 使い方: node scripts/test-rig.mjs
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

/* ── 最小の DOM スタブ（テクスチャ生成用） ── */
const ctxProxy = new Proxy({}, {
  get(_, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 1, height: 1 };
    return () => {};
  },
  set() { return true; },
});
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    return { width: 1, height: 1, getContext: () => ctxProxy, style: {} };
  },
  createElementNS() { return { style: {} }; },
  addEventListener() {}, removeEventListener() {},
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BONE_DEFS, buildSkeleton, computeSkinWeights } from '../src/world/rig.js';
import { prepareRig, Ryoma } from '../src/world/ryoma.js';

const file = process.argv[2] || 'public/ryoma.glb';
const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const dv = new DataView(ab);
let off = 12;
while (off < dv.byteLength) {
  const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
  if (type === 0x4e4f534a) {
    const j = JSON.parse(Buffer.from(ab, off + 8, len).toString('utf8'));
    delete j.images; delete j.textures; delete j.samplers;
    j.materials = [{}];
    j.meshes.forEach((m) => m.primitives.forEach((p) => { p.material = 0; }));
    const out = Buffer.from(JSON.stringify(j), 'utf8');
    Buffer.from(ab).fill(0x20, off + 8, off + 8 + len);
    out.copy(Buffer.from(ab), off + 8);
  }
  off += 8 + len + ((4 - (len % 4)) % 4);
}

let fails = 0;
const ok = (c, msg) => { console.log(`  ${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };

let _gltf = null;
function gltfModel() {
  // ジオメトリを共有したまま、もう一度同じ形のシーンを作る
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(_src.geometry, new THREE.MeshStandardMaterial());
  g.add(mesh);
  return g;
}

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', async (gltf) => {
  _gltf = gltf;
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  let src = null;
  model.traverse((o) => { if (o.isMesh && !src) src = o; });
  globalThis._src = src;
  const geo = src.geometry;
  geo.applyMatrix4(src.matrixWorld);

  // ── 正規化 ──
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone();
  const s = 1.72 / (bb.max.y - bb.min.y);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const b2 = geo.boundingBox;
  geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  geo.computeBoundingBox();
  console.log('正規化後 bbox:', JSON.stringify({
    min: geo.boundingBox.min.toArray().map((v) => +v.toFixed(3)),
    max: geo.boundingBox.max.toArray().map((v) => +v.toFixed(3)),
  }));

  const N = geo.attributes.position.count;
  console.log(`頂点数 ${N.toLocaleString()}　ボーン数 ${BONE_DEFS.length}`);

  // ── ウェイト計算 ──
  const t0 = Date.now();
  const iter = computeSkinWeights(geo);
  for (;;) { if (iter.next().done) break; }
  const ms = Date.now() - t0;
  console.log(`ウェイト計算: ${ms} ms（60k頂点×${Math.ceil(N / 60000)}チャンク）`);

  const idx = geo.attributes.skinIndex.array;
  const wts = geo.attributes.skinWeight.array;
  const pos = geo.attributes.position;

  // ── 支配ボーンごとの統計 ──
  const stat = BONE_DEFS.map((b, i) => ({ name: b.name, n: 0, box: new THREE.Box3(), sum: 0 }));
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // 最大ウェイトのボーン
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = wts[i * 4 + k];
      if (w > bw) { bw = w; bi = idx[i * 4 + k]; }
    }
    const st = stat[bi];
    st.n++;
    st.sum += bw;
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    st.box.expandByPoint(v);
  }
  console.log('\n■ 支配ボーン別の頂点数と範囲');
  for (const st of stat) {
    if (!st.n) { console.log(`  ${st.name.padEnd(10)} ${String(0).padStart(9)}`); continue; }
    const mn = st.box.min, mx = st.box.max;
    console.log(
      `  ${st.name.padEnd(10)} ${String(st.n).padStart(9)}  平均w=${(st.sum / st.n).toFixed(2)}` +
      `  x[${mn.x.toFixed(2)},${mx.x.toFixed(2)}] y[${mn.y.toFixed(2)},${mx.y.toFixed(2)}] z[${mn.z.toFixed(2)},${mx.z.toFixed(2)}]`
    );
  }

  // ── rest 姿勢で変形しないか（CPU でスキニングを再現） ──
  const built = buildSkeleton();
  const sk = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  sk.add(built.root);
  sk.updateMatrixWorld(true);
  sk.bind(built.skeleton, sk.matrixWorld);
  built.skeleton.update();
  const boneMat = built.skeleton.boneMatrices;

  const maxErr = (rotBoneIdx, euler) => {
    if (rotBoneIdx >= 0) {
      const b = built.bones[rotBoneIdx];
      b.rotation.set(euler[0], euler[1], euler[2]);
      sk.updateMatrixWorld(true);
      built.skeleton.update();
    }
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3(), o = new THREE.Vector3(), acc = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < N; i += 37) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const bi = idx[i * 4 + k], w = wts[i * 4 + k];
        if (!w) continue;
        m.fromArray(boneMat, bi * 16);
        o.copy(p).applyMatrix4(m).multiplyScalar(w);
        acc.add(o);
      }
      worst = Math.max(worst, acc.distanceTo(p));
    }
    return worst;
  };

  const handR = BONE_DEFS.findIndex((b) => b.name === 'handR');
  const handL = BONE_DEFS.findIndex((b) => b.name === 'handL');
  const rest = maxErr(-1);
  console.log(`\n■ rest 姿勢の最大ズレ: ${(rest * 1000).toFixed(3)} mm  （0 なら壊れていない）`);
  const r90 = maxErr(handR, [0, 0, 1.6]);
  console.log(`■ 右手ボーンを +1.6rad 回したときの最大移動: ${r90.toFixed(3)} m`);
  // 手の頂点だけを見る
  const handIdx = [];
  for (let i = 0; i < N; i++) {
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = wts[i * 4 + k]; if (w > bw) { bw = w; bi = idx[i * 4 + k]; } }
    if (bi === handR && bw > 0.6) handIdx.push(i);
  }
  console.log(`■ 右手ボーン支配(>0.6)の頂点: ${handIdx.length}`);
  if (handIdx.length) {
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    const m = new THREE.Matrix4(), o = new THREE.Vector3();
    for (const i of handIdx) before.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    before.divideScalar(handIdx.length);
    for (const i of handIdx) {
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const a = new THREE.Vector3();
      for (let k = 0; k < 4; k++) {
        const bi = idx[i * 4 + k], w = wts[i * 4 + k];
        if (!w) continue;
        m.fromArray(boneMat, bi * 16);
        o.copy(p).applyMatrix4(m).multiplyScalar(w);
        a.add(o);
      }
      after.add(a);
    }
    after.divideScalar(handIdx.length);
    console.log(`   手の重心: ${before.toArray().map((n) => n.toFixed(3)).join(', ')}  →  ${after.toArray().map((n) => n.toFixed(3)).join(', ')}`);
  }
  /* ── ここから本番と同じ経路（prepareRig → Ryoma）の確認 ── */
  console.log('\n■ prepareRig → Ryoma の結合確認');
  const model2 = gltfModel();
  const out = await prepareRig(model2, () => {});
  const ryoma = new Ryoma(model2, {
    position: new THREE.Vector3(1.0, 0, -3.65),
    rig: out.rig, skinned: out.skinned, plain: out.plain,
  });
  const scene2 = new THREE.Scene();
  scene2.add(ryoma.root);
  const cam3 = new THREE.PerspectiveCamera(60, 1.6, 0.1, 100);
  cam3.position.set(1.0, 1.62, -1.4);
  scene2.updateMatrixWorld(true);

  ok(out.boneRoot.parent != null, 'ボーンのルートがシーングラフに入っている');
  ok(ryoma.useRig === true, 'リグが有効（SkinnedMesh を表示）');

  const handBone = out.rig.bone('handR');
  const hp0 = new THREE.Vector3();
  handBone.getWorldPosition(hp0);
  ryoma.motion('phone', 3);
  for (let i = 0; i < 90; i++) { ryoma.update(1 / 60, cam3); scene2.updateMatrixWorld(true); }
  const hp1 = new THREE.Vector3();
  handBone.getWorldPosition(hp1);
  const moved = hp1.distanceTo(hp0);
  console.log(`   右手ボーンの移動: ${moved.toFixed(3)} m  (${hp0.toArray().map((n) => n.toFixed(2)).join(',')} → ${hp1.toArray().map((n) => n.toFixed(2)).join(',')})`);
  ok(moved > 0.15, '「スマホ」モーションで手が実際に動く（15cm以上）');
  ok(ryoma.pose === 'phone', 'pose が phone になっている');

  ryoma.hold('rest');
  for (let i = 0; i < 120; i++) { ryoma.update(1 / 60, cam3); scene2.updateMatrixWorld(true); }
  handBone.getWorldPosition(hp1);
  console.log(`   rest に戻した右手: ${hp1.distanceTo(hp0).toFixed(3)} m（rest との差）`);
  ok(hp1.distanceTo(hp0) < 0.05, 'rest（ポケット）に戻る');

  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(1); });
