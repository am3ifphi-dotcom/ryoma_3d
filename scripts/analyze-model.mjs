/**
 * モデル形状の解析：向き（正面がどちらか）・手の位置・簡易スケルトン計測
 * 使い方: node scripts/analyze-model.mjs [glb]
 */
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', (gltf) => {
  const P = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) P.push([p.getX(i), p.getY(i), p.getZ(i)]);
  });
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const size = max.map((v, i) => v - min[i]);
  console.log('size (x,y,z) =', size.map((v) => v.toFixed(3)).join(' × '));

  const N = 20;
  console.log('\n[高さスライス]  y%   X範囲(符号付)                 Z範囲(符号付)                 頂点数');
  const slices = [];
  for (let s = 0; s < N; s++) {
    const lo = min[1] + (size[1] * s) / N, hi = min[1] + (size[1] * (s + 1)) / N;
    const sel = P.filter((p) => p[1] >= lo && p[1] < hi);
    if (!sel.length) { slices.push(null); continue; }
    const xn = Math.min(...sel.map((p) => p[0])), xx = Math.max(...sel.map((p) => p[0]));
    const zn = Math.min(...sel.map((p) => p[2])), zx = Math.max(...sel.map((p) => p[2]));
    slices.push({ xn, xx, zn, zx, n: sel.length });
    const bar = (a, b, c = 'x') => `[${a.toFixed(3)},${b.toFixed(3)}]中心${((a + b) / 2).toFixed(3)}`;
    console.log(
      `  ${String(Math.round(((s + 0.5) / N) * 100)).padStart(3)}%  X ${bar(xn, xx).padEnd(28)} Z ${bar(zn, zx).padEnd(28)} ${String(sel.length).padStart(7)}`
    );
  }

  // ── 頭部の水平断面：鼻（突出）を探す
  const headLo = min[1] + size[1] * 0.87;
  const head = P.filter((p) => p[1] >= headLo);
  const cx = head.reduce((a, p) => a + p[0], 0) / head.length;
  const cz = head.reduce((a, p) => a + p[2], 0) / head.length;
  const B = 36;
  const rad = new Array(B).fill(0);
  for (const p of head) {
    const ang = Math.atan2(p[2] - cz, p[0] - cx);
    const b = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * B) % B;
    const d = Math.hypot(p[0] - cx, p[2] - cz);
    if (d > rad[b]) rad[b] = d;
  }
  const names = ['+X', '-X', '+Z', '-Z'];
  console.log('\n[頭部の水平断面: 角度ごとの最大半径]  (0°=+X, 90°=+Z, 180°=-X, 270°=-Z)');
  let best = 0;
  for (let b = 0; b < B; b += 1) {
    const deg = Math.round((b / B) * 360);
    const v = rad[b];
    const isPeak = rad[b] > rad[(b + B - 1) % B] && rad[b] > rad[(b + 1) % B];
    if (isPeak) console.log(`   ${String(deg).padStart(3)}°  半径 ${v.toFixed(3)}  ← 局所的な突出`);
  }
  const axisMax = {
    '+X': Math.max(...head.map((p) => p[0])) - cx,
    '-X': cx - Math.min(...head.map((p) => p[0])),
    '+Z': Math.max(...head.map((p) => p[2])) - cz,
    '-Z': cz - Math.min(...head.map((p) => p[2])),
  };
  console.log('  軸方向の最大突出:', Object.entries(axisMax).map(([k, v]) => `${k}=${v.toFixed(3)}`).join('  '));
  const headW = Math.max(...head.map((p) => p[0])) - Math.min(...head.map((p) => p[0]));
  const headD = Math.max(...head.map((p) => p[2])) - Math.min(...head.map((p) => p[2]));
  console.log(`  頭の幅(X)=${headW.toFixed(3)} 奥行(Z)=${headD.toFixed(3)}  → 奥行が大きい軸が「前後」`);

  // ── 手（ポケット）の位置：腰の高さで左右の塊を探す
  console.log('\n[腰〜腿の高さ: 左右の塊]');
  for (const [lo, hi, label] of [[0.42, 0.52, '腰上'], [0.34, 0.44, '腰'], [0.26, 0.36, '腿上']]) {
    const sel = P.filter((p) => p[1] >= min[1] + size[1] * lo && p[1] < min[1] + size[1] * hi);
    const mid = (min[0] + max[0]) / 2;
    const left = sel.filter((p) => p[0] < mid), right = sel.filter((p) => p[0] > mid);
    const f = (a) => a.length ? `x[${Math.min(...a.map((p) => p[0])).toFixed(3)},${Math.max(...a.map((p) => p[0])).toFixed(3)}] z[${Math.min(...a.map((p) => p[2])).toFixed(3)},${Math.max(...a.map((p) => p[2])).toFixed(3)}]` : 'なし';
    console.log(`  ${label.padEnd(3)} -X側: ${f(left)}   +X側: ${f(right)}`);
  }

  // ── 簡易スケルトン（高さ1.72m・足元y=0 に正規化した座標）
  const s = 1.72 / size[1];
  const T = (y) => (min[1] + size[1] * y - min[1]) * s;
  const X = (v) => (v - (min[0] + max[0]) / 2) * s;
  const Z = (v) => (v - (min[2] + max[2]) / 2) * s;
  console.log('\n[正規化後の目安（身長1.72m・足元0）]');
  const at = (label, y) => {
    const sel = P.filter((p) => Math.abs(p[1] - (min[1] + size[1] * y)) < size[1] * 0.012);
    if (!sel.length) return;
    console.log(`  ${label.padEnd(6)} y=${T(y).toFixed(3)}m  X幅=${(Math.max(...sel.map((p) => p[0])) - Math.min(...sel.map((p) => p[0]))).toFixed(3)} (正規化 ${((Math.max(...sel.map((p) => p[0])) - Math.min(...sel.map((p) => p[0]))) * s).toFixed(3)}m)` +
      `  Z幅=${((Math.max(...sel.map((p) => p[2])) - Math.min(...sel.map((p) => p[2]))) * s).toFixed(3)}m`);
  };
  [['頭頂', 1.0], ['目', 0.93], ['顎', 0.87], ['肩', 0.82], ['胸', 0.72], ['肘', 0.62], ['手首', 0.52], ['腰', 0.5], ['腿', 0.35], ['膝', 0.25], ['足首', 0.06]].forEach(([l, y]) => at(l, y));
  process.exit(0);
}, (e) => { console.error(e); process.exit(1); });
