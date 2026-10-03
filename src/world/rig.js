import * as THREE from 'three';

/**
 * ボーン無しの単一メッシュに、あとから骨を入れるための簡易リグ。
 *
 * ・ボーンは 19 本（体幹5・腕8・脚6）
 * ・ウェイトは「骨の線分からの距離」の逆4乗で自動計算する
 *   → 手だけ 99% 手ボーンに乗るので、ポケットの手が独立して動く
 *   　 継ぎ目（切れ目）は出ない（切らずに滑らかに変形させる）
 *
 * モデルのローカル座標系（正規化後・メートル）:
 *   +X = モデルの正面（向きはこの向きで確定済み）
 *   +Y = 上（足元 y=0、身長 1.72m）
 *   +Z = モデルの右手側
 */

const P = (x, y, z) => new THREE.Vector3(x, y, z);

export const BONE_DEFS = [
  // 体幹
  { name: 'pelvis', parent: null, pivot: [0, 0.95, 0], end: [0, 1.06, 0] },
  { name: 'spine', parent: 'pelvis', pivot: [0, 1.06, 0], end: [0, 1.24, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.24, 0], end: [0, 1.42, 0] },
  { name: 'neck', parent: 'chest', pivot: [0, 1.42, 0], end: [0, 1.50, 0] },
  { name: 'head', parent: 'neck', pivot: [0, 1.50, 0], end: [0, 1.70, 0] },
  // 右腕（+Z 側）
  { name: 'shoulderR', parent: 'chest', pivot: [0, 1.41, 0.07], end: [0, 1.40, 0.19] },
  { name: 'armR', parent: 'shoulderR', pivot: [0, 1.40, 0.19], end: [0.01, 1.13, 0.22] },
  { name: 'forearmR', parent: 'armR', pivot: [0.01, 1.13, 0.22], end: [0.05, 0.96, 0.18] },
  { name: 'handR', parent: 'forearmR', pivot: [0.05, 0.96, 0.18], end: [0.10, 0.84, 0.15] },
  // 左腕（-Z 側）
  { name: 'shoulderL', parent: 'chest', pivot: [0, 1.41, -0.07], end: [0, 1.40, -0.19] },
  { name: 'armL', parent: 'shoulderL', pivot: [0, 1.40, -0.19], end: [0.01, 1.13, -0.22] },
  { name: 'forearmL', parent: 'armL', pivot: [0.01, 1.13, -0.22], end: [0.05, 0.96, -0.18] },
  { name: 'handL', parent: 'forearmL', pivot: [0.05, 0.96, -0.18], end: [0.10, 0.84, -0.15] },
  // 右脚（+Z 側・やや後ろ）
  { name: 'thighR', parent: 'pelvis', pivot: [0, 0.95, 0.10], end: [-0.05, 0.58, 0.12] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.05, 0.58, 0.12], end: [-0.07, 0.14, 0.10] },
  { name: 'footR', parent: 'shinR', pivot: [-0.07, 0.14, 0.10], end: [0.03, 0.02, 0.10] },
  // 左脚（-Z 側・やや前）
  { name: 'thighL', parent: 'pelvis', pivot: [0, 0.95, -0.10], end: [0.06, 0.58, -0.16] },
  { name: 'shinL', parent: 'thighL', pivot: [0.06, 0.58, -0.16], end: [0.09, 0.14, -0.16] },
  { name: 'footL', parent: 'shinL', pivot: [0.09, 0.14, -0.16], end: [0.15, 0.02, -0.16] },
];

/** 骨の階層（THREE.Bone）を作る */
export function buildSkeleton() {
  const map = new Map();
  const bones = [];
  for (const def of BONE_DEFS) {
    const b = new THREE.Bone();
    b.name = def.name;
    const parent = def.parent ? map.get(def.parent) : null;
    if (parent) {
      const pd = BONE_DEFS.find((d) => d.name === def.parent);
      b.position.set(def.pivot[0] - pd.pivot[0], def.pivot[1] - pd.pivot[1], def.pivot[2] - pd.pivot[2]);
      parent.bone.add(b);
    } else {
      b.position.set(...def.pivot);
    }
    map.set(def.name, { bone: b, def });
    bones.push(b);
  }
  const root = bones[0];
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { root, bones, skeleton, map };
}

