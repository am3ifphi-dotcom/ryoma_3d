import * as THREE from 'three';
import {
  chalkboardTexture, outsideTexture, vendingTexture, noticeTexture,
  floorTexture, woodTexture, wallTexture, corridorPosterTexture,
} from './textures.js';

export const ROOM = {
  xMin: -4.5, xMax: 4.5,   // 窓側が +X、廊下側が -X
  zMin: -4.0, zMax: 4.0,   // -Z が前（黒板）、+Z が後ろ
  h: 3.1,
};

const W = ROOM.xMax - ROOM.xMin;
const D = ROOM.zMax - ROOM.zMin;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const CZ = (ROOM.zMin + ROOM.zMax) / 2;

function box(w, h, d, mat, x, y, z, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  return m;
}

/**
 * 北棟・理数科B組の教室を組み立てる
 * 返り値 { group, fan, vending, setCornSoup(bool), lights }
 */
export function buildClassroom({ cornSoup = true } = {}) {
  const group = new THREE.Group();
  group.name = 'classroom';

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.62, metalness: 0.02 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture('#c8a173'), roughness: 0.72 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x39414a, roughness: 0.7 });

  /* ── 床・天井 ── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(CX, ROOM.h, CZ);
  group.add(ceil);

  /* ── 壁 ── */
  const wallH = ROOM.h;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, wallH), wallMat);
  back.position.set(CX, wallH / 2, ROOM.zMax);
  back.rotation.y = Math.PI;
  back.receiveShadow = true;
  group.add(back);

  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, wallH), wallMat);
  front.position.set(CX, wallH / 2, ROOM.zMin);
  front.receiveShadow = true;
  group.add(front);

  // 窓側（+X）: 腰壁 + 窓 + 上壁
  const winY0 = 0.95, winY1 = 2.35;
  group.add(box(0.12, winY0, D, wallMat, ROOM.xMax, winY0 / 2, CZ));
  group.add(box(0.12, wallH - winY1, D, wallMat, ROOM.xMax, (wallH + winY1) / 2, CZ));

  // 廊下側（-X）: 扉の分だけ壁を三つに分ける
  const dz = 1.2, dw = 0.95, dh = 2.05;
  const zA0 = ROOM.zMin, zA1 = dz - dw;      // 0.25
  const zB0 = dz + dw, zB1 = ROOM.zMax;      // 2.15
  group.add(box(0.12, wallH, zA1 - zA0, wallMat, ROOM.xMin, wallH / 2, (zA0 + zA1) / 2));
  group.add(box(0.12, wallH, zB1 - zB0, wallMat, ROOM.xMin, wallH / 2, (zB0 + zB1) / 2));
  group.add(box(0.12, wallH - dh, zB0 - zA0, wallMat, ROOM.xMin, (wallH + dh) / 2, dz));

  /* ── 窓（+X 面）── */
  const windowGroup = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff0ff, transparent: true, opacity: 0.18, roughness: 0.05,
    metalness: 0, transmission: 0.6, thickness: 0.02,
  });
  const nWin = 5;
  for (let i = 0; i < nWin; i++) {
    const z = ROOM.zMin + 0.55 + i * ((D - 1.1) / nWin);
    const ww = (D - 1.1) / nWin - 0.22, wh = winY1 - winY0 - 0.14;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(ROOM.xMax - 0.05, (winY0 + winY1) / 2, z);
    windowGroup.add(glass);
    // 桟
    windowGroup.add(box(0.1, 0.08, ww + 0.1, frameMat, ROOM.xMax - 0.05, winY0 + 0.07, z));
    windowGroup.add(box(0.1, 0.08, ww + 0.1, frameMat, ROOM.xMax - 0.05, winY1 - 0.07, z));
    windowGroup.add(box(0.1, wh, 0.07, frameMat, ROOM.xMax - 0.05, (winY0 + winY1) / 2, z - ww / 2));
    windowGroup.add(box(0.1, wh, 0.07, frameMat, ROOM.xMax - 0.05, (winY0 + winY1) / 2, z + ww / 2));
    windowGroup.add(box(0.14, 0.1, D / nWin - 0.2, frameMat, ROOM.xMax - 0.05, (winY0 + winY1) / 2, z + (D - 1.1) / nWin / 2));
  }
  group.add(windowGroup);

  // 窓の外
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 14),
    new THREE.MeshBasicMaterial({ map: outsideTexture() })
  );
  outside.position.set(ROOM.xMax + 9, 3.4, CZ);
  outside.rotation.y = -Math.PI / 2;
  group.add(outside);
  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a9a7b, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ROOM.xMax + 9, -0.01, CZ);
  group.add(ground);

  /* ── 室外機（窓の真横）── */
  const outd = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xbdb2a4, roughness: 0.8, metalness: 0.15 });
  outd.add(box(0.34, 0.55, 0.78, boxMat, 0, 0, 0));
  outd.add(box(0.06, 0.5, 0.72, darkMat, 0.19, 0, 0)); // 前面パネル
  const fan = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), darkMat);
  hub.rotation.z = Math.PI / 2;
  fan.add(hub);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.19, 0.09), bladeMat);
    b.position.x = 0.03;
    b.rotation.x = (i * Math.PI) / 2;
    b.position.y = Math.cos((i * Math.PI) / 2) * 0.11;
    b.position.z = Math.sin((i * Math.PI) / 2) * 0.11;
    fan.add(b);
  }
  fan.position.set(0.22, 0, 0);
  outd.add(fan);
  const grille = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.23, 24, 1),
    new THREE.MeshStandardMaterial({ color: 0x6e665c, roughness: 0.9, side: THREE.DoubleSide, wireframe: true })
  );
  grille.rotation.y = Math.PI / 2;
  grille.position.set(0.23, 0, 0);
  outd.add(grille);
  outd.position.set(ROOM.xMax + 0.22, 1.25, -1.5);
  group.add(outd);

  /* ── 黒板（-Z 面）── */
  const boardTex = chalkboardTexture();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.9, 1.35),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.92, metalness: 0 })
  );
  board.position.set(CX, 1.62, ROOM.zMin + 0.03);
  board.receiveShadow = true;
  group.add(board);
  group.add(box(4.1, 1.55, 0.06, woodMat, CX, 1.62, ROOM.zMin + 0.01));
  group.add(box(4.1, 0.06, 0.16, woodMat, CX, 0.86, ROOM.zMin + 0.09)); // チョーク置き
  // 時計
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 32),
    new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.6 })
  );
  clockFace.position.set(CX, 2.68, ROOM.zMin + 0.04);
  group.add(clockFace);
  group.add(box(0.42, 0.42, 0.05, darkMat, CX, 2.68, ROOM.zMin + 0.01));
  const hands = new THREE.Group();
  const hourPivot = new THREE.Group();
  hourPivot.add(box(0.018, 0.09, 0.01, darkMat, 0, 0.045, 0));
  const minPivot = new THREE.Group();
  minPivot.add(box(0.014, 0.14, 0.01, darkMat, 0, 0.07, 0));
  hands.add(hourPivot, minPivot);
  hands.position.set(CX, 2.68, ROOM.zMin + 0.06);
  group.add(hands);

  // 掲示板（後ろ +Z）
  const notice = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.5),
    new THREE.MeshStandardMaterial({ map: noticeTexture(), roughness: 0.9 })
  );
  notice.rotation.y = Math.PI;
  notice.position.set(0.2, 1.7, ROOM.zMax - 0.03);
  group.add(notice);
  group.add(box(2.95, 1.65, 0.06, woodMat, 0.2, 1.7, ROOM.zMax - 0.01));

  /* ── 机・椅子（5列×8行＝40）── */
  const desks = new THREE.Group();
  const cols = [-3.2, -1.6, 0, 1.6, 3.2];
  const rows = [-3.1, -2.3, -1.5, -0.7, 0.1, 0.9, 1.7, 2.5];
  const seats = [];
  for (const x of cols) for (const z of rows) {
    if (z === rows[0] && (x === 0 || x === 1.6)) continue;  // 両馬の立ち位置
    seats.push([x, z]);
  }

  const legMat = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.45, metalness: 0.5 });
  const parts = [
    // [geometry, material, [dx, dy, dz]]
    [new THREE.BoxGeometry(0.62, 0.035, 0.44), woodMat, [0, 0.73, 0]],
    [new THREE.BoxGeometry(0.03, 0.72, 0.42), legMat, [-0.28, 0.36, 0]],
    [new THREE.BoxGeometry(0.03, 0.72, 0.42), legMat, [0.28, 0.36, 0]],
    [new THREE.BoxGeometry(0.6, 0.05, 0.03), legMat, [0, 0.2, -0.16]],
    // 椅子
    [new THREE.BoxGeometry(0.4, 0.035, 0.36), woodMat, [0, 0.45, 0.46]],
    [new THREE.BoxGeometry(0.4, 0.26, 0.035), woodMat, [0, 0.68, 0.63]],
    [new THREE.BoxGeometry(0.03, 0.45, 0.03), legMat, [-0.17, 0.225, 0.3]],
    [new THREE.BoxGeometry(0.03, 0.45, 0.03), legMat, [0.17, 0.225, 0.3]],
    [new THREE.BoxGeometry(0.03, 0.45, 0.03), legMat, [-0.17, 0.225, 0.62]],
    [new THREE.BoxGeometry(0.03, 0.45, 0.03), legMat, [0.17, 0.225, 0.62]],
  ];
  const dummy = new THREE.Object3D();
  for (const [geo, mat, off] of parts) {
    const inst = new THREE.InstancedMesh(geo, mat, seats.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    seats.forEach(([x, z], i) => {
      dummy.position.set(x + off[0], off[1], z + off[2]);
      dummy.rotation.set(0, Math.PI + (Math.random() - 0.5) * 0.16, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    desks.add(inst);
  }
  group.add(desks);

  /* ── 両馬の机の上のスマホ ── */
  const phone = box(0.07, 0.012, 0.14, new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.3, metalness: 0.4 }),
    0.12, 0.752, -2.2, [0, 0.5, 0]);
  group.add(phone);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.058, 0.125),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 })
  );
  screen.rotation.x = -Math.PI / 2;
  screen.rotation.z = -0.5;
  screen.position.set(0.12, 0.759, -2.2);
  group.add(screen);

  /* ── 天井の蛍光灯 ── */
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.5, roughness: 1,
  });
  for (const x of [-2.2, 2.2]) {
    for (const z of [-2.2, 0, 2.2]) {
      const l = box(0.24, 0.07, 1.25, lampMat, x, ROOM.h - 0.09, z);
      group.add(l);
    }
  }

  /* ── 廊下（-X の外）── */
  const corridor = new THREE.Group();
  const cFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, D + 2),
    new THREE.MeshStandardMaterial({ map: floorTexture(), color: 0xcfc6b4, roughness: 0.7 })
  );
  cFloor.rotation.x = -Math.PI / 2;
  cFloor.position.set(ROOM.xMin - 1.6, 0, CZ);
  corridor.add(cFloor);
  const cWall = new THREE.Mesh(new THREE.PlaneGeometry(D + 2, wallH), wallMat);
  cWall.rotation.y = Math.PI / 2;
  cWall.position.set(ROOM.xMin - 3.2, wallH / 2, CZ);
  corridor.add(cWall);

  // 自販機
  const vendTex = vendingTexture(cornSoup);
  const vendMat = new THREE.MeshStandardMaterial({ map: vendTex, roughness: 0.55, metalness: 0.1 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: 0.6, metalness: 0.15 });
  const vending = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.9, 0.95),
    [vendMat, sideMat, sideMat, sideMat, sideMat, sideMat]
  );
  vending.position.set(ROOM.xMin - 2.85, 0.95, 1.4);   // 扉の正面あたり
  vending.rotation.y = 0;                               // 正面（+X）を教室側に向ける
  vending.castShadow = true;
  vending.name = '自販機';
  corridor.add(vending);

  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.85),
    new THREE.MeshStandardMaterial({ map: corridorPosterTexture(), roughness: 0.9 })
  );
  poster.rotation.y = Math.PI / 2;
  poster.position.set(ROOM.xMin - 3.17, 1.75, -0.7);
  corridor.add(poster);
  group.add(corridor);

  /* ── 扉（少し開いている）── */
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.5, metalness: 0.3 });
  group.add(box(0.16, dh + 0.1, 0.08, doorFrameMat, ROOM.xMin, (dh + 0.1) / 2, zA1));
  group.add(box(0.16, dh + 0.1, 0.08, doorFrameMat, ROOM.xMin, (dh + 0.1) / 2, zB0));
  group.add(box(0.16, 0.1, zB0 - zA1, doorFrameMat, ROOM.xMin, dh + 0.05, dz));
  const doorPivot = new THREE.Group();
  doorPivot.position.set(ROOM.xMin + 0.04, 0, zB0);
  const door = box(0.05, dh - 0.04, zB0 - zA1 - 0.06,
    new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.8 }), 0, (dh - 0.04) / 2, -(zB0 - zA1) / 2);
  doorPivot.add(door);
  doorPivot.rotation.y = -0.95;  // 教室側に開く（廊下の自販機が見える）
  group.add(doorPivot);

  return { group, fan, hands, vending, vendMat, cornSoup, screen };
}

/** 照明を追加する */
export function buildLights(scene, { quality = 'high' } = {}) {
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x6a5c48, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(11, 7.5, 1.5);
  sun.target.position.set(0, 1, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  const s = 7;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5);
  fill.position.set(-6, 5, 4);
  scene.add(fill);

  const lamps = [];
  for (const z of [-2.2, 0, 2.2]) {
    const p = new THREE.PointLight(0xfff4e2, 9, 9, 2);
    p.position.set(0, 2.85, z);
    scene.add(p);
    lamps.push(p);
  }
  return { hemi, sun, fill, lamps };
}
