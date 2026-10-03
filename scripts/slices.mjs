/**
 * 高さバンドごとの水平断面（X-Z 占有マップ）を ASCII で描く。
 * 向き・手の位置・体格の把握用。 使い方: node scripts/slices.mjs [glb]
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
  let minY = Infinity, maxY = -Infinity;
  for (const p of P) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const H = maxY - minY;

  const bands = [
    ['胸    72-80%', 0.72, 0.80],
    ['肩    80-85%', 0.80, 0.85],
    ['首    85-88%', 0.85, 0.88],
    ['顎    88-91%', 0.88, 0.91],
    ['顔    91-94%', 0.91, 0.94],
    ['目    94-96%', 0.94, 0.96],
    ['頭上  96-100%', 0.96, 1.0],
  ];

  for (const [label, lo, hi] of bands) {
    const sel = P.filter((p) => p[1] >= minY + H * lo && p[1] < minY + H * hi);
    if (!sel.length) continue;
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (const p of sel) {
      if (p[0] < xmin) xmin = p[0]; if (p[0] > xmax) xmax = p[0];
      if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2];
    }
    const W = 62, D = 30;
    const grid = Array.from({ length: D }, () => new Array(W).fill(' '));
    for (const p of sel) {
      const x = Math.round(((p[0] - xmin) / (xmax - xmin || 1)) * (W - 1));
      const y = Math.round(((p[2] - zmin) / (zmax - zmin || 1)) * (D - 1));
      grid[y][x] = grid[y][x] === ' ' ? '.' : (grid[y][x] === '.' ? '+' : '#');
    }
    console.log(`\n■ ${label}  幅X=${(xmax - xmin).toFixed(3)}  奥行Z=${(zmax - zmin).toFixed(3)}  n=${sel.length}   (横=X, 縦=Z, 上が -Z / 下が +Z, 左が -X / 右が +X)`);
    console.log(grid.map((r) => '  ' + r.join('')).join('\n'));
  }
  process.exit(0);
}, (e) => { console.error(e); process.exit(1); });
