/**
 * ヘッドレス確認（画面が見られない環境での「壊れていないか」チェック）
 *  1. 教室が組めて、机の当たり判定・調べられる物が揃っているか
 *  2. 両馬のダミーが正規化され、向き（+X 正面 → +Z）が合っているか
 *  3. 一人称プレイヤーが壁・机に当たらず両馬の前まで歩けるか
 *  4. 両馬の前で E＝話す（focus）が効くか
 * 使い方: node scripts/test-scene.mjs
 */
import * as THREE from 'three';

/* ── 最小の DOM スタブ ── */
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
  addEventListener() {},
  removeEventListener() {},
  pointerLockElement: null,
  activeElement: null,
  exitPointerLock() {},
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};

const { buildClassroom, buildLights, ROOM } = await import('../src/world/classroom.js');
const { Ryoma } = await import('../src/world/ryoma.js');
const { Player, makeRooms } = await import('../src/player/player.js');

let fails = 0;
const ok = (c, msg) => { console.log(`  ${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };

/* ── 1. 教室 ── */
const scene = new THREE.Scene();
const classroom = buildClassroom({ cornSoup: true });
scene.add(classroom.group);
buildLights(scene, { quality: 'high', time: 'day' });
scene.updateMatrixWorld(true);

let meshes = 0, tris = 0;
classroom.group.traverse((o) => {
  if (!o.isMesh && !o.isInstancedMesh) return;
  meshes++;
  const g = o.geometry;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  tris += n * (o.count || 1);
});
console.log(`\n[教室] メッシュ ${meshes} ・ 三角形 ${Math.round(tris).toLocaleString()} ・ 当たり判定 ${classroom.colliders.length} ・ 調べられる物 ${classroom.interactables.length}`);
ok(meshes > 40, '小物が十分にある（メッシュ40超）');
ok(classroom.colliders.length >= 35, '机などの当たり判定が入っている');
ok(classroom.interactables.length >= 6, '調べられる物が6つ以上');
const boxAll = new THREE.Box3().setFromObject(classroom.group);
console.log('  教室の範囲:', boxAll.min.toArray().map((v) => v.toFixed(2)).join(','), '→', boxAll.max.toArray().map((v) => v.toFixed(2)).join(','));

/* ── 2. 両馬（ダミー：GLB と同じ比率） ── */
const RYOMA_POS = [1.0, 0, -3.65];
const stand = new THREE.Mesh(new THREE.BoxGeometry(0.241, 0.978, 0.313), new THREE.MeshStandardMaterial());
const group = new THREE.Group();
group.add(stand);
const ryoma = new Ryoma(group, { position: new THREE.Vector3(...RYOMA_POS) });
scene.add(ryoma.root);
scene.updateMatrixWorld(true);
const rb = new THREE.Box3().setFromObject(ryoma.root);
console.log(`\n[両馬] 身長 ${(rb.max.y - rb.min.y).toFixed(3)}m  足元y=${rb.min.y.toFixed(3)}  向き=${(ryoma.root.rotation.y * 180 / Math.PI).toFixed(0)}°`);
ok(Math.abs(rb.max.y - ryoma.height) < 0.06, '身長が 1.72m に正規化されている');
ok(Math.abs(rb.min.y) < 0.02, '足元が床（y=0）に接地している');
// モデルの正面(+X)が +Z を向いているか（＝教室の後ろ・プレイヤー側）
const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(ryoma.root.quaternion).normalize();
console.log('  正面ベクトル:', fwd.toArray().map((v) => v.toFixed(2)).join(','));
ok(fwd.z > 0.9, '正面が +Z（教室の後ろ＝プレイヤーが来る側）を向いている');

/* ── 3. 一人称プレイヤー ── */
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.06, 200);
camera.rotation.order = 'YXZ';
const player = new Player(camera, {
  dom: { requestPointerLock() {} },
  colliders: classroom.colliders,
  rooms: makeRooms(ROOM),
});
player.enable(true);
player.interactables = [
  ...classroom.interactables,
  { id: 'ryoma', label: '両馬二郎に話しかける', getPos: () => new THREE.Vector3(RYOMA_POS[0], 1.45, RYOMA_POS[2]), range: 2.8, bonus: 0.25 },
];
player.teleport(0.8, RYOMA_POS[2] + 2.3, 0, -0.04);
console.log(`\n[プレイヤー] 開始位置 ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  視線高 ${player.eye.toFixed(2)}m`);

// 机にぶつかるか：前（-Z）へまっすぐ歩く
let hitDesk = false;
for (let i = 0; i < 600; i++) {
  const before = player.pos.clone();
  player.keys.add('w');
  player.update(1 / 60);
  // 机の当たり判定にめり込んでいないか
  for (const c of classroom.colliders) {
    const nx = Math.max(c.minX, Math.min(player.pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(player.pos.z, c.maxZ));
    if (Math.hypot(player.pos.x - nx, player.pos.z - nz) < player.radius - 0.02) hitDesk = true;
  }
}
player.keys.delete('w');
console.log(`  600フレーム前進後: ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  （めり込み: ${hitDesk ? 'あり' : 'なし'}）`);
ok(!hitDesk, '机・壁にめり込まない');
ok(player.pos.z > ROOM.zMin && player.pos.z < ROOM.zMax, '歩ける範囲の内側にいる');

// 両馬の前まで行けるか（素直に -Z へ）
player.teleport(RYOMA_POS[0], RYOMA_POS[2] + 1.55, 0, -0.05);
player.update(1 / 60);
const dist = Math.hypot(player.pos.x - RYOMA_POS[0], player.pos.z - RYOMA_POS[2]);
console.log(`  両馬の前: 距離 ${dist.toFixed(2)}m`);
ok(dist < 3.0, '両馬の 3m 以内に立てる');

/* ── 4. E で話す（focus） ── */
const focus = player.update(1 / 60);
console.log(`  focus: ${focus ? focus.id + ' / ' + focus.label : '（なし）'}`);
ok(focus && focus.id === 'ryoma', '両馬に近づくと E の対象になる');

// 黒板の前でも E が出るか
player.teleport(-0.3, ROOM.zMin + 1.2, 0, 0);
const f2 = player.update(1 / 60);
console.log(`  黒板の前: ${f2 ? f2.id + ' / ' + f2.label : '（なし）'}`);
ok(f2 && f2.id === 'board', '黒板の前では黒板が対象になる');

// 廊下（自販機）でも出るか
player.teleport(ROOM.xMin - 2.3, 2.6, -Math.PI / 2, 0);   // 自販機は +X 側から見る
const f3 = player.update(1 / 60);
console.log(`  自販機の前: ${f3 ? f3.id + ' / ' + f3.label : '（なし）'}`);
ok(f3 && f3.id === 'vending', '廊下の自販機が対象になる');

/* ── 5. 視界の確認（両馬が見えるか） ── */
const cam2 = new THREE.PerspectiveCamera(62, 16 / 9, 0.06, 200);
cam2.position.set(0.8, 1.62, RYOMA_POS[2] + 2.3);
cam2.rotation.order = 'YXZ';
cam2.rotation.y = 0;
cam2.updateMatrixWorld(true);
const rc = new THREE.Raycaster();
const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam2.quaternion);
rc.set(cam2.position, dir);
const hits = rc.intersectObject(scene, true).filter((h) => h.object.visible && !h.object.name.includes('ryoma'));
const d0 = hits[0]?.distance ?? 99;
console.log(`\n[視界] 開始位置から両馬方向への最初の遮蔽物: ${d0.toFixed(2)}m（両馬までの距離 ${(2.3).toFixed(2)}m）`);
ok(d0 > 1.9, '両馬までの視界が机などで塞がれていない');

console.log(fails === 0 ? '\n✅ すべて通過\n' : `\n❌ ${fails} 件失敗\n`);
process.exit(fails ? 1 : 0);
