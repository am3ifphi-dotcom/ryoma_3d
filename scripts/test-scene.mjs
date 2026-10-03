/**
 * ヘッドレス確認用: 教室を組み立てて、各カメラ位置から両馬が見えるかをレイキャストで確かめる。
 * 画面が見られない環境での「とりあえず壊れていないか」チェック。
 */
import * as THREE from 'three';

/* ── 最小の canvas スタブ（テクスチャ生成を通すため） ── */
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
    const c = { width: 1, height: 1, getContext: () => ctxProxy, style: {} };
    return c;
  },
  createElementNS() { return { style: {} }; },
};

const { buildClassroom, buildLights } = await import('../src/world/classroom.js');
const { Ryoma } = await import('../src/world/ryoma.js');

const scene = new THREE.Scene();
const classroom = buildClassroom({ cornSoup: true });
scene.add(classroom.group);
buildLights(scene, { quality: 'high' });

// 両馬の代役（高さ 0.98 → Ryoma が 1.72 に正規化する）
const stand = new THREE.Mesh(
  new THREE.BoxGeometry(0.24, 0.978, 0.31),
  new THREE.MeshStandardMaterial({ color: 0x888888 })
);
const ryoma = new Ryoma(stand, { position: new THREE.Vector3(0.55, 0, -2.75) });
scene.add(ryoma.root);
scene.updateMatrixWorld(true);

const boxAll = new THREE.Box3().setFromObject(classroom.group);
console.log('教室の包围:', boxAll.min.toArray().map((v) => v.toFixed(2)).join(','),
  '→', boxAll.max.toArray().map((v) => v.toFixed(2)).join(','));
console.log('両馬 root:', ryoma.root.position.toArray().join(','), ' 身長:', ryoma.height,
  ' 足元y:', new THREE.Box3().setFromObject(stand).min.y.toFixed(3));

const VIEWS = {
  seat: { pos: [0.9, 1.42, -1.0], target: [0.55, 1.3, -2.75] },
  side: { pos: [3.05, 1.52, -1.5], target: [0.55, 1.3, -2.75] },
  board: { pos: [-0.7, 1.72, 0.4], target: [0.1, 1.6, -3.9] },
  room: { pos: [3.5, 2.55, 3.3], target: [0, 0.9, -0.9] },
  corridor: { pos: [-5.9, 1.6, 1.7], target: [0.2, 1.35, -2.5] },
};

const rc = new THREE.Raycaster();
for (const [name, v] of Object.entries(VIEWS)) {
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.08, 200);
  cam.position.set(...v.pos);
  cam.lookAt(new THREE.Vector3(...v.target));
  cam.updateMatrixWorld(true);

  const pts = {
    頭: new THREE.Vector3(0.55, 1.6, -2.75),
    胸: new THREE.Vector3(0.55, 1.28, -2.75),
    足: new THREE.Vector3(0.55, 0.25, -2.75),
  };
  const out = [];
  for (const [label, p] of Object.entries(pts)) {
    const dir = p.clone().sub(cam.position).normalize();
    rc.set(cam.position, dir);
    const hits = rc.intersectObject(scene, true).filter((h) => h.object.visible);
    const dist = cam.position.distanceTo(p);
    const first = hits[0];
    let o = first?.object, mine = false;
    while (o) { if (o === ryoma.root) { mine = true; break; } o = o.parent; }
    const blocked = first && !mine && first.distance < dist - 0.06;
    out.push(`${label}${blocked ? ' ✗遮断:' + (first.object.name || first.object.type) + '@' + first.distance.toFixed(2) + 'm' : ' ✓'}`);
  }
  // 画面内に入っているか
  const proj = pts.胸.clone().project(cam);
  const inView = Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1;
  console.log(`${name.padEnd(9)} 距離${cam.position.distanceTo(pts.胸).toFixed(2)}m  画面内:${inView ? '○' : '×'}  ${out.join('  ')}`);
}

// 自販機が扉から見えるか
const cam2 = new THREE.PerspectiveCamera(46, 16 / 9, 0.08, 200);
cam2.position.set(-5.9, 1.6, 1.7);
cam2.lookAt(new THREE.Vector3(0.4, 1.4, -2.3));
cam2.updateMatrixWorld(true);
const vendPos = new THREE.Vector3();
classroom.vending.getWorldPosition(vendPos);
const dir = vendPos.clone().sub(cam2.position).normalize();
rc.set(cam2.position, dir);
const hits = rc.intersectObject(scene, true);
console.log('自販機までの最初の衝突:', hits[0]?.object.type, hits[0]?.object.name || '(無名)',
  'dist', hits[0]?.distance.toFixed(2), '自販機まで', cam2.position.distanceTo(vendPos).toFixed(2));
console.log('自販機の向き(+X面が正面):', classroom.vending.rotation.y, '位置', vendPos.toArray().map((v) => v.toFixed(2)).join(','));

// 扉の開口部
console.log('mesh 総数:', (() => { let n = 0; scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) n += 1; }); return n; })());
let tris = 0;
scene.traverse((o) => {
  if (!o.isMesh && !o.isInstancedMesh) return;
  const g = o.geometry;
  const count = g.index ? g.index.count : g.attributes.position.count;
  tris += (count / 3) * (o.isInstancedMesh ? o.count : 1);
});
console.log('三角形（教室のみ）:', Math.round(tris));
