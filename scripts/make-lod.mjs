// Generates a decimated copy of the Ryoma model (public/models/ryoma_lod.glb).
// The LOD is used for the shadow pass and the "軽量モード" (light mode).
// Textures are NOT duplicated: at runtime the LOD reuses the full model's material.
//
//   node scripts/make-lod.mjs [ratio]   (default 0.2 → ~380k tris)

import fs from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = path.resolve('public/models/ryoma.glb');
const DST = path.resolve('public/models/ryoma_lod.glb');
const RATIO = Number(process.argv[2] || 0.2);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

// ---------- read GLB ----------
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

const posRaw = readBufferView(accPos.bufferView);
const nrmRaw = readBufferView(accNrm.bufferView);
const uvRaw = readBufferView(accUv.bufferView);
const idxRaw = readBufferView(accIdx.bufferView);

const n = accPos.count;
const positions = new Float32Array(posRaw.buffer, posRaw.byteOffset, n * 3);
const uvs = new Float32Array(uvRaw.buffer, uvRaw.byteOffset, n * 2);
const normalsI8 = new Int8Array(nrmRaw.buffer, nrmRaw.byteOffset, n * 4);
const indices = new Uint32Array(idxRaw.buffer, idxRaw.byteOffset, accIdx.count);

console.log(`source: ${n} verts, ${indices.length / 3} tris`);

// ---------- simplify (attribute aware: keep UV seams reasonable) ----------
const normals = new Float32Array(n * 3);
for (let i = 0; i < n; i++) {
  normals[i * 3] = normalsI8[i * 4] / 127;
  normals[i * 3 + 1] = normalsI8[i * 4 + 1] / 127;
  normals[i * 3 + 2] = normalsI8[i * 4 + 2] / 127;
}
// interleave attributes for simplifyWithAttributes: [nx,ny,nz,u,v]
const attrs = new Float32Array(n * 5);
for (let i = 0; i < n; i++) {
  attrs[i * 5] = normals[i * 3];
  attrs[i * 5 + 1] = normals[i * 3 + 1];
  attrs[i * 5 + 2] = normals[i * 3 + 2];
  attrs[i * 5 + 3] = uvs[i * 2];
  attrs[i * 5 + 4] = uvs[i * 2 + 1];
}
const target = Math.floor((indices.length * RATIO) / 3) * 3;
const [simpIdx, err] = MeshoptSimplifier.simplifyWithAttributes(
  indices, positions, 3, attrs, 5, [0.5, 0.5, 0.5, 1.5, 1.5], null, target, 0.02, ['LockBorder']
);
console.log(`simplified: ${simpIdx.length / 3} tris (error ${err.toFixed(5)})`);

// ---------- compact vertex buffer ----------
const remap = new Uint32Array(n).fill(0xffffffff);
let nv = 0;
for (let i = 0; i < simpIdx.length; i++) {
  const v = simpIdx[i];
  if (remap[v] === 0xffffffff) remap[v] = nv++;
}
const newPos = new Float32Array(nv * 3);
const newNrm = new Int8Array(nv * 4);
const newUv = new Float32Array(nv * 2);
for (let v = 0; v < n; v++) {
  const r = remap[v];
  if (r === 0xffffffff) continue;
  newPos.set(positions.subarray(v * 3, v * 3 + 3), r * 3);
  newNrm.set(normalsI8.subarray(v * 4, v * 4 + 4), r * 4);
  newUv.set(uvs.subarray(v * 2, v * 2 + 2), r * 2);
}
const newIdx = new Uint32Array(simpIdx.length);
for (let i = 0; i < simpIdx.length; i++) newIdx[i] = remap[simpIdx[i]];

// optimise order for GPU + compression.
// NOTE: reorderMesh rewrites `newIdx` in place and returns the vertex remap table.
const [remap2, unique] = MeshoptEncoder.reorderMesh(newIdx, true, true);
const pos2 = new Float32Array(unique * 3), nrm2 = new Int8Array(unique * 4), uv2 = new Float32Array(unique * 2);
for (let v = 0; v < nv; v++) {
  const r = remap2[v];
  if (r === 0xffffffff) continue;
  pos2.set(newPos.subarray(v * 3, v * 3 + 3), r * 3);
  nrm2.set(newNrm.subarray(v * 4, v * 4 + 4), r * 4);
  uv2.set(newUv.subarray(v * 2, v * 2 + 2), r * 2);
}
// ---------- meshopt encode ----------
function enc(bytes, count, stride, mode, filter) {
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mode === 'TRIANGLES') return MeshoptEncoder.encodeGltfBuffer(u8, count, stride, mode);
  let data = u8;
  if (filter === 'EXPONENTIAL') data = MeshoptEncoder.encodeFilterExp(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), count, stride, 15, 'SharedVector');
  return MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode);
}
const encPos = enc(pos2, unique, 12, 'ATTRIBUTES', 'EXPONENTIAL');
const encNrm = enc(nrm2, unique, 4, 'ATTRIBUTES');
const encUv = enc(uv2, unique, 8, 'ATTRIBUTES', 'EXPONENTIAL');
const encIdx = enc(newIdx, newIdx.length, 4, 'TRIANGLES');

let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < unique; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos2[i * 3 + k]); max[k] = Math.max(max[k], pos2[i * 3 + k]); }

// ---------- write GLB ----------
const chunks = [];
let off = 0;
function pushChunk(u8) { const o = off; chunks.push(u8); off += u8.byteLength; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } return o; }
const oPos = pushChunk(encPos), oNrm = pushChunk(encNrm), oUv = pushChunk(encUv), oIdx = pushChunk(encIdx);
const fallbackLen = unique * 12 + unique * 4 + unique * 8 + newIdx.length * 4;

const out = {
  asset: { version: '2.0', generator: 'ryoma make-lod' },
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'ryoma_lod' }],
  meshes: [{ name: 'ryoma_lod', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: 'ryoma_lod_placeholder', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: unique, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5120, count: unique, type: 'VEC3', normalized: true },
    { bufferView: 2, componentType: 5126, count: unique, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: newIdx.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 1, byteOffset: 0, byteLength: unique * 12, byteStride: 12, target: 34962, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: oPos, byteLength: encPos.byteLength, byteStride: 12, mode: 'ATTRIBUTES', filter: 'EXPONENTIAL', count: unique } } },
    { buffer: 1, byteOffset: unique * 12, byteLength: unique * 4, byteStride: 4, target: 34962, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: oNrm, byteLength: encNrm.byteLength, byteStride: 4, mode: 'ATTRIBUTES', count: unique } } },
    { buffer: 1, byteOffset: unique * 16, byteLength: unique * 8, byteStride: 8, target: 34962, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: oUv, byteLength: encUv.byteLength, byteStride: 8, mode: 'ATTRIBUTES', filter: 'EXPONENTIAL', count: unique } } },
    { buffer: 1, byteOffset: unique * 24, byteLength: newIdx.length * 4, target: 34963, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: oIdx, byteLength: encIdx.byteLength, byteStride: 4, mode: 'TRIANGLES', count: newIdx.length } } },
  ],
  buffers: [{ byteLength: off }, { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }],
};

let jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
while (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);
const binBuf = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(DST, Buffer.concat([header, jh, jsonBuf, bh, binBuf]));
console.log(`wrote ${DST}: ${unique} verts, ${newIdx.length / 3} tris, ${(total / 1024 / 1024).toFixed(2)} MB`);
