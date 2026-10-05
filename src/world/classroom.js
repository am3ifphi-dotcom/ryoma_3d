// Builds the classroom (桐葉高校 北棟 理数科1年B組) from primitives + procedural textures.
import * as THREE from 'three';
import {
  woodTexture, floorTexture, wallTexture, ceilingTexture, panelTexture, chalkboardTexture,
  posterTexture, skyTexture, noticeBoardTexture, clockTexture, nameplateTexture,
} from './textures.js';

export const ROOM = { W: 9.0, D: 8.6, H: 3.0 }; // x: ±4.5, z: ±4.3 (board at -z)

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

class Instancer {
  constructor(parent) { this.parent = parent; this.groups = new Map(); }
  add(key, geometry, material, matrix, { castShadow = true, receiveShadow = true } = {}) {
    let g = this.groups.get(key);
    if (!g) { g = { geometry, material, mats: [], castShadow, receiveShadow }; this.groups.set(key, g); }
    g.mats.push(matrix.clone());
  }
  build() {
    for (const [key, g] of this.groups) {
      const m = new THREE.InstancedMesh(g.geometry, g.material, g.mats.length);
      m.name = 'inst_' + key;
      g.mats.forEach((mat, i) => m.setMatrixAt(i, mat));
      m.castShadow = g.castShadow; m.receiveShadow = g.receiveShadow;
      m.instanceMatrix.needsUpdate = true;
      this.parent.add(m);
    }
  }
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function mat(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
  _p.set(x, y, z); _q.setFromEuler(new THREE.Euler(0, ry, 0)); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

export function buildClassroom(scene) {
  const g = new THREE.Group();
  g.name = 'classroom';
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const addCollider = (cx, cz, hw, hd) => colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  const { W, D, H } = ROOM;
  const hw = W / 2, hd = D / 2;

  // ---------- materials ----------
  const woodTex = woodTexture();
  const matWood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.0 });
  const matWoodDark = new THREE.MeshStandardMaterial({ map: woodTexture({ hue: 30, light: 58, seed: 12 }), roughness: 0.6 });
  const matSteel = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.85 });
  const matSteelDark = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.5, metalness: 0.7 });
  const matPlasticChair = new THREE.MeshStandardMaterial({ color: 0x95adad, roughness: 0.5, metalness: 0.0 });
  const matWall = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.92 });
  const matCeil = new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95 });
  const matFloor = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.0 });
  const matPanel = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.5 });
  const matTrim = new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.6 });
  const matGlass = new THREE.MeshPhysicalMaterial({ color: 0xdfeaf2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, transmission: 0, side: THREE.DoubleSide, depthWrite: false });
  const matFrosted = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const matAlu = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.4, metalness: 0.8 });
  const matWhite = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });
  const matBlack = new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.6 });
  const matLightPanel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.6, roughness: 0.4 });
  const matCurtain = new THREE.MeshStandardMaterial({ color: 0xe8dcc3, roughness: 0.95 });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mesh = (geo, m, x, y, z, { cast = true, recv = true, ry = 0 } = {}) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = cast; o.receiveShadow = recv; g.add(o); return o;
  };

  // ---------- floor / ceiling ----------
  const floor = mesh(new THREE.PlaneGeometry(W, D), matFloor, 0, 0, 0, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const ceil = mesh(new THREE.PlaneGeometry(W, D), matCeil, 0, H, 0, { cast: false });
  ceil.rotation.x = Math.PI / 2;

  // ---------- walls ----------
  // front (board) and back: solid
  mesh(box(W, H, 0.1), matWall, 0, H / 2, -hd - 0.05, { cast: false });
  mesh(box(W, H, 0.1), matWall, 0, H / 2, hd + 0.05, { cast: false });
  // left (exterior windows): sill part, header part, piers
  const winZ = [-2.7, -0.9, 0.9, 2.7], winW = 1.7, sill = 0.95, head = 2.35;
  mesh(box(0.12, sill, D), matWall, -hw - 0.06, sill / 2, 0, { cast: false });
  mesh(box(0.12, H - head, D), matWall, -hw - 0.06, head + (H - head) / 2, 0, { cast: false });
  const piers = [[-hd, winZ[0] - winW / 2], [winZ[0] + winW / 2, winZ[1] - winW / 2], [winZ[1] + winW / 2, winZ[2] - winW / 2], [winZ[2] + winW / 2, winZ[3] - winW / 2], [winZ[3] + winW / 2, hd]];
  for (const [a, b] of piers) mesh(box(0.12, head - sill, b - a), matWall, -hw - 0.06, (sill + head) / 2, (a + b) / 2);
  // windows (aluminium sash + glass), curtains
  for (const z of winZ) {
    const fx = -hw - 0.02;
    mesh(box(0.06, 0.05, winW + 0.06), matAlu, fx, sill + 0.025, z);
    mesh(box(0.06, 0.05, winW + 0.06), matAlu, fx, head - 0.025, z);
    mesh(box(0.06, head - sill, 0.05), matAlu, fx, (sill + head) / 2, z - winW / 2 - 0.0);
    mesh(box(0.06, head - sill, 0.05), matAlu, fx, (sill + head) / 2, z + winW / 2 + 0.0);
    mesh(box(0.05, head - sill, 0.04), matAlu, fx, (sill + head) / 2, z); // centre mullion
    mesh(box(0.04, 0.03, winW), matAlu, fx, sill + (head - sill) * 0.5, z); // transom bar
    const glass = mesh(new THREE.PlaneGeometry(winW, head - sill), matGlass, -hw + 0.0, (sill + head) / 2, z, { cast: false, recv: false });
    glass.rotation.y = Math.PI / 2;
    // window sill ledge
    mesh(box(0.18, 0.03, winW + 0.2), matTrim, -hw + 0.06, sill - 0.015, z);
  }
  // curtains bunched between/around windows
  for (const z of [-3.7, -1.8, 0, 1.8, 3.7]) {
    const c = mesh(box(0.14, head - sill + 0.2, 0.32), matCurtain, -hw + 0.12, (sill + head) / 2 + 0.05, z);
    c.castShadow = true;
  }
  mesh(box(0.05, 0.05, D - 0.2), matAlu, -hw + 0.12, head + 0.12, 0); // curtain rail

  // right wall (corridor): doors + frosted band
  const doorW = 0.95, doorH = 2.05, doorZ = [-3.35, 3.35];
  const bandLo = 1.35, bandHi = 2.1, bandZ0 = -2.2, bandZ1 = 2.2;
  // segments: below band, above band, between door and band, above doors, ends
  mesh(box(0.12, bandLo, bandZ1 - bandZ0), matWall, hw + 0.06, bandLo / 2, 0, { cast: false });
  mesh(box(0.12, H - bandHi, bandZ1 - bandZ0), matWall, hw + 0.06, bandHi + (H - bandHi) / 2, 0, { cast: false });
  for (const sgn of [-1, 1]) {
    const dz = sgn * 3.35;
    const dIn = dz - sgn * doorW / 2, dOut = dz + sgn * doorW / 2; // door edges
    const bandEdge = sgn * 2.2;
    // wall between band and door
    const a = Math.min(bandEdge, dIn), b = Math.max(bandEdge, dIn);
    mesh(box(0.12, H, b - a), matWall, hw + 0.06, H / 2, (a + b) / 2, { cast: false });
    // above door
    mesh(box(0.12, H - doorH, doorW), matWall, hw + 0.06, doorH + (H - doorH) / 2, dz, { cast: false });
    // door to the end wall
    const e0 = Math.min(dOut, sgn * hd), e1 = Math.max(dOut, sgn * hd);
    if (e1 - e0 > 0.001) mesh(box(0.12, H, e1 - e0), matWall, hw + 0.06, H / 2, (e0 + e1) / 2, { cast: false });
    // door frame + sliding door leaf (back door slightly open)
    mesh(box(0.1, 0.06, doorW + 0.12), matWoodDark, hw + 0.02, doorH + 0.03, dz);
    mesh(box(0.1, doorH, 0.06), matWoodDark, hw + 0.02, doorH / 2, dz - doorW / 2 - 0.03);
    mesh(box(0.1, doorH, 0.06), matWoodDark, hw + 0.02, doorH / 2, dz + doorW / 2 + 0.03);
    const open = sgn > 0 ? 0.22 : 0;
    const leaf = new THREE.Group(); leaf.position.set(hw - 0.03, 0, dz + open);
    const leafBody = new THREE.Mesh(box(0.04, doorH, doorW), matWood); leafBody.position.y = doorH / 2; leafBody.castShadow = true; leafBody.receiveShadow = true; leaf.add(leafBody);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), matFrosted); pane.position.set(-0.025, 1.45, 0); pane.rotation.y = -Math.PI / 2; leaf.add(pane);
    const paneFrame = new THREE.Mesh(box(0.05, 0.74, 0.54), matWoodDark); paneFrame.position.set(0, 1.45, 0); leaf.add(paneFrame);
    const pane2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), matFrosted); pane2.position.set(-0.03, 1.45, 0); pane2.rotation.y = -Math.PI / 2; leaf.add(pane2);
    const handle = new THREE.Mesh(box(0.03, 0.12, 0.03), matSteel); handle.position.set(-0.03, 0.95, sgn * 0.38); leaf.add(handle);
    g.add(leaf);
    addCollider(hw - 0.03, dz + open, 0.1, doorW / 2 + 0.05);
    // room sign next to the front door
    if (sgn < 0) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: nameplateTexture('1年B組'), roughness: 0.5 }));
      sign.position.set(hw - 0.07, 2.35, dz); sign.rotation.y = -Math.PI / 2; g.add(sign);
    }
  }
  // frosted band windows with mullions
  for (let i = 0; i < 4; i++) {
    const z0 = bandZ0 + i * 1.1, zc = z0 + 0.55;
    const p = mesh(new THREE.PlaneGeometry(1.1, bandHi - bandLo), matFrosted, hw - 0.02, (bandLo + bandHi) / 2, zc, { cast: false, recv: false });
    p.rotation.y = -Math.PI / 2;
    mesh(box(0.06, bandHi - bandLo, 0.05), matAlu, hw - 0.02, (bandLo + bandHi) / 2, z0);
  }
  mesh(box(0.06, bandHi - bandLo, 0.05), matAlu, hw - 0.02, (bandLo + bandHi) / 2, bandZ1);
  mesh(box(0.06, 0.05, bandZ1 - bandZ0), matAlu, hw - 0.02, bandLo, 0);
  mesh(box(0.06, 0.05, bandZ1 - bandZ0), matAlu, hw - 0.02, bandHi, 0);

  // wainscot panelling + trim on all walls
  const wain = 0.9;
  mesh(box(W, wain, 0.03), matPanel, 0, wain / 2, -hd + 0.015, { cast: false });
  mesh(box(W, wain, 0.03), matPanel, 0, wain / 2, hd - 0.015, { cast: false });
  mesh(box(0.03, wain, D), matPanel, -hw + 0.015, wain / 2, 0, { cast: false });
  for (const sgn of [-1, 1]) {
    // right wall panel skipping the doors
    const a = sgn < 0 ? -hd : doorZ[1] + doorW / 2 + 0.05, b = sgn < 0 ? doorZ[0] - doorW / 2 - 0.05 : hd;
    mesh(box(0.03, wain, b - a), matPanel, hw - 0.015, wain / 2, (a + b) / 2, { cast: false });
  }
  mesh(box(0.03, wain, doorZ[1] - doorZ[0] - doorW - 0.1), matPanel, hw - 0.015, wain / 2, 0, { cast: false });
  for (const [x, z, w, d] of [[0, -hd + 0.03, W, 0.04], [0, hd - 0.03, W, 0.04], [-hw + 0.03, 0, 0.04, D], [hw - 0.03, 0, 0.04, D]]) mesh(box(w, 0.05, d), matTrim, x, wain + 0.025, z, { cast: false });
  // skirting
  for (const [x, z, w, d] of [[0, -hd + 0.02, W, 0.03], [0, hd - 0.02, W, 0.03], [-hw + 0.02, 0, 0.03, D], [hw - 0.02, 0, 0.03, D]]) mesh(box(w, 0.08, d), matWoodDark, x, 0.04, z, { cast: false });

  // ---------- chalkboard ----------
  const boardW = 3.6, boardH = 1.2, boardY = 1.5, boardZ = -hd + 0.035;
  const matBoard = new THREE.MeshStandardMaterial({ map: chalkboardTexture(), roughness: 0.85 });
  mesh(box(boardW, boardH, 0.04), matBoard, 0, boardY, boardZ, { cast: false });
  mesh(box(boardW + 0.12, 0.06, 0.06), matWood, 0, boardY + boardH / 2 + 0.03, boardZ);
  mesh(box(0.06, boardH + 0.12, 0.06), matWood, -boardW / 2 - 0.03, boardY, boardZ);
  mesh(box(0.06, boardH + 0.12, 0.06), matWood, boardW / 2 + 0.03, boardY, boardZ);
  mesh(box(boardW + 0.12, 0.04, 0.12), matWood, 0, boardY - boardH / 2 - 0.02, boardZ + 0.04); // chalk tray
  mesh(box(boardW + 0.12, 0.03, 0.01), matWood, 0, boardY - boardH / 2 - 0.0, boardZ + 0.1);
  // chalk + erasers
  const chalkGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8);
  [[-1.2, 0xffffff], [-1.1, 0xffffff], [-0.95, 0xfff2a8], [0.6, 0xffffff], [0.9, 0xffb3b3]].forEach(([x, col]) => {
    const c = mesh(chalkGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }), x, boardY - boardH / 2 + 0.006, boardZ + 0.06);
    c.rotation.z = Math.PI / 2; c.rotation.y = (x * 7) % 1;
  });
  mesh(box(0.14, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a4a9a, roughness: 0.9 }), 1.4, boardY - boardH / 2 + 0.02, boardZ + 0.06);
  mesh(box(0.14, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x9a3a3a, roughness: 0.9 }), 1.58, boardY - boardH / 2 + 0.02, boardZ + 0.06);
  // ✝本質✝ paper held by magnets on the board
  const paper = mesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshStandardMaterial({ map: posterTexture('honshitsu'), roughness: 0.8 }), 1.55, 1.85, boardZ + 0.025, { cast: false });
  paper.rotation.z = -0.04;
  const magnetGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12);
  const matMagnet = new THREE.MeshStandardMaterial({ color: 0xd33, roughness: 0.4 });
  [[1.46, 1.985], [1.64, 1.995]].forEach(([x, y]) => { const m = mesh(magnetGeo, matMagnet, x, y, boardZ + 0.03); m.rotation.x = Math.PI / 2; });

  // above the board: clock, speaker, projector
  const clock = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 1.7, 2.6, -hd + 0.03);
  clock.rotation.x = Math.PI / 2;
  const face = mesh(new THREE.CircleGeometry(0.165, 32), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.3 }), 1.7, 2.6, -hd + 0.052, { cast: false });
  face.rotation.y = 0;
  mesh(box(0.42, 0.3, 0.14), new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.7 }), -1.7, 2.6, -hd + 0.08);
  mesh(box(0.34, 0.22, 0.01), new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.9 }), -1.7, 2.6, -hd + 0.155);
  // projector (short throw) on a ceiling arm
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12), matWhite, 0, H - 0.225, -3.35);
  const proj = mesh(box(0.42, 0.13, 0.33), matWhite, 0, H - 0.5, -3.35);
  mesh(box(0.1, 0.06, 0.02), matBlack, 0.08, H - 0.5, -3.35 - 0.17);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), matBlack, -0.08, H - 0.5, -3.35 - 0.17).rotation.x = Math.PI / 2;
  void proj;
  // 学級目標 poster on the front wall
  const goal = mesh(new THREE.PlaneGeometry(0.42, 0.594), new THREE.MeshStandardMaterial({ map: posterTexture('goal'), roughness: 0.8 }), -2.75, 1.95, -hd + 0.02, { cast: false });
  void goal;
  // 教卓
  const lectern = new THREE.Group(); lectern.position.set(0, 0, -3.5);
  const lb = new THREE.Mesh(box(0.7, 0.95, 0.5), matWood); lb.position.y = 0.475; lb.castShadow = lb.receiveShadow = true; lectern.add(lb);
  const lt = new THREE.Mesh(box(0.78, 0.04, 0.58), matWoodDark); lt.position.y = 0.97; lt.castShadow = lt.receiveShadow = true; lectern.add(lt);
  const papers = new THREE.Mesh(box(0.3, 0.02, 0.21), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })); papers.position.set(-0.12, 1.0, 0.02); papers.rotation.y = 0.1; lectern.add(papers);
  const chalkBox = new THREE.Mesh(box(0.12, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.9 })); chalkBox.position.set(0.2, 1.015, -0.1); lectern.add(chalkBox);
  g.add(lectern);
  addCollider(0, -3.5, 0.4, 0.3);

  // ---------- desks & chairs (instanced) ----------
  const inst = new Instancer(g);
  const deskTop = box(0.6, 0.03, 0.4);
  const deskFrame = box(0.56, 0.03, 0.36);
  const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.69, 10);
  const shelf = box(0.5, 0.015, 0.32);
  const seat = box(0.38, 0.025, 0.38);
  const back = box(0.38, 0.22, 0.03);
  const chairLeg = new THREE.CylinderGeometry(0.011, 0.011, 0.42, 10);
  const backPost = new THREE.CylinderGeometry(0.011, 0.011, 0.42, 10);
  const hook = new THREE.TorusGeometry(0.02, 0.005, 6, 12);
  const bag = box(0.28, 0.34, 0.12);
  const noteGeo = box(0.18, 0.012, 0.255);
  const pencilCase = box(0.2, 0.04, 0.07);
  const matBag = [0x1f2a44, 0x3b2d2d, 0x2c3e2c, 0x222].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const matNote = [0xb8d4e8, 0xf2e2b0, 0xe7c9d4, 0xc9e6c6, 0xffffff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const r = rng(2024);
  const cols = 6, rows = 6;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -3.1 + i * 1.24 + (r() - 0.5) * 0.06;
    const z = -1.6 + j * 0.98 + (r() - 0.5) * 0.06;
    const ry = (r() - 0.5) * 0.08;
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const place = (geo, matl, key, lx, ly, lz, extra = {}) => {
      const local = new THREE.Vector3(lx, ly, lz).applyMatrix4(rot);
      inst.add(key, geo, matl, mat(x + local.x, ly, z + local.z, 1, 1, 1, ry + (extra.ry || 0)), extra);
    };
    place(deskTop, matWood, 'deskTop', 0, 0.715, 0);
    place(deskFrame, matSteelDark, 'deskFrame', 0, 0.69, 0);
    place(shelf, matSteelDark, 'shelf', 0, 0.55, 0.0);
    for (const [lx, lz] of [[-0.27, -0.17], [0.27, -0.17], [-0.27, 0.17], [0.27, 0.17]]) place(leg, matSteel, 'leg', lx, 0.345, lz);
    place(hook, matSteel, 'hook', 0.31, 0.64, 0.12, { ry: Math.PI / 2 });
    // chair (tucked under)
    const cz = 0.3;
    place(seat, matPlasticChair, 'seat', 0, 0.435, cz);
    place(back, matPlasticChair, 'back', 0, 0.8, cz + 0.17);
    for (const [lx, lz] of [[-0.17, cz - 0.16], [0.17, cz - 0.16], [-0.17, cz + 0.16], [0.17, cz + 0.16]]) place(chairLeg, matSteel, 'chairLeg', lx, 0.21, lz);
    for (const lx of [-0.17, 0.17]) place(backPost, matSteel, 'backPost', lx, 0.66, cz + 0.17);
    // props
    const p = r();
    if (p < 0.3) place(bag, matBag[Math.floor(r() * matBag.length)], 'bag' + Math.floor(p * 100) % 4, 0.37, 0.47, 0.12);
    if (r() < 0.45) place(noteGeo, matNote[Math.floor(r() * matNote.length)], 'note' + Math.floor(r() * 5), (r() - 0.5) * 0.2, 0.737, (r() - 0.5) * 0.05, { ry: (r() - 0.5) * 0.4 });
    if (r() < 0.25) place(pencilCase, matNote[Math.floor(r() * matNote.length)], 'pc' + Math.floor(r() * 5), 0.15 + r() * 0.08, 0.75, -0.12, { ry: (r() - 0.5) * 0.3 });
    addCollider(x, z + 0.12, 0.33, 0.4);
  }
  inst.build();

  // ---------- back wall: lockers, notice board, posters, cleaning locker ----------
  const lockerY = 0.95;
  const lockers = new THREE.Group(); lockers.position.set(0, 0, hd - 0.2);
  const lBody = new THREE.Mesh(box(7.6, lockerY, 0.38), matWood); lBody.position.y = lockerY / 2; lBody.castShadow = lBody.receiveShadow = true; lockers.add(lBody);
  const cubbyMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.9 });
  for (let i = 0; i < 12; i++) for (let k = 0; k < 2; k++) {
    const cub = new THREE.Mesh(box(0.56, 0.38, 0.02), cubbyMat);
    cub.position.set(-3.47 + i * 0.63, 0.26 + k * 0.45, -0.195); lockers.add(cub);
    if ((i * 3 + k * 7) % 4 === 0) { const b = new THREE.Mesh(box(0.3, 0.3, 0.1), matBag[(i + k) % 4]); b.position.set(-3.47 + i * 0.63, 0.22 + k * 0.45, -0.1); lockers.add(b); }
  }
  g.add(lockers);
  addCollider(0, hd - 0.2, 3.8, 0.19);
  const nb = mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: noticeBoardTexture(), roughness: 0.9 }), -1.4, 1.95, hd - 0.045, { cast: false });
  nb.rotation.y = Math.PI;
  mesh(box(2.46, 1.26, 0.03), matWoodDark, -1.4, 1.95, hd - 0.02, { cast: false });
  const posters = [['timetable', 1.3, 2.0], ['cornsoup', 2.2, 1.85], ['notice', 3.0, 2.05]];
  for (const [kind, x, y] of posters) {
    const pm = mesh(new THREE.PlaneGeometry(0.42, 0.594), new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.85 }), x, y, hd - 0.012, { cast: false });
    pm.rotation.y = Math.PI; pm.rotation.z = (x * 13 % 1 - 0.5) * 0.06;
  }
  const cleaning = mesh(box(0.9, 1.8, 0.45), new THREE.MeshStandardMaterial({ color: 0xb9bdb6, roughness: 0.5, metalness: 0.4 }), -3.95, 0.9, hd - 0.23);
  void cleaning;
  addCollider(-3.95, hd - 0.23, 0.45, 0.23);
  // broom leaning next to it
  const broom = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), matWoodDark, -3.4, 0.7, hd - 0.1);
  broom.rotation.z = 0.12;

  // ---------- ceiling lights + fixtures ----------
  const fixtures = [];
  for (const x of [-2.2, 2.2]) for (const z of [-3.0, -1.0, 1.0, 3.0]) {
    mesh(box(1.3, 0.08, 0.34), matWhite, x, H - 0.04, z, { cast: false });
    const panel = mesh(box(1.22, 0.02, 0.26), matLightPanel, x, H - 0.085, z, { cast: false, recv: false });
    fixtures.push(panel);
  }
  // air-con vents / smoke detector
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), matWhite, 0.4, H - 0.015, 0.2, { cast: false });
  mesh(box(0.6, 0.03, 0.6), new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.6 }), 0, H - 0.015, 2.0, { cast: false });

  // ---------- outside ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  sky.name = 'sky'; g.add(sky);
  const ground = mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xa79d7a, roughness: 1 }), 0, -0.02, 0, { cast: false });
  ground.rotation.x = -Math.PI / 2;
  // schoolyard: distant trees + a building
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const tx = -11 - (i % 3) * 3.5, tz = -12 + i * 3 + ((i * 7) % 5);
    mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.4, 8), trunkMat, tx, 1.2, tz);
    mesh(new THREE.SphereGeometry(1.6 + (i % 3) * 0.3, 10, 8), leafMat, tx, 3.2, tz);
  }
  const bld = mesh(box(14, 9, 10), new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.8 }), -26, 4.5, -4);
  void bld;
  // 室外機 (the famous outdoor AC unit right outside the window)
  const acu = new THREE.Group(); acu.position.set(-hw - 0.5, 1.2, 0.9);
  const acuBody = new THREE.Mesh(box(0.33, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xcfd2cf, roughness: 0.6, metalness: 0.3 })); acuBody.castShadow = true; acu.add(acuBody);
  const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), matBlack); grille.rotation.z = Math.PI / 2; grille.position.set(0.17, 0.05, 0); acu.add(grille);
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 5), new THREE.MeshStandardMaterial({ color: 0x8a8d8a, roughness: 0.5 })); fan.rotation.z = Math.PI / 2; fan.position.set(0.19, 0.05, 0); fan.name = 'acFan'; acu.add(fan);
  const bracket = new THREE.Mesh(box(0.4, 0.04, 0.9), matSteelDark); bracket.position.y = -0.32; acu.add(bracket);
  g.add(acu);
  // corridor (visible through the frosted glass / door panes)
  const corr = new THREE.Group();
  const cf = new THREE.Mesh(new THREE.PlaneGeometry(2.4, D + 2), matFloor); cf.rotation.x = -Math.PI / 2; cf.position.set(hw + 1.2, 0.0, 0); cf.receiveShadow = true; corr.add(cf);
  const cc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, D + 2), matCeil); cc.rotation.x = Math.PI / 2; cc.position.set(hw + 1.2, H, 0); corr.add(cc);
  const cw = new THREE.Mesh(box(0.1, H, D + 2), matWall); cw.position.set(hw + 2.45, H / 2, 0); corr.add(cw);
  for (const z of [-3, 0, 3]) { const cl = new THREE.Mesh(box(1.2, 0.05, 0.3), matLightPanel); cl.position.set(hw + 1.2, H - 0.03, z); corr.add(cl); }
  const ce1 = new THREE.Mesh(box(2.4, H, 0.1), matWall); ce1.position.set(hw + 1.2, H / 2, -hd - 1); corr.add(ce1);
  const ce2 = new THREE.Mesh(box(2.4, H, 0.1), matWall); ce2.position.set(hw + 1.2, H / 2, hd + 1); corr.add(ce2);
  // a vending machine without corn soup, in the corridor near the back door
  const vend = new THREE.Mesh(box(0.9, 1.8, 0.7), new THREE.MeshStandardMaterial({ color: 0xe03a3a, roughness: 0.4, metalness: 0.2 })); vend.position.set(hw + 1.9, 0.9, 2.2); corr.add(vend);
  const vendGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xfff2cc, emissiveIntensity: 0.8 })); vendGlass.position.set(hw + 1.54, 1.25, 2.2); vendGlass.rotation.y = -Math.PI / 2; corr.add(vendGlass);
  g.add(corr);

  scene.add(g);
  return { group: g, colliders, fixtures, acFan: fan, sky };
}