/**
 * スキニング・ウェイトを計算して geometry に仕込む。
 * 重いので chunk に分けて呼べるようジェネレータにしている。
 */
export function* computeSkinWeights(geometry, chunk = 60000) {
  const pos = geometry.attributes.position;
  const N = pos.count;
  const skinIndex = new Uint16Array(N * 4);
  const skinWeight = new Float32Array(N * 4);

  // 骨の線分を先に計算
  const seg = BONE_DEFS.map((d) => {
    const a = P(...d.pivot), b = P(...d.end);
    const ab = new THREE.Vector3().subVectors(b, a);
    return { a, ab, len2: Math.max(1e-6, ab.lengthSq()) };
  });
  const NB = seg.length;
  const v = new THREE.Vector3(), av = new THREE.Vector3(), tmp = new THREE.Vector3();
  const idx4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];

  let i = 0;
  while (i < N) {
    const end = Math.min(N, i + chunk);
    for (; i < end; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      idx4[0] = idx4[1] = idx4[2] = idx4[3] = 0;
      w4[0] = w4[1] = w4[2] = w4[3] = 0;
      for (let b = 0; b < NB; b++) {
        const s = seg[b];
        av.subVectors(v, s.a);
        let t = (av.x * s.ab.x + av.y * s.ab.y + av.z * s.ab.z) / s.len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        tmp.copy(s.a).addScaledVector(s.ab, t);
        const dx = v.x - tmp.x, dy = v.y - tmp.y, dz = v.z - tmp.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.0004;
        const w = 1 / (d2 * d2);
        // 上位4本を差し替え挿入
        if (w > w4[3]) {
          let k = 3;
          while (k > 0 && w4[k - 1] < w) { w4[k] = w4[k - 1]; idx4[k] = idx4[k - 1]; k--; }
          w4[k] = w; idx4[k] = b;
        }
      }
      const sum = w4[0] + w4[1] + w4[2] + w4[3] || 1;
      const o = i * 4;
      for (let k = 0; k < 4; k++) {
        skinIndex[o + k] = idx4[k];
        skinWeight[o + k] = w4[k] / sum;
      }
      // 手だけは自分のボーンにほぼ固定する（＝ポケットの手を独立させる）
    }
    yield end / N;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return { skinIndex, skinWeight };
}

/* ══════════════════════════════════════════════════════════
   ポーズ（rest = スキャンされた「ポケットに手」の姿勢）
   値は rest からの差分オイラー角 [x, y, z]（ラジアン）
   ══════════════════════════════════════════════════════════ */
