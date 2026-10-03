import * as THREE from 'three';
import {
  chalkboardTexture, outsideTexture, vendingTexture, noticeTexture,
  floorTexture, woodTexture, wallTexture, corridorPosterTexture,
  timetableTexture, rulePosterTexture, curtainTexture, lockerTexture,
  ceilingTexture, bookCoverTexture, namePlateTexture,
} from './textures.js';

export const ROOM = {
  xMin: -4.5, xMax: 4.5,   // 窓側が +X、廊下側が -X
  zMin: -4.6, zMax: 4.9,   // -Z が前（黒板）、+Z が後ろ（掲示板）
  h: 3.2,
};

const W = ROOM.xMax - ROOM.xMin;
const D = ROOM.zMax - ROOM.zMin;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const CZ = (ROOM.zMin + ROOM.zMax) / 2;

function box(w, h, d, mat, x, y, z, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ────────────────────────────────────────────────
   配色は参照画像の解析値から：
     壁 #ece3c5 / 天井 #f4ebcc / 黒板 #282a2d / 床 #8d97a3 / 机 #d5b8a4
   ──────────────────────────────────────────────── */
export const PALETTE = {
  wall: 0xece3c5,
  ceil: 0xf4ebcc,
  board: 0x282a2d,
  floor: 0x8d97a3,
  desk: 0xd5b8a4,
  frame: 0x8f9cad,
  wood: 0xc9a480,
  dark: 0x3a4149,
};

/** 当たり判定（XZ の AABB） */
const colliders = [];
export function addCollider(minX, maxX, minZ, maxZ, tag = '') {
  colliders.push({ minX, maxX, minZ, maxZ, tag });
}

/**
 * 北棟・理数科B組の教室
 * 返り値 { group, fan, hands, vending, vendMat, screen, colliders, interactables, seatOf, sunbeams, curtain }
 */
export function buildClassroom({ cornSoup = true } = {}) {
  const group = new THREE.Group();
  group.name = 'classroom';
  colliders.length = 0;
  const interactables = [];

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), color: PALETTE.wall, roughness: 0.96 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), color: 0xffffff, roughness: 0.55, metalness: 0.03 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTexture(), color: PALETTE.ceil, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture('#c9a480'), roughness: 0.7 });
  const deskMat = new THREE.MeshStandardMaterial({ map: woodTexture('#d5b8a4'), roughness: 0.62 });
  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.45, metalness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: PALETTE.dark, roughness: 0.7 });
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTexture(), roughness: 0.95, side: THREE.DoubleSide });

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
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, wallH), wallMat);
  front.position.set(CX, wallH / 2, ROOM.zMin);
  front.receiveShadow = true;
  group.add(front);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, wallH), wallMat);
  back.position.set(CX, wallH / 2, ROOM.zMax);
  back.rotation.y = Math.PI;
  back.receiveShadow = true;
  group.add(back);

  // 窓側（+X）: 腰壁 + 窓 + 上壁
  const winY0 = 0.95, winY1 = 2.45;
  group.add(box(0.12, winY0, D, wallMat, ROOM.xMax, winY0 / 2, CZ));
  group.add(box(0.12, wallH - winY1, D, wallMat, ROOM.xMax, (wallH + winY1) / 2, CZ));

  // 廊下側（-X）: 扉の分だけ壁を三つに分ける
  const dz = 1.3, dw = 0.95, dh = 2.05;
  const zA0 = ROOM.zMin, zA1 = dz - dw;
  const zB0 = dz + dw, zB1 = ROOM.zMax;
  group.add(box(0.12, wallH, zA1 - zA0, wallMat, ROOM.xMin, wallH / 2, (zA0 + zA1) / 2));
  group.add(box(0.12, wallH, zB1 - zB0, wallMat, ROOM.xMin, wallH / 2, (zB0 + zB1) / 2));
  group.add(box(0.12, wallH - dh, zB0 - zA0, wallMat, ROOM.xMin, (wallH + dh) / 2, dz));

  /* ── 窓（+X 面）── */
  const nWin = 5;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8f2ff, transparent: true, opacity: 0.16, roughness: 0.04,
    metalness: 0, transmission: 0.55, thickness: 0.01,
  });
  for (let i = 0; i < nWin; i++) {
    const z = ROOM.zMin + 0.62 + i * ((D - 1.15) / nWin);
    const ww = (D - 1.15) / nWin - 0.2, wh = winY1 - winY0 - 0.12;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(ROOM.xMax - 0.04, (winY0 + winY1) / 2, z);
    group.add(glass);
    group.add(box(0.1, 0.07, ww + 0.08, frameMat, ROOM.xMax - 0.04, winY0 + 0.05, z));
    group.add(box(0.1, 0.07, ww + 0.08, frameMat, ROOM.xMax - 0.04, winY1 - 0.05, z));
    group.add(box(0.1, wh, 0.06, frameMat, ROOM.xMax - 0.04, (winY0 + winY1) / 2, z - ww / 2));
    group.add(box(0.1, wh, 0.06, frameMat, ROOM.xMax - 0.04, (winY0 + winY1) / 2, z + ww / 2));
    group.add(box(0.12, wh * 0.5, 0.05, frameMat, ROOM.xMax - 0.04, (winY0 + winY1) / 2, z)); // 中桟
    group.add(box(0.13, 0.09, D / nWin - 0.2, frameMat, ROOM.xMax - 0.04, (winY0 + winY1) / 2, z + (D - 1.15) / nWin / 2));
    // カーテン（両端にたたんだ状態）
    for (const sgn of [-1, 1]) {
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.2, winY1 - winY0 + 0.1), curtainMat);
      cur.rotation.y = -Math.PI / 2;
      cur.position.set(ROOM.xMax - 0.12, (winY0 + winY1) / 2, z + sgn * (ww / 2 + 0.08));
      cur.castShadow = true;
      group.add(cur);
    }
    // 窓枠のレール
    group.add(box(0.14, 0.05, ww + 0.24, frameMat, ROOM.xMax - 0.05, winY0 - 0.04, z));
  }

  // 窓の外
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 16),
    new THREE.MeshBasicMaterial({ map: outsideTexture() })
  );
  outside.position.set(ROOM.xMax + 11, 3.6, CZ);
  outside.rotation.y = -Math.PI / 2;
  group.add(outside);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 46),
    new THREE.MeshStandardMaterial({ color: 0x8a9a7b, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ROOM.xMax + 11, -0.02, CZ);
  group.add(ground);

  /* ── 窓からの光の筋（演出）── */
  const sunbeams = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0cf, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < nWin; i++) {
    const z = ROOM.zMin + 0.62 + i * ((D - 1.15) / nWin);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4), beamMat);
    beam.position.set(ROOM.xMax - 2.0, 1.55, z - 0.5);
    beam.rotation.set(-Math.PI / 2.6, 0, 0.35);
    sunbeams.add(beam);
  }
  group.add(sunbeams);

  /* ── 室外機（窓の真横・外）── */
  const outd = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xbdb2a4, roughness: 0.8, metalness: 0.15 });
  outd.add(box(0.34, 0.55, 0.78, boxMat, 0, 0, 0));
  outd.add(box(0.06, 0.5, 0.72, darkMat, 0.19, 0, 0));
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
  outd.position.set(ROOM.xMax + 0.25, 1.3, -1.4);
  group.add(outd);

  /* ── 黒板（-Z 面）画像の黒板はほぼ黒・横幅の7〜8割 ── */
  const boardW = 4.9, boardH = 1.5, boardY = 1.72;
  const boardTex = chalkboardTexture();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW, boardH),
    new THREE.MeshStandardMaterial({ map: boardTex, color: 0xffffff, roughness: 0.95 })
  );
  board.position.set(CX - 0.3, boardY, ROOM.zMin + 0.035);
  board.receiveShadow = true;
  group.add(board);
  group.add(box(boardW + 0.2, boardH + 0.18, 0.07, woodMat, CX - 0.3, boardY, ROOM.zMin + 0.012));
  const tray = box(boardW + 0.2, 0.06, 0.18, woodMat, CX - 0.3, boardY - boardH / 2 - 0.11, ROOM.zMin + 0.1);
  group.add(tray);
  // チョークと黒板消し
  const chalkMat = new THREE.MeshStandardMaterial({ color: 0xf3f0e4, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.085, 8), chalkMat);
    ch.rotation.z = Math.PI / 2;
    ch.position.set(CX - 1.5 + i * 0.16, boardY - boardH / 2 - 0.07, ROOM.zMin + 0.11);
    group.add(ch);
  }
  const eraser = box(0.16, 0.05, 0.07, new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 0.9 }),
    CX - 0.75, boardY - boardH / 2 - 0.055, ROOM.zMin + 0.11);
  group.add(eraser);

  // 時計
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.6 })
  );
  clockFace.position.set(CX - 0.3, 2.72, ROOM.zMin + 0.05);
  group.add(clockFace);
  group.add(box(0.44, 0.44, 0.05, darkMat, CX - 0.3, 2.72, ROOM.zMin + 0.015));
  const hands = new THREE.Group();
  const hourPivot = new THREE.Group();
  hourPivot.add(box(0.018, 0.095, 0.01, darkMat, 0, 0.047, 0));
  const minPivot = new THREE.Group();
  minPivot.add(box(0.014, 0.15, 0.01, darkMat, 0, 0.075, 0));
  hands.add(hourPivot, minPivot);
  hands.position.set(CX - 0.3, 2.72, ROOM.zMin + 0.07);
  group.add(hands);

  // スピーカー（チャイム）
  group.add(box(0.34, 0.24, 0.12, new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 }),
    ROOM.xMax - 1.0, 2.78, ROOM.zMin + 0.08));

  // 前の壁の掲示（時間割・心得）
  const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.58),
    new THREE.MeshStandardMaterial({ map: timetableTexture(), roughness: 0.92 }));
  tt.position.set(ROOM.xMax - 1.15, 1.55, ROOM.zMin + 0.03);
  group.add(tt);
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85),
    new THREE.MeshStandardMaterial({ map: rulePosterTexture(), roughness: 0.92 }));
  rule.position.set(ROOM.xMin + 0.75, 1.6, ROOM.zMin + 0.03);
  group.add(rule);

  /* ── 掲示板（後ろ +Z）── */
  const notice = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 1.55),
    new THREE.MeshStandardMaterial({ map: noticeTexture(), roughness: 0.9 })
  );
  notice.rotation.y = Math.PI;
  notice.position.set(0.2, 1.72, ROOM.zMax - 0.035);
  group.add(notice);
  group.add(box(3.05, 1.7, 0.06, woodMat, 0.2, 1.72, ROOM.zMax - 0.015));

  /* ── 教卓 ── */
  const teacher = new THREE.Group();
  teacher.add(box(1.5, 0.06, 0.7, woodMat, 0, 0.76, 0));
  teacher.add(box(1.42, 0.5, 0.62, new THREE.MeshStandardMaterial({ color: 0xbf9a76, roughness: 0.75 }), 0, 0.48, 0));
  for (const sx of [-0.68, 0.68]) for (const sz of [-0.28, 0.28]) {
    teacher.add(box(0.05, 0.73, 0.05, frameMat, sx, 0.365, sz));
  }
  // 提出物の山・教科書
  for (let i = 0; i < 5; i++) {
    teacher.add(box(0.22, 0.012, 0.3, new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 }),
      -0.42 + (Math.random() - 0.5) * 0.03, 0.795 + i * 0.013, 0.08 + (Math.random() - 0.5) * 0.03, [0, (Math.random() - 0.5) * 0.2, 0]));
  }
  teacher.add(box(0.19, 0.035, 0.26, new THREE.MeshStandardMaterial({ map: bookCoverTexture('地学', '#1d6b4f') }),
    0.42, 0.79, -0.05, [0, 0.3, 0]));
  teacher.add(box(0.13, 0.02, 0.18, new THREE.MeshStandardMaterial({ color: 0x2f4858, roughness: 0.5, metalness: 0.3 }),
    0.05, 0.79, 0.05));
  teacher.position.set(-2.6, 0, ROOM.zMin + 0.85);
  teacher.rotation.y = 0.06;
  group.add(teacher);
  addCollider(-3.45, -1.75, ROOM.zMin + 0.45, ROOM.zMin + 1.25, '教卓');
  // 教員用の椅子
  const tChair = new THREE.Group();
  tChair.add(box(0.46, 0.05, 0.42, woodMat, 0, 0.46, 0));
  tChair.add(box(0.46, 0.34, 0.05, woodMat, 0, 0.72, -0.19));
  tChair.add(box(0.05, 0.46, 0.05, frameMat, -0.2, 0.23, -0.18));
  tChair.add(box(0.05, 0.46, 0.05, frameMat, 0.2, 0.23, -0.18));
  tChair.add(box(0.05, 0.46, 0.05, frameMat, -0.2, 0.23, 0.18));
  tChair.add(box(0.05, 0.46, 0.05, frameMat, 0.2, 0.23, 0.18));
  tChair.position.set(-2.55, 0, ROOM.zMin + 1.75);
  tChair.rotation.y = Math.PI + 0.1;
  group.add(tChair);
  addCollider(-2.85, -2.25, ROOM.zMin + 1.45, ROOM.zMin + 2.05, '教員椅子');

  /* ── 机・椅子（5列×7行）── */
  const desks = new THREE.Group();
  const cols = [-3.2, -1.6, 0, 1.6, 3.2];
  const rows = [-2.7, -1.65, -0.6, 0.45, 1.5, 2.55, 3.6];
  const seats = [];
  for (const x of cols) for (const z of rows) seats.push([x, z]);

  const legMat = new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.42, metalness: 0.55 });
  const parts = [
    [new THREE.BoxGeometry(0.62, 0.035, 0.44), deskMat, [0, 0.73, 0]],
    [new THREE.BoxGeometry(0.6, 0.16, 0.36), new THREE.MeshStandardMaterial({ color: 0xc4a888, roughness: 0.8 }), [0, 0.63, -0.01]], // 棚
    [new THREE.BoxGeometry(0.035, 0.72, 0.42), legMat, [-0.28, 0.36, 0]],
    [new THREE.BoxGeometry(0.035, 0.72, 0.42), legMat, [0.28, 0.36, 0]],
    [new THREE.BoxGeometry(0.58, 0.045, 0.035), legMat, [0, 0.2, -0.16]],
    // 椅子
    [new THREE.BoxGeometry(0.4, 0.035, 0.36), deskMat, [0, 0.45, 0.48]],
    [new THREE.BoxGeometry(0.4, 0.26, 0.035), deskMat, [0, 0.68, 0.65]],
    [new THREE.BoxGeometry(0.035, 0.45, 0.035), legMat, [-0.17, 0.225, 0.32]],
    [new THREE.BoxGeometry(0.035, 0.45, 0.035), legMat, [0.17, 0.225, 0.32]],
    [new THREE.BoxGeometry(0.035, 0.45, 0.035), legMat, [-0.17, 0.225, 0.64]],
    [new THREE.BoxGeometry(0.035, 0.45, 0.035), legMat, [0.17, 0.225, 0.64]],
  ];
  const dummy = new THREE.Object3D();
  for (const [geo, mat, off] of parts) {
    const inst = new THREE.InstancedMesh(geo, mat, seats.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    seats.forEach(([x, z], i) => {
      dummy.position.set(x + off[0], off[1], z + off[2]);
      dummy.rotation.set(0, Math.PI + (Math.sin(i * 12.9898) * 0.5) * 0.14, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    desks.add(inst);
  }
  group.add(desks);
  // 机の当たり判定
  for (const [x, z] of seats) addCollider(x - 0.34, x + 0.34, z - 0.26, z + 0.7, '机');

  // 机の上の教科書（ランダムに少し）
  const bookMats = [
    new THREE.MeshStandardMaterial({ map: bookCoverTexture('数II', '#8a3b2f') }),
    new THREE.MeshStandardMaterial({ map: bookCoverTexture('地学', '#1d6b4f') }),
    new THREE.MeshStandardMaterial({ map: bookCoverTexture('英総', '#2f4858') }),
  ];
  for (let i = 0; i < 14; i++) {
    const s = seats[(i * 7 + 3) % seats.length];
    const b = box(0.19, 0.03, 0.26, bookMats[i % 3],
      s[0] + (Math.random() - 0.5) * 0.24, 0.762, s[1] + (Math.random() - 0.5) * 0.1, [0, (Math.random() - 0.5) * 0.6, 0]);
    group.add(b);
  }
  // カバン（机の横に下げる）
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x3c4654, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const s = seats[(i * 11 + 5) % seats.length];
    group.add(box(0.3, 0.38, 0.16, bagMat, s[0] + 0.36, 0.5, s[1] + 0.05, [0, 0.1, 0]));
    group.add(box(0.03, 0.16, 0.02, darkMat, s[0] + 0.36, 0.71, s[1] + 0.05));
  }

  /* ── 両馬の机（前列・窓側）とスマホ ── */
  const ryomaSeat = [1.6, rows[0]];
  const phone = box(0.075, 0.012, 0.15,
    new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.28, metalness: 0.45 }),
    ryomaSeat[0] + 0.1, 0.756, ryomaSeat[1] - 0.02, [0, 0.55, 0]);
  group.add(phone);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.062, 0.132),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 })
  );
  screen.rotation.x = -Math.PI / 2;
  screen.rotation.z = -0.55;
  screen.position.set(ryomaSeat[0] + 0.1, 0.763, ryomaSeat[1] - 0.02);
  group.add(screen);

  /* ── ごみ箱・掃除用具・消火器（後ろの隅）── */
  const bin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.19, 0.5, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5d6b62, roughness: 0.85, side: THREE.DoubleSide })
  );
  bin.position.set(ROOM.xMin + 0.55, 0.25, ROOM.zMax - 0.6);
  bin.castShadow = true;
  group.add(bin);
  // ほうき・ちりとり
  group.add(box(0.04, 1.35, 0.04, new THREE.MeshStandardMaterial({ color: 0xa87e4f, roughness: 0.9 }),
    ROOM.xMin + 0.3, 0.68, ROOM.zMax - 1.3, [0.12, 0, 0.08]));
  group.add(box(0.22, 0.06, 0.3, new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 0.9 }),
    ROOM.xMin + 0.42, 0.03, ROOM.zMax - 1.2));
  // 消火器（赤）
  const ext = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.52, 16),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5, metalness: 0.25 }));
  ext.add(body);
  ext.add(box(0.05, 0.08, 0.05, darkMat, 0, 0.3, 0));
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 20, Math.PI * 1.3),
    new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 }));
  hose.position.set(0.07, 0.2, 0);
  hose.rotation.set(Math.PI / 2, 0.4, 0);
  ext.add(hose);
  ext.position.set(ROOM.xMin + 0.42, 0.26, dz + 1.9);
  group.add(ext);

  /* ── 天井の蛍光灯 ── */
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.6, roughness: 1,
  });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.9, transparent: true, opacity: 0.35 });
  for (const x of [-2.3, 0, 2.3]) {
    for (const z of [-2.6, 0, 2.6]) {
      group.add(box(0.26, 0.06, 1.3, lampMat, x, ROOM.h - 0.07, z));
      group.add(box(0.32, 0.09, 1.36, coverMat, x, ROOM.h - 0.14, z));
      group.add(box(0.02, 0.13, 0.02, darkMat, x - 0.5, ROOM.h - 0.06, z));
      group.add(box(0.02, 0.13, 0.02, darkMat, x + 0.5, ROOM.h - 0.06, z));
    }
  }

  /* ── 廊下（-X の外）── */
  const corridor = new THREE.Group();
  const cFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, D + 3),
    new THREE.MeshStandardMaterial({ map: floorTexture(), color: 0xcfd3d8, roughness: 0.62 })
  );
  cFloor.rotation.x = -Math.PI / 2;
  cFloor.position.set(ROOM.xMin - 1.7, 0, CZ);
  corridor.add(cFloor);
  const cWall = new THREE.Mesh(new THREE.PlaneGeometry(D + 3, wallH), wallMat);
  cWall.rotation.y = Math.PI / 2;
  cWall.position.set(ROOM.xMin - 3.4, wallH / 2, CZ);
  corridor.add(cWall);
  const cCeil = new THREE.Mesh(new THREE.PlaneGeometry(3.4, D + 3), ceilMat);
  cCeil.rotation.x = Math.PI / 2;
  cCeil.position.set(ROOM.xMin - 1.7, wallH, CZ);
  corridor.add(cCeil);

  // 下駄箱（ロッカー）
  const lockers = box(0.42, 1.85, 4.6,
    new THREE.MeshStandardMaterial({ map: lockerTexture(), roughness: 0.75 }),
    ROOM.xMin - 3.2, 0.93, -0.6);
  corridor.add(lockers);
  addCollider(ROOM.xMin - 3.45, ROOM.xMin - 2.95, -2.9, 1.7, 'ロッカー');

  // 自販機
  const vendTex = vendingTexture(cornSoup);
  const vendMat = new THREE.MeshStandardMaterial({ map: vendTex, roughness: 0.55, metalness: 0.1 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: 0.6, metalness: 0.15 });
  const vending = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.9, 0.95),
    [vendMat, sideMat, sideMat, sideMat, sideMat, sideMat]
  );
  vending.position.set(ROOM.xMin - 3.05, 0.95, 2.6);
  vending.castShadow = true;
  vending.name = '自販機';
  corridor.add(vending);
  addCollider(ROOM.xMin - 3.4, ROOM.xMin - 2.7, 2.05, 3.15, '自販機');

  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.87),
    new THREE.MeshStandardMaterial({ map: corridorPosterTexture(), roughness: 0.9 })
  );
  poster.rotation.y = Math.PI / 2;
  poster.position.set(ROOM.xMin - 3.37, 1.78, -2.0);
  corridor.add(poster);

  // 傘立て
  const stand = box(0.3, 0.5, 0.22, new THREE.MeshStandardMaterial({ color: 0x6e7a72, roughness: 0.85 }),
    ROOM.xMin - 0.55, 0.25, dz + 2.4);
  corridor.add(stand);
  for (let i = 0; i < 4; i++) {
    const umb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: [0x2f4858, 0x8a3b2f, 0x3f5f45, 0x5a5a66][i], roughness: 0.85 }));
    umb.position.set(ROOM.xMin - 0.62 + i * 0.05, 0.62, dz + 2.4 + (Math.random() - 0.5) * 0.08);
    umb.rotation.z = (Math.random() - 0.5) * 0.16;
    corridor.add(umb);
  }
  group.add(corridor);

  /* ── 扉（少し開いている）＋ 教室名プレート ── */
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.5, metalness: 0.3 });
  group.add(box(0.16, dh + 0.1, 0.08, doorFrameMat, ROOM.xMin, (dh + 0.1) / 2, zA1));
  group.add(box(0.16, dh + 0.1, 0.08, doorFrameMat, ROOM.xMin, (dh + 0.1) / 2, zB0));
  group.add(box(0.16, 0.1, zB0 - zA1, doorFrameMat, ROOM.xMin, dh + 0.05, dz));
  const doorPivot = new THREE.Group();
  doorPivot.position.set(ROOM.xMin + 0.04, 0, zB0);
  const door = box(0.05, dh - 0.04, zB0 - zA1 - 0.06,
    new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.8 }), 0, (dh - 0.04) / 2, -(zB0 - zA1) / 2);
  doorPivot.add(door);
  // 扉の窓
  const doorWin = box(0.02, 0.42, 0.42,
    new THREE.MeshPhysicalMaterial({ color: 0xdfeaf2, transparent: true, opacity: 0.35, roughness: 0.1, transmission: 0.5 }),
    0.02, 1.5, -(zB0 - zA1) / 2);
  doorPivot.add(doorWin);
  doorPivot.rotation.y = -0.95;
  group.add(doorPivot);

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.23),
    new THREE.MeshStandardMaterial({ map: namePlateTexture(), roughness: 0.85 }));
  plate.position.set(ROOM.xMin - 0.07, 2.4, dz);
  plate.rotation.y = -Math.PI / 2;
  group.add(plate);

  /* ── ドア周りの壁の当たり判定（廊下とつなげる）── */
  addCollider(ROOM.xMin - 0.2, ROOM.xMin + 0.05, zA0, zA1, '壁');
  addCollider(ROOM.xMin - 0.2, ROOM.xMin + 0.05, zB0, zB1, '壁');
  addCollider(ROOM.xMin - 0.2, ROOM.xMin + 0.05, zA1, zB0, '壁上');

  /* ── 調べられる物 ── */
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  interactables.push(
    {
      id: 'board', label: '黒板を眺める', key: '黒板',
      pos: at(CX - 0.3, 1.6, ROOM.zMin + 0.2), range: 2.6,
    },
    {
      id: 'notice', label: '掲示板を見る', key: '掲示板',
      pos: at(0.2, 1.6, ROOM.zMax - 0.2), range: 2.4,
    },
    {
      id: 'vending', label: '自販機をのぞく（Eでコーンスープ）', key: '自販機',
      pos: at(ROOM.xMin - 2.7, 1.1, 2.6), range: 1.9,
      action: 'vending',
    },
    {
      id: 'phone', label: '両馬のスマホを覗く', key: 'スマホ',
      pos: at(ryomaSeat[0] + 0.1, 0.78, ryomaSeat[1]), range: 1.1,
    },
    {
      id: 'window', label: '窓の外を見る', key: '窓',
      pos: at(ROOM.xMax - 0.6, 1.7, 0), range: 1.6,
    },
    {
      id: 'desk', label: '両馬の机（机の中）', key: '机',
      pos: at(ryomaSeat[0], 0.8, ryomaSeat[1]), range: 1.0,
    },
  );

  return {
    group, fan, hands, vending, vendMat, cornSoup, screen, sunbeams,
    colliders, interactables, seats, ryomaSeat, cols, rows, ROOM,
    seatOf: (i) => seats[i],
  };
}

