// Dumps the decoded (meshopt) POSITION / TEXCOORD_0 / indices of the pristine Tripo GLB
// into .tmp/ for scripts/pad-textures.py.
//   git show 947cdc8:tripo_pbr_model_027619a0-6088-43a9-a361-f4bf67271416_meshopt.glb > .tmp/ryoma_orig.glb
//   node scripts/dump-uv.mjs && python3 scripts/pad-textures.py
import fs from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const SRC = process.argv[2] || '.tmp/ryoma_orig.glb';
const file = fs.readFileSync(SRC);
const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
const jsonLen = dv.getUint32(12, true);
const json = JSON.parse(file.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = file.subarray(20 + jsonLen + 8);
function rb(i) {
  const bv = json.bufferViews[i];
  const ext = bv.extensions?.EXT_meshopt_compression;
  if (!ext) return new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const src = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
  const out = new Uint8Array(ext.count * ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter);
  return out;
}
const prim = json.meshes[0].primitives[0];
const au = json.accessors[prim.attributes.TEXCOORD_0], ai = json.accessors[prim.indices], ap = json.accessors[prim.attributes.POSITION];
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/uv.f32', Buffer.from(rb(au.bufferView).buffer, 0, au.count * 8));
fs.writeFileSync('.tmp/idx.u32', Buffer.from(rb(ai.bufferView).buffer, 0, ai.count * 4));
fs.writeFileSync('.tmp/pos.f32', Buffer.from(rb(ap.bufferView).buffer, 0, ap.count * 12));
console.log('verts', au.count, 'indices', ai.count);
