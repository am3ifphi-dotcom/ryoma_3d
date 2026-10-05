// Extracts small "face patch" meshes (eyelids, eyebrows, mouth) from the full model.
// The model has no blend shapes and its face UVs are scattered over the atlas, so
// expressions are rendered with overlay patches (see src/character/face.js).
// Glasses are separate connected components → removed via position-welded union-find.
//
//   node scripts/make-face.mjs   → public/models/ryoma_face.bin (+ header JSON inside)

import fs from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';

const SRC = path.resolve('public/models/ryoma.glb');
const DST = path.resolve('public/models/ryoma_face.bin');
await MeshoptDecoder.ready;

const file = fs.readFileSync(SRC);
const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
const jsonLen = dv.getUint32(12, true);
const json = JSON.parse(file.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = file.subarray(20 + jsonLen + 8);
function readBufferView(i) {
  const bv = json.bufferViews[i];
  const ext = bv.extensions?.EXT_meshopt_compression;
  if (!ext) return new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const src = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
  const out = new Uint8Array(ext.count * ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter);
  return out;
}
const prim = json.meshes[0].primitives[0];
const accPos = json.accessors[prim.attributes.POSITION];
const accNrm = json.accessors[prim.attributes.NORMAL];
const accUv = json.accessors[prim.attributes.TEXCOORD_0];
const accIdx = json.accessors[prim.indices];
const posRaw = readBufferView(accPos.bufferView), nrmRaw = readBufferView(accNrm.bufferView);
const uvRaw = readBufferView(accUv.bufferView), idxRaw = readBufferView(accIdx.bufferView);
const n = accPos.count;
const P = new Float32Array(posRaw.buffer, posRaw.byteOffset, n * 3);
const UV = new Float32Array(uvRaw.buffer, uvRaw.byteOffset, n * 2);
const N8 = new Int8Array(nrmRaw.buffer, nrmRaw.byteOffset, n * 4);
const I = new Uint32Array(idxRaw.buffer, idxRaw.byteOffset, accIdx.count);
console.log(`source: ${n} verts, ${I.length / 3} tris`);

// ---- restrict to the head region to keep union-find cheap ----
const inHead = (i) => P[i * 3 + 1] > 0.33 && P[i * 3 + 1] < 0.5 && Math.abs(P[i * 3 + 2]) < 0.12;
// weld by quantised position
const key = (i) => `${Math.round(P[i * 3] * 20000)},${Math.round(P[i * 3 + 1] * 20000)},${Math.round(P[i * 3 + 2] * 20000)}`;
const weld = new Int32Array(n).fill(-1);
const map = new Map();
let wc = 0;
for (let i = 0; i < n; i++) {
  if (!inHead(i)) continue;
  const k = key(i);
  let w = map.get(k);
  if (w === undefined) { w = wc++; map.set(k, w); }
  weld[i] = w;
}
const parent = new Int32Array(wc).map((_, i) => i);
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
const headTris = [];
for (let t = 0; t < I.length; t += 3) {
  const a = I[t], b = I[t + 1], c = I[t + 2];
  if (weld[a] < 0 || weld[b] < 0 || weld[c] < 0) continue;
  union(weld[a], weld[b]); union(weld[a], weld[c]);
  headTris.push(t);
}
// component sizes
const size = new Map();
for (let w = 0; w < wc; w++) { const r = find(w); size.set(r, (size.get(r) || 0) + 1); }
// the face component = component of the vertex nearest to the nose tip / chin
function nearest(x, y, z) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < n; i++) {
    if (weld[i] < 0) continue;
    const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const nose = nearest(0.0505, 0.3875, 0), chin = nearest(0.036, 0.365, 0), cheek = nearest(0.03, 0.395, 0.035);
const faceComp = find(weld[nose]);
console.log('components:', size.size, 'face comp size', size.get(faceComp), 'chin same?', find(weld[chin]) === faceComp, 'cheek same?', find(weld[cheek]) === faceComp);
const top = [...size.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('largest comps', top.map(([r, s]) => s));

// ---- region selection ----
const browY = (az) => 0.4100 + 0.29 * az; // brow centre line (fit)
const regions = {
  eyeR: (x, y, z, nx) => nx > 0.25 && x > 0.012 && y > 0.4025 && y < 0.4118 && z > 0.0095 && z < 0.0335,
  eyeL: (x, y, z, nx) => nx > 0.25 && x > 0.012 && y > 0.4025 && y < 0.4118 && z < -0.0095 && z > -0.0335,
  browR: (x, y, z, nx) => nx > 0.2 && x > 0.022 && z > 0.006 && z < 0.037 && y > 0.4106 && Math.abs(y - browY(z)) < 0.0056,
  browL: (x, y, z, nx) => nx > 0.2 && x > 0.022 && z < -0.006 && z > -0.037 && y > 0.4106 && Math.abs(y - browY(-z)) < 0.0056,
  mouth: (x, y, z, nx) => nx > 0.2 && x > 0.02 && y > 0.3615 && y < 0.3815 && Math.abs(z) < 0.0205,
};
const patches = {};
for (const [name, test] of Object.entries(regions)) {
  const tris = [];
  for (const t of headTris) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (find(weld[a]) !== faceComp) continue;
    let ok = 0;
    for (const v of [a, b, c]) if (test(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N8[v * 4] / 127)) ok++;
    if (ok === 3) tris.push(a, b, c);
  }
  // re-index
  const remap = new Map(); const idx = new Uint16Array(tris.length);
  const pos = [], nrm = [], uv = [];
  tris.forEach((v, k) => {
    let r = remap.get(v);
    if (r === undefined) {
      r = remap.size; remap.set(v, r);
      pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      nrm.push(N8[v * 4] / 127, N8[v * 4 + 1] / 127, N8[v * 4 + 2] / 127);
      uv.push(UV[v * 2], UV[v * 2 + 1]);
    }
    idx[k] = r;
  });
  patches[name] = { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx };
  console.log(name, 'verts', remap.size, 'tris', tris.length / 3);
  if (remap.size > 65000) throw new Error('too many verts for uint16');
}

// ---- write: [u32 headerLen][json][payload…] ----
const header = { patches: {} };
const chunks = [];
let off = 0;
for (const [name, p] of Object.entries(patches)) {
  const e = {};
  for (const k of ['pos', 'nrm', 'uv', 'idx']) {
    const arr = p[k]; const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    e[k] = { off, len: arr.length, type: arr instanceof Uint16Array ? 'u16' : 'f32' };
    chunks.push(buf); off += buf.length;
    if (off % 4) { const pad = Buffer.alloc(4 - (off % 4)); chunks.push(pad); off += pad.length; }
  }
  header.patches[name] = e;
}
const hj = Buffer.from(JSON.stringify(header)); const hpad = Buffer.alloc((4 - ((hj.length + 4) % 4)) % 4, 0x20);
const out = Buffer.concat([Buffer.from(new Uint32Array([hj.length + hpad.length]).buffer), hj, hpad, ...chunks]);
fs.writeFileSync(DST, out);
console.log('wrote', DST, (out.length / 1024).toFixed(1), 'KB');