export const POSES = {
  rest: {},
  /**
   * 回転の約束（モデル座標系: +X=正面, +Y=上, +Z=本人の右）
   *   腕・前腕の z > 0  …… 前方へ振る（だらりと下げた腕が前に出る）
   *   右腕の x < 0／左腕の x > 0 …… 横へ開く（上げる）
   *   前腕の y > 0（右）／y < 0（左） …… 手を内側（体の中心）へ寄せる
   *   頭の z > 0 …… 上を向く（z < 0 で下を向く）
   *   頭の y < 0 …… 顔を本人の右へ向ける
   *   胴の z < 0 …… 前屈（お辞儀）
   */

  // スマホを胸の前で覗き込む
  phone: {
    head: [0, 0, -0.30], neck: [0, 0, -0.12],
    armR: [0, 0, 0.30], forearmR: [0, 0.45, 1.45], handR: [0, 0.20, 0.30],
    armL: [0, 0, 0.22], forearmL: [0, -0.20, 0.45], handL: [0, 0, 0.15],
  },
  // 前方（黒板・窓の外）を指さす
  point: {
    armR: [0, -0.10, 1.30], forearmR: [0, -0.12, 0.18], handR: [0, 0, -0.05],
    chest: [0, -0.10, 0], head: [0, -0.12, -0.04],
  },
  // ✝本質✝（両手を上げる）
  honshitsu: {
    armR: [-2.55, 0, 0.22], forearmR: [-0.30, 0, 0.15], handR: [0, 0, 0.20],
    armL: [2.55, 0, -0.22], forearmL: [0.30, 0, -0.15], handL: [0, 0, -0.20],
    chest: [0, 0, 0.10], head: [0, 0, 0.26],
  },
  // 手を頭のあたりへ（耳の後ろをかく）
  scratch: {
    armR: [-2.30, 0, 0.20], forearmR: [-1.55, 0, -0.25], handR: [0, 0, 0.30],
    head: [0, 0.12, 0.10],
  },
  // 腕組み
  cross: {
    armR: [0, 0, 0.55], forearmR: [0, 0.85, 1.15], handR: [0, 0.30, 0.20],
    armL: [0, 0, 0.55], forearmL: [0, -0.85, 1.15], handL: [0, -0.30, 0.20],
    head: [0, 0, -0.06],
  },
  // 手を振る（挙手気味）
  wave: {
    armR: [-2.45, 0, 0.15], forearmR: [-0.50, 0, 0.05], handR: [0, 0, 0.20],
    head: [0, -0.06, 0.06],
  },
  // 顎に手を当てて考える
  think: {
    armR: [0, 0, 0.72], forearmR: [0, 0.50, 1.30], handR: [0, 0.25, 0.25],
    head: [0, 0.10, -0.14], chest: [0, 0, -0.06],
  },
  // 両手をポケットから出して広げる（説明してる感じ）
  explain: {
    armR: [0, -0.15, 0.72], forearmR: [0, 0.35, 0.62], handR: [0, 0, 0.25],
    armL: [0, 0.15, 0.72], forearmL: [0, -0.35, 0.62], handL: [0, 0, 0.25],
  },
  // ポケットから出してだらんと下ろす
  down: {
    armR: [-0.10, 0, 0.34], forearmR: [0, 0, 0.22],
    armL: [0.10, 0, 0.34], forearmL: [0, 0, 0.22],
  },
  // お辞儀
  bow: { spine: [0, 0, -0.26], chest: [0, 0, -0.18], neck: [0, 0, -0.16], head: [0, 0, -0.12] },
  // のけぞる（驚き）
  surprise: {
    spine: [0, 0, 0.16], chest: [0, 0, 0.10], head: [0, 0, 0.18],
    armR: [-0.35, 0, 0.45], armL: [0.35, 0, 0.45],
  },
};

/** 話しているときに差し込む小さな身振り */
export const TALK_GESTURES = [
  { pose: POSES.explain, weight: 1.4 },
  { pose: POSES.point, weight: 1.0 },
  { pose: POSES.scratch, weight: 0.7 },
  { pose: POSES.down, weight: 0.9 },
  { pose: POSES.think, weight: 0.6 },
  { pose: POSES.cross, weight: 0.5 },
];

/**
 * リグ：ポーズのブレンド・モーション再生・自動の身振り
 */
export class Rig {
  constructor({ root, bones, skeleton, map }) {
    this.root = root;
    this.bones = bones;
    this.skeleton = skeleton;
    this.map = map;
    this.t = 0;
    this.blend = 0;          // 0→1 の補間係数
    this.blendDur = 0.45;
    this.from = new Map();   // boneName → Euler(rest時点)
    this.target = new Map(); // boneName → Euler(目標)
    this.cur = new Map();    // boneName → Euler(現在)
    this.holdUntil = 0;
    this.queue = [];
    this.talking = 0;        // 話している残り時間
    this.nextGesture = 0;
    this.lookAt = new THREE.Vector3();
    this.lookWeight = 0;
    for (const d of BONE_DEFS) {
      this.from.set(d.name, new THREE.Euler());
      this.cur.set(d.name, new THREE.Euler());
      this.target.set(d.name, new THREE.Euler());
    }
    this.apply();
  }

  bone(name) { return this.map.get(name)?.bone; }

  /** ポーズをセット（duration 秒かけて blend） */
  setPose(pose, duration = 0.45) {
    for (const d of BONE_DEFS) {
      const cur = this.cur.get(d.name);
      this.from.set(d.name, new THREE.Euler(cur.x, cur.y, cur.z));
      const p = pose[d.name];
      this.target.set(d.name, new THREE.Euler(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0));
    }
    this.blend = 0;
    this.blendDur = Math.max(0.05, duration);
    this.holdUntil = 0;
  }

  /** モーション再生: [{pose, hold, dur}] の列。終わったら rest に戻る */
  play(seq, { loop = false } = {}) {
    this.queue = seq.slice();
    this.loopSeq = loop ? seq.slice() : null;
    this.next();
  }

