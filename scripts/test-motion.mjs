/**
 * ポーズごとに「手がどこへ行くか」を正面図（縦=Y・横=Z）で出す。
 * 目視できない環境で、手が胴体から出ているか・変な方向へ飛んでいないかを確認する。
 * 使い方: node scripts/test-motion.mjs [ポーズ名 ...]
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BONE_DEFS, buildSkeleton, computeSkinWeights, POSES, Rig } from '../src/world/rig.js';

const file = 'public/ryoma.glb';
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

const wanted = process.argv.slice(2);

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', (gltf) => {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  let src = null;
  model.traverse((o) => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry;
  geo.applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const s = 1.72 / (geo.boundingBox.max.y - geo.boundingBox.min.y);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const b2 = geo.boundingBox;
  geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);

  const iter = computeSkinWeights(geo);
  for (;;) { if (iter.next().done) break; }

  const built = buildSkeleton();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  const rootG = new THREE.Group();
  rootG.add(mesh);
  rootG.add(built.root);
  const scene = new THREE.Scene();
  scene.add(rootG);
  rootG.updateMatrixWorld(true);
  mesh.bind(built.skeleton, mesh.matrixWorld);
  const rig = new Rig(built);

  const pos = geo.attributes.position;
  const idx = geo.attributes.skinIndex.array;
  const wts = geo.attributes.skinWeight.array;
  const N = pos.count;
  const handR = BONE_DEFS.findIndex((b) => b.name === 'handR');
  const handL = BONE_DEFS.findIndex((b) => b.name === 'handL');
  const armR = BONE_DEFS.findIndex((b) => b.name === 'armR');
  const armL = BONE_DEFS.findIndex((b) => b.name === 'armL');

  // 支配ボーンのキャッシュ
  const dom = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = wts[i * 4 + k]; if (w > bw) { bw = w; bi = idx[i * 4 + k]; } }
    dom[i] = bi;
  }

  const skin = (i, boneMat) => {
    const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const acc = new THREE.Vector3();
    const o = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (let k = 0; k < 4; k++) {
      const bi = idx[i * 4 + k], w = wts[i * 4 + k];
      if (!w) continue;
      m.fromArray(boneMat, bi * 16);
      o.copy(p).applyMatrix4(m).multiplyScalar(w);
      acc.add(o);
    }
    return acc;
  };

  const W = 54, H = 40;
  function render(label) {
    // 正面図：縦 = Y（0〜1.75m）、横 = Z（-0.30〜+0.30m）
    built.skeleton.update();
    const boneMat = built.skeleton.boneMatrices;
    const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
    const ctr = {
      R: new THREE.Vector3(), L: new THREE.Vector3(), nR: 0, nL: 0,
      hR: new THREE.Vector3(), hL: new THREE.Vector3(), nhR: 0, nhL: 0,
    };
    for (let i = 0; i < N; i += 3) {
      const p = skin(i, boneMat);
      const z = p.z, y = p.y;
      const cx = Math.round(((z + 0.3) / 0.6) * (W - 1));
      const cy = Math.round((1 - y / 1.78) * (H - 1));
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
      const d = dom[i];
      if (d === handR) { grid[cy][cx] = 'r'; ctr.hR.add(p); ctr.nhR++; ctr.R.add(p); ctr.nR++; }
      else if (d === handL) { grid[cy][cx] = 'l'; ctr.hL.add(p); ctr.nhL++; ctr.L.add(p); ctr.nL++; }
      else if (d === armR) { grid[cy][cx] = 'R'; ctr.R.add(p); ctr.nR++; }
      else if (d === armL) { grid[cy][cx] = 'L'; ctr.L.add(p); ctr.nL++; }
      else if (grid[cy][cx] === ' ') grid[cy][cx] = '·';
    }
    console.log(`\n──── ${label} ────   (縦=高さ 0〜1.78m / 横=左右 ±30cm / R=右手腕 L=左手腕)`);
    console.log(grid.map((r) => '   ' + r.join('')).join('\n'));
    const f = (v, n) => n ? `x=${(v.x / n).toFixed(3)} y=${(v.y / n).toFixed(3)} z=${(v.z / n).toFixed(3)}` : '―';
    console.log(`   右腕 ${f(ctr.R, ctr.nR)}   右手 ${f(ctr.hR, ctr.nhR)}`);
    console.log(`   左腕 ${f(ctr.L, ctr.nL)}   左手 ${f(ctr.hL, ctr.nhL)}`);
  }

  const names = wanted.length ? wanted : ['rest', ...Object.keys(POSES).filter((k) => k !== 'rest')];
  for (const name of names) {
    rig.play([{ pose: POSES[name] || POSES.rest, dur: 0.001 }], { loop: true });
    for (let i = 0; i < 40; i++) rig.update(1 / 60);
    scene.updateMatrixWorld(true);
    render(name);
  }
  process.exit(0);
}, (e) => { console.error(e); process.exit(1); });
