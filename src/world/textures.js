// Procedural canvas textures for the classroom (no external assets needed).
import * as THREE from 'three';

const JP_FONT = '"Klee One","Yu Kyokasho","UD Digi Kyokasho N-R","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// deterministic pseudo random
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function finish(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// grainy noise overlay
function grain(g, w, h, alpha, seed = 1, scale = 1) {
  const r = rng(seed);
  const n = Math.floor((w * h) / (28 * scale));
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * w, r() * h, 1.5 * scale, 1.5 * scale);
  }
}

/** Light beech wood (desk tops, board frame). */
export function woodTexture({ hue = 36, light = 72, w = 512, h = 512, seed = 7, rings = 26 } = {}) {
  const [c, g] = canvas(w, h);
  const r = rng(seed);
  g.fillStyle = `hsl(${hue}, 45%, ${light}%)`;
  g.fillRect(0, 0, w, h);
  // grain lines along x
  for (let i = 0; i < rings; i++) {
    const y0 = r() * h;
    const amp = 4 + r() * 10;
    const freq = 0.004 + r() * 0.01;
    g.strokeStyle = `hsla(${hue - 4 + r() * 8}, 40%, ${light - 12 - r() * 14}%, ${0.18 + r() * 0.25})`;
    g.lineWidth = 0.8 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin(x * freq + i) * amp + Math.sin(x * 0.03 + i * 3) * 1.5;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  grain(g, w, h, 0.05, seed + 1);
  return finish(c);
}

/** Pale vinyl floor, as in the reference photo. */
export function floorTexture() {
  const w = 1024, h = 1024;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#bdb6a8';
  g.fillRect(0, 0, w, h);
  const r = rng(99);
  // marbled streaks
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `hsla(${34 + r() * 10}, ${10 + r() * 12}%, ${70 + r() * 18}%, ${0.15 + r() * 0.2})`;
    g.lineWidth = 2 + r() * 14;
    g.beginPath();
    const x = r() * w, y = r() * h;
    g.moveTo(x, y);
    g.bezierCurveTo(x + r() * 200 - 100, y + r() * 60 - 30, x + r() * 200 - 100, y + r() * 60 - 30, x + r() * 300 - 150, y + r() * 80 - 40);
    g.stroke();
  }
  grain(g, w, h, 0.07, 5);
  // faint tile seams (every 2m with repeat 4 → tile every ~0.5m... keep subtle)
  g.strokeStyle = 'rgba(80,70,60,0.12)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * (w / 4), 0); g.lineTo(i * (w / 4), h); g.stroke(); g.beginPath(); g.moveTo(0, i * (h / 4)); g.lineTo(w, i * (h / 4)); g.stroke(); }
  return finish(c, { repeat: [5, 5] });
}

export function wallTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#e9e5db';
  g.fillRect(0, 0, 512, 512);
  grain(g, 512, 512, 0.05, 11);
  return finish(c, { repeat: [4, 2] });
}

export function ceilingTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#f2f1ec';
  g.fillRect(0, 0, 512, 512);
  // rockwool pin holes
  const r = rng(3);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(120,120,115,${0.12 + r() * 0.2})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 510);
  return finish(c, { repeat: [15, 14] });
}

/** Wainscot wood panelling for the lower part of walls. */
export function panelTexture() {
  const t = woodTexture({ hue: 34, light: 76, w: 512, h: 256, seed: 21, rings: 14 });
  t.repeat.set(6, 1);
  return t;
}