  next() {
    const s = this.queue.shift();
    if (!s) {
      if (this.loopSeq) { this.queue = this.loopSeq.slice(); return this.next(); }
      this.setPose(POSES.rest, 0.55);
      return;
    }
    this.setPose(s.pose, s.dur ?? 0.4);
    this.holdUntil = this.t + (s.dur ?? 0.4) + (s.hold ?? 1.0);
  }

  /** 単発モーション（hold 秒だけ取って rest に戻る） */
  playOnce(pose, hold = 1.6, dur = 0.4) {
    this.queue = [];
    this.loopSeq = null;
    this.play([{ pose, hold, dur }]);
  }

  speak(seconds = 2) {
    this.talking = Math.max(this.talking, seconds);
  }

  /** カメラの方を向く（頭＋少し胸） */
  look(worldPos, weight = 1) {
    this.lookAt.copy(worldPos);
    this.lookWeight = weight;
  }

  update(dt) {
    this.t += dt;
    this.talking = Math.max(0, this.talking - dt);

    // ポーズ補間
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const e = this.blend < 0.5 ? 2 * this.blend * this.blend : 1 - Math.pow(-2 * this.blend + 2, 2) / 2;
      for (const d of BONE_DEFS) {
        const f = this.from.get(d.name), tg = this.target.get(d.name), c = this.cur.get(d.name);
        c.set(f.x + (tg.x - f.x) * e, f.y + (tg.y - f.y) * e, f.z + (tg.z - f.z) * e);
      }
    }
    if (this.holdUntil && this.t > this.holdUntil) { this.holdUntil = 0; this.next(); }

    // 毎フレーム、基本ポーズをボーンへ反映し直す（この上に呼吸・視線を足す）
    this.apply();

    // 呼吸
    const br = Math.sin(this.t * 1.35) * 0.012;
    const ch = this.bone('chest'), sp = this.bone('spine'), hd = this.bone('head');
    ch.rotation.x += br;
    sp.rotation.x += br * 0.5;
    sp.rotation.y += Math.sin(this.t * 0.43) * 0.02;
    // 話しているときの細かい首振り
    if (this.talking > 0) {
      hd.rotation.z += Math.sin(this.t * 9.5) * 0.012;
      hd.rotation.y += Math.sin(this.t * 7.3) * 0.016;
    }

    // 話している間の自動身振り
    if (this.talking > 0.4 && this.blend >= 1 && !this.holdUntil && !this.queue.length) {
      if (this.t > this.nextGesture) {
        this.nextGesture = this.t + 1.6 + Math.random() * 2.2;
        if (Math.random() < 0.62) {
          const g = TALK_GESTURES[Math.floor(Math.random() * TALK_GESTURES.length)];
          this.playOnce(g.pose, 0.9 + Math.random() * 1.4, 0.35);
        }
      }
    }
  }

  /** cur の値をボーンに反映（look は除く） */
  apply() {
    for (const d of BONE_DEFS) {
      const c = this.cur.get(d.name);
      const b = this.map.get(d.name).bone;
      b.rotation.set(c.x, c.y, c.z);
    }
  }

  /** 頭をカメラ方向へ向ける（apply の後に毎フレーム呼ぶ） */
  applyLook(worldTarget, amount = 1) {
    if (!worldTarget || amount <= 0) return;
    const head = this.map.get('head').bone;
    const chest = this.map.get('chest').bone;
    const hp = new THREE.Vector3();
    head.getWorldPosition(hp);
    const dir = new THREE.Vector3().subVectors(worldTarget, hp);
    const dist = dir.length() || 1;
    dir.divideScalar(dist);
    // ルート（体）のワールド回転を除いたローカル方向
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const local = dir.clone().transformDirection(inv);
    // モデル正面 = +X、右 = +Z、上 = +Y
    const yaw = Math.atan2(-local.z, local.x);          // 右を向くほど負
    const pitch = Math.asin(Math.max(-1, Math.min(1, local.y))); // 上を向くほど正
    const k = 0.55 * amount;
    head.rotation.y += Math.max(-0.7, Math.min(0.7, yaw)) * k;
    head.rotation.z += Math.max(-0.35, Math.min(0.35, pitch)) * k * 0.7;
    chest.rotation.y += Math.max(-0.3, Math.min(0.3, yaw)) * 0.22 * amount;
  }
}