/** 照明を追加する（朝/昼/夕/夜で雰囲気を変えられる） */
export function buildLights(scene, { quality = 'high', time = 'day' } = {}) {
  const presets = {
    morning: { hemiSky: 0xdce9ff, hemiGround: 0x6a5c48, hemiI: 0.5, sun: 0xffe6c0, sunI: 2.2, sunPos: [13, 6, -4], amb: 0xfff4e2, ambI: 6 },
    day: { hemiSky: 0xdfeaff, hemiGround: 0x6a5c48, hemiI: 0.55, sun: 0xfff2d8, sunI: 2.5, sunPos: [12, 7.5, 1.5], amb: 0xfff4e2, ambI: 8 },
    evening: { hemiSky: 0xffd9b0, hemiGround: 0x5a4a38, hemiI: 0.45, sun: 0xffb374, sunI: 2.6, sunPos: [14, 3.2, 4.5], amb: 0xffd9a8, ambI: 7 },
    night: { hemiSky: 0x9fb2d8, hemiGround: 0x3a3630, hemiI: 0.3, sun: 0x8fa8d8, sunI: 0.35, sunPos: [10, 8, 2], amb: 0xa8c0ff, ambI: 2 },
  };
  const p = presets[time] || presets.day;

  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiI);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(p.sun, p.sunI);
  sun.position.set(...p.sunPos);
  sun.target.position.set(0, 1, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 48;
  const s = 8;
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
  for (const x of [-2.3, 0, 2.3]) for (const z of [-2.6, 0, 2.6]) {
    const l = new THREE.PointLight(0xfff4e2, p.ambI * 0.55, 7.5, 2);
    l.position.set(x, ROOM.h - 0.25, z);
    scene.add(l);
    lamps.push(l);
  }
  return { hemi, sun, fill, lamps, presets, preset: p };
}