// --- chalk helpers --------------------------------------------------------------
function chalkText(g, text, x, y, size, { align = 'left', alpha = 0.9, color = '255,255,255', rot = 0, seed = 1 } = {}) {
  const r = rng(seed);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `${size}px ${JP_FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  // double-draw with jitter for a chalky look
  for (let i = 0; i < 3; i++) {
    g.fillStyle = `rgba(${color},${alpha * (0.35 + i * 0.2)})`;
    g.fillText(text, (r() - 0.5) * 2.2, (r() - 0.5) * 2.2);
  }
  g.restore();
}
function chalkLine(g, pts, width = 4, alpha = 0.85, seed = 2) {
  const r = rng(seed);
  g.strokeStyle = `rgba(255,255,255,${alpha})`;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = x + (r() - 0.5) * 3, jy = y + (r() - 0.5) * 3;
    if (i === 0) g.moveTo(jx, jy); else g.lineTo(jx, jy);
  });
  g.stroke();
}

/** The chalkboard: 3.6m × 1.2m (3:1). */
export function chalkboardTexture() {
  const w = 2400, h = 800;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#2b4a3c';
  g.fillRect(0, 0, w, h);
  // chalk dust / eraser smears
  const r = rng(42);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(230,235,225,${0.015 + r() * 0.04})`;
    const sw = 60 + r() * 220, sh = 10 + r() * 40;
    g.fillRect(r() * w, r() * h, sw, sh);
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.05})`;
    g.beginPath(); g.ellipse(r() * w, h * 0.45 + r() * h * 0.5, 40 + r() * 90, 14 + r() * 24, r(), 0, Math.PI * 2); g.fill();
  }

  // header: date + 日直
  chalkText(g, '10月5日（月）', 60, 70, 46, { seed: 3 });
  chalkText(g, '日直　両馬 ・ 三重', 60, 130, 40, { seed: 4 });
  chalkLine(g, [[50, 165], [560, 168]], 3, 0.6, 9);

  // main: 河岸段丘 cross-section drawn FROM THE TOP (ヘイカツ style)
  chalkText(g, '河岸段丘  ―  上から描く', 1200, 90, 58, { align: 'center', seed: 5 });
  chalkText(g, '（今の地面 → 過去へ掘る）', 1200, 150, 34, { align: 'center', alpha: 0.75, seed: 6 });
  const bx = 760, by = 230;
  // step profile (left high → river → right)
  const prof = [
    [bx, by + 40], [bx + 180, by + 40], [bx + 210, by + 110], [bx + 360, by + 110], [bx + 390, by + 190],
    [bx + 520, by + 190], [bx + 540, by + 250], [bx + 640, by + 250], [bx + 660, by + 190], [bx + 790, by + 190],
    [bx + 820, by + 110], [bx + 960, by + 110], [bx + 990, by + 40], [bx + 1160, by + 40],
  ];
  chalkLine(g, prof, 6, 0.9, 10);
  // strata lines (dashed, older below)
  for (let k = 1; k <= 3; k++) {
    g.setLineDash([14, 12]);
    chalkLine(g, [[bx, by + 40 + k * 75], [bx + 1160, by + 40 + k * 75]], 3, 0.45, 20 + k);
    g.setLineDash([]);
  }
  // river
  chalkLine(g, [[bx + 555, by + 262], [bx + 580, by + 250], [bx + 605, by + 264], [bx + 630, by + 250]], 4, 0.8, 30);
  chalkText(g, '川', bx + 592, by + 300, 34, { align: 'center', seed: 7 });
  chalkText(g, '① 今の地表（いちばん新しい）', bx + 1180, by + 40, 30, { seed: 8 });
  chalkText(g, '② 一段古い', bx + 1180, by + 112, 30, { seed: 9 });
  chalkText(g, '③ さらに古い', bx + 1180, by + 190, 30, { seed: 10 });
  chalkText(g, '段丘面', bx + 90, by + 20, 30, { align: 'center', seed: 11 });
  chalkText(g, '段丘崖', bx + 400, by + 150, 26, { align: 'center', seed: 12, rot: -0.9 });
  chalkText(g, '「時間を掘ってると思ってくれ」', 1200, by + 360, 36, { align: 'center', alpha: 0.8, seed: 13 });
  chalkText(g, '上の段ほど古い！', bx + 1000, by + 330, 34, { seed: 14, color: '255,220,160' });

  // doodles in the corner (両馬の仕業)
  chalkText(g, '✝本質✝', 2180, 640, 54, { align: 'center', seed: 15, color: '255,235,180', rot: -0.08 });
  chalkText(g, '三重県臣について考えよ', 2180, 710, 30, { align: 'center', seed: 16, alpha: 0.7, rot: -0.05 });
  chalkText(g, 'みえみえしい', 2050, 760, 24, { align: 'center', seed: 17, alpha: 0.5, rot: 0.04 });
  chalkText(g, 'やめろ', 2330, 760, 26, { align: 'center', seed: 18, alpha: 0.6, rot: 0.1 });
  // partially erased math on the left bottom
  chalkText(g, 'y = ax² + bx + c', 60, 520, 40, { alpha: 0.28, seed: 19 });
  chalkText(g, 'D = b² − 4ac', 60, 580, 40, { alpha: 0.22, seed: 20 });
  chalkText(g, '金曜5限 地理 → 小テスト', 60, 700, 34, { alpha: 0.8, seed: 21 });
  chalkText(g, 'コーンスープ 補充 未定（3ヶ月目）', 60, 760, 28, { alpha: 0.6, seed: 22 });

  return finish(c, { aniso: 16 });
}

/** A4-ish paper posters. kind: 'timetable' | 'goal' | 'honshitsu' | 'notice' | 'cornsoup' */
export function posterTexture(kind) {
  const w = 420, h = 594;
  const [c, g] = canvas(w, h);
  g.fillStyle = kind === 'honshitsu' ? '#fff8e6' : '#fbfbf7';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#222';
  g.textAlign = 'center';
  if (kind === 'timetable') {
    g.font = `bold 34px ${JP_FONT}`; g.fillText('時間割　1年B組（理数科）', w / 2, 50);
    const days = ['', '月', '火', '水', '木', '金'];
    const subj = [
      ['1', '数学', '英語', '物理', '数学', '化学'],
      ['2', '英語', '数学', '数学', '国語', '英語'],
      ['3', '化学', '物理', '国語', '英語', '数学'],
      ['4', '国語', '情報', '英語', '物理', '体育'],
      ['5', '物理', '体育', '化学', '化学', '地理'],
      ['6', '地理', '国語', 'LHR', '数学', '総合'],
    ];
    const cw = (w - 40) / 6, ch = 60, ox = 20, oy = 80;
    g.font = `22px ${JP_FONT}`;
    for (let r = 0; r <= 6; r++) for (let cI = 0; cI < 6; cI++) {
      const x = ox + cI * cw, y = oy + r * ch;
      g.fillStyle = r === 0 || cI === 0 ? '#e8e4d8' : '#fff';
      g.fillRect(x, y, cw, ch);
      g.strokeStyle = '#888'; g.strokeRect(x, y, cw, ch);
      g.fillStyle = (r === 5 && cI === 5) ? '#b8860b' : '#222';
      g.fillText(r === 0 ? days[cI] : subj[r - 1][cI], x + cw / 2, y + ch / 2 + 8);
    }
    g.font = `18px ${JP_FONT}`; g.fillStyle = '#555'; g.fillText('※金曜5限はいつも死んでいる', w / 2, 520);
  } else if (kind === 'goal') {
    g.font = `bold 36px ${JP_FONT}`; g.fillText('学級目標', w / 2, 80);
    g.font = `bold 72px ${JP_FONT}`; g.fillText('正しいことより', w / 2, 230);
    g.fillText('本当のことを', w / 2, 320);
    g.font = `20px ${JP_FONT}`; g.fillStyle = '#666'; g.fillText('（誰かが勝手に貼った。先生は気づいていない）', w / 2, 520);
  } else if (kind === 'honshitsu') {
    g.fillStyle = '#b8860b'; g.font = `bold 110px ${JP_FONT}`; g.fillText('✝', w / 2, 160);
    g.fillStyle = '#222'; g.font = `bold 86px ${JP_FONT}`; g.fillText('本質', w / 2, 300);
    g.fillStyle = '#b8860b'; g.font = `bold 110px ${JP_FONT}`; g.fillText('✝', w / 2, 440);
    g.fillStyle = '#444'; g.font = `22px ${JP_FONT}`; g.fillText('笑われた数だけ、本質に近づく。', w / 2, 540);
  } else if (kind === 'cornsoup') {
    g.font = `bold 40px ${JP_FONT}`; g.fillText('お知らせ', w / 2, 70);
    g.font = `30px ${JP_FONT}`;
    ['北棟自販機の', 'コーンスープは', '現在補充の予定が', 'ありません。', '', 'なぜかは', '誰も知りません。'].forEach((l, i) => g.fillText(l, w / 2, 150 + i * 50));
    g.font = `20px ${JP_FONT}`; g.fillStyle = '#666'; g.fillText('― 北棟 生徒会（？）', w / 2, 540);
  } else {
    g.font = `bold 34px ${JP_FONT}`; g.fillText('本質配信 #5', w / 2, 70);
    g.font = `26px ${JP_FONT}`;
    ['今週土曜 21:00〜', '配信者：寺地', '', '✝本質✝をLINEオプチャに', '送ってください。', '意味はなくてもいいです。', '', '視聴者 812人'].forEach((l, i) => g.fillText(l, w / 2, 140 + i * 46));
  }
  return finish(c, { aniso: 8 });
}

/** Outside view through the windows (sky + school yard). */
export function skyTexture() {
  const w = 512, h = 512;
  const [c, g] = canvas(w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#6fa6e8');
  grd.addColorStop(0.55, '#bcd8f5');
  grd.addColorStop(1, '#e9f1f8');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < 18; i++) {
    const x = r() * w, y = 40 + r() * 200, s = 30 + r() * 70;
    g.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.4})`;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (r() - 0.5) * s * 2, y + (r() - 0.5) * s * 0.6, s * (0.4 + r() * 0.5), s * (0.25 + r() * 0.3), 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = finish(c, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function noticeBoardTexture() {
  const w = 1024, h = 512;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#7f8c6a'; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.1, 31, 2);
  const r = rng(8);
  const notes = ['模試 日程', '進路だより', '文化祭 実行委員 募集', '清掃分担表', '図書だより', '保健室より', 'ヘイカツ 雑談スレ(4人)', '櫻 恋愛学 研究協力者 募集'];
  notes.forEach((n, i) => {
    const pw = 150 + r() * 60, ph = 190 + r() * 60;
    const x = 30 + (i % 4) * 245 + r() * 20, y = 30 + Math.floor(i / 4) * 240 + r() * 20;
    g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate((r() - 0.5) * 0.08);
    g.fillStyle = ['#fff', '#fdf6d8', '#e8f3ff', '#f8e8ee'][i % 4]; g.fillRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle = '#c33'; g.beginPath(); g.arc(0, -ph / 2 + 10, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.font = `bold 22px ${JP_FONT}`; g.textAlign = 'center'; g.fillText(n, 0, -ph / 2 + 50);
    g.fillStyle = '#777'; for (let l = 0; l < 7; l++) { g.fillRect(-pw / 2 + 16, -ph / 2 + 75 + l * 16, pw - 32 - r() * 50, 4); }
    g.restore();
  });
  return finish(c, { aniso: 8 });
}

export function clockTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#333'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#222'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 114 - 1, 128 - Math.cos(a) * 114 - 1, i % 5 === 0 ? 4 : 2, i % 5 === 0 ? 4 : 2); }
  // 16:42
  const hand = (len, ang, wdt) => { g.strokeStyle = '#111'; g.lineWidth = wdt; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(ang) * len, 128 - Math.cos(ang) * len); g.stroke(); };
  hand(60, ((4 + 42 / 60) / 12) * Math.PI * 2, 8);
  hand(92, (42 / 60) * Math.PI * 2, 5);
  g.strokeStyle = '#c22'; hand(100, (17 / 60) * Math.PI * 2, 2);
  return finish(c);
}

export function nameplateTexture(text) {
  const [c, g] = canvas(256, 96);
  g.fillStyle = '#f5f0dc'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#8a6d3b'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
  g.fillStyle = '#222'; g.font = `bold 40px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  return finish(c);
}
