import * as THREE from 'three';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(canvas, { repeat = null, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = aniso;
  return t;
}

/** 黒板：等高線の地形図・味噌・河岸段丘・ヘイカツの字 */
export function chalkboardTexture() {
  const [c, g] = cv(2048, 768);
  g.fillStyle = '#16302a';
  g.fillRect(0, 0, c.width, c.height);
  // 消し残り
  for (let i = 0; i < 220; i++) {
    g.globalAlpha = 0.02 + Math.random() * 0.05;
    g.fillStyle = '#dfeae4';
    g.beginPath();
    g.ellipse(Math.random() * c.width, Math.random() * c.height, 40 + Math.random() * 160, 8 + Math.random() * 26, Math.random(), 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;

  const chalk = (a = 0.9) => { g.strokeStyle = `rgba(238,246,240,${a})`; g.fillStyle = `rgba(238,246,240,${a})`; };

  // 地形図（等高線）
  g.save();
  g.translate(180, 400);
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    chalk(0.55);
    g.beginPath();
    const r = 34 + i * 26;
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.09) {
      const wob = 1 + 0.24 * Math.sin(a * 3 + i * 0.7) + 0.12 * Math.cos(a * 5 - i);
      const x = Math.cos(a) * r * wob * 1.45;
      const y = Math.sin(a) * r * wob * 0.72;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // 川
  chalk(0.8);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-360, 40);
  g.bezierCurveTo(-160, -30, 60, 120, 380, 30);
  g.stroke();
  g.restore();

  g.font = 'bold 62px "Hiragino Mincho ProN","Yu Mincho",serif';
  chalk(0.95);
  g.fillText('糸魚川 — 静岡構造線', 760, 150);
  g.font = 'bold 46px "Hiragino Mincho ProN","Yu Mincho",serif';
  chalk(0.85);
  g.fillText('お前らが今朝飲んだ味噌汁は', 760, 230);
  g.fillText('地殻変動が決めている', 760, 292);

  // 断面図（上から現在→過去へ掘る）
  g.save();
  g.translate(770, 400);
  g.lineWidth = 5;
  chalk(0.8);
  for (let i = 0; i < 4; i++) {
    const y = i * 62;
    g.beginPath(); g.moveTo(0, y); g.lineTo(620, y); g.stroke();
    g.font = '34px "Hiragino Mincho ProN",serif';
    chalk(0.6);
    g.fillText(['現在', '↓', '↓', '過去'][i], 640, y + 12);
  }
  g.font = 'bold 40px "Hiragino Mincho ProN",serif';
  chalk(0.9);
  g.fillText('河岸段丘：時間を掘る', 0, 300);
  g.restore();

  // 右下の落書き
  g.font = '38px "Hiragino Mincho ProN",serif';
  chalk(0.5);
  g.fillText('同じ地図を、三年見る。', 1500, 690);
  chalk(0.35);
  g.font = '30px sans-serif';
  g.fillText('✝', 1900, 690);
  return tex(c);
}

/** 窓の外：空・山・電線・校庭 */
export function outsideTexture() {
  const [c, g] = cv(1024, 512);
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#8fc4ee');
  sky.addColorStop(0.55, '#c9e4f6');
  sky.addColorStop(1, '#eaf3ec');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // 遠景の山（稜線）
  const ridge = (base, amp, color, alpha) => {
    g.beginPath();
    g.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 8) {
      const y = base
        + Math.sin(x * 0.006) * amp
        + Math.sin(x * 0.017 + 1.3) * amp * 0.5
        + Math.sin(x * 0.031 + 0.4) * amp * 0.22;
      g.lineTo(x, y);
    }
    g.lineTo(1024, 512);
    g.closePath();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
  };
  ridge(300, 46, '#9fb6c6', 0.55);
  ridge(344, 38, '#7d9a86', 0.7);
  ridge(392, 26, '#5f8262', 0.9);

  // 校庭・グラウンド
  g.fillStyle = '#7f9264';
  g.fillRect(0, 430, 1024, 82);
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 470); g.lineTo(1024, 470); g.stroke();

  // 電線
  g.strokeStyle = 'rgba(40,45,50,0.75)';
  for (let i = 0; i < 3; i++) {
    const y = 150 + i * 26;
    g.lineWidth = i === 0 ? 3 : 2;
    g.beginPath();
    g.moveTo(0, y + 8);
    g.quadraticCurveTo(512, y + 46, 1024, y + 6);
    g.stroke();
  }
  // 電柱
  g.fillStyle = 'rgba(60,55,50,0.85)';
  g.fillRect(120, 130, 9, 320);
  g.fillRect(880, 130, 9, 320);
  g.fillRect(96, 165, 58, 6);
  g.fillRect(856, 165, 58, 6);
  return tex(c);
}

/** 自販機（コーンスープがある / ない） */
export function vendingTexture(restocked = false) {
  const [c, g] = cv(512, 900);
  g.fillStyle = '#e8ecf0';
  g.fillRect(0, 0, 512, 900);
  g.fillStyle = '#2f3b47';
  g.fillRect(0, 0, 512, 150);
  g.fillStyle = '#dfe6ec';
  g.fillRect(0, 150, 512, 12);

  // 商品棚
  const rows = 5, cols = 4;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const x = 30 + i * 116, y = 190 + r * 132;
      const isCorn = r === 4 && i === 2;
      g.fillStyle = '#0f1720';
      g.fillRect(x, y, 96, 116);
      if (isCorn && !restocked) {
        g.fillStyle = '#1b2530';
        g.fillRect(x, y, 96, 116);
        g.font = 'bold 22px sans-serif';
        g.fillStyle = '#6d7b87';
        g.fillText('SOLD', x + 22, y + 62);
        g.fillText('OUT', x + 30, y + 86);
        g.strokeStyle = '#5a6a76';
        g.lineWidth = 3;
        g.strokeRect(x + 6, y + 6, 84, 104);
        continue;
      }
      const hue = isCorn ? 40 : [200, 8, 140, 30, 210][(r + i) % 5];
      const grd = g.createLinearGradient(x, y, x, y + 116);
      grd.addColorStop(0, `hsl(${hue},70%,62%)`);
      grd.addColorStop(1, `hsl(${hue},70%,38%)`);
      g.fillStyle = grd;
      g.fillRect(x + 8, y + 10, 80, 96);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(x + 8, y + 34, 80, 20);
      g.font = 'bold 16px sans-serif';
      g.fillStyle = '#1a222a';
      g.fillText(isCorn ? 'CORN' : ['WATER', 'COFFEE', 'MATCHA', 'SPORTS', 'MILK'][(r + i) % 5], x + 10, y + 49);
      // 値札
      g.fillStyle = '#f2f5f7';
      g.fillRect(x + 6, y + 108, 84, 8);
      g.fillStyle = '#111';
      g.fillRect(x + 6, y + 108, 84, 2);
    }
  }
  // 取り出し口
  g.fillStyle = '#151c24';
  g.fillRect(40, 830, 260, 50);
  // ボタン列
  for (let i = 0; i < cols; i++) {
    g.fillStyle = i === 2 && !restocked ? '#8b98a3' : '#f5a623';
    g.beginPath();
    g.arc(62 + i * 116, 178, 9, 0, 7);
    g.fill();
    g.fillStyle = '#39424c';
    g.font = 'bold 13px sans-serif';
    g.fillText(String(i + 1), 58 + i * 116, 182);
  }
  // お金の投入口
  g.fillStyle = '#39424c';
  g.fillRect(360, 820, 110, 70);
  g.fillStyle = '#8b98a3';
  g.fillRect(376, 836, 78, 8);
  return tex(c);
}

/** 掲示板（模試の成績・✝の張り紙） */
export function noticeTexture() {
  const [c, g] = cv(1024, 640);
  g.fillStyle = '#c9a877';
  g.fillRect(0, 0, 1024, 640);
  // コルクの粒
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${90 + Math.random() * 50},${60 + Math.random() * 40},0.25)`;
    g.fillRect(Math.random() * 1024, Math.random() * 640, 2, 2);
  }
  const paper = (x, y, w, h, rot) => {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(rot);
    g.fillStyle = '#fbfaf5';
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#c0392b';
    g.beginPath(); g.arc(0, -h / 2 + 8, 6, 0, 7); g.fill();
    g.restore();
  };
  paper(60, 60, 300, 380, -0.02);
  paper(400, 90, 260, 320, 0.03);
  paper(700, 60, 280, 400, -0.015);
  paper(120, 470, 420, 130, 0.01);
  paper(600, 480, 330, 120, -0.025);

  g.fillStyle = '#2b2b2b';
  g.font = 'bold 34px "Hiragino Mincho ProN",serif';
  g.fillText('模試 上位者', 100, 130);
  g.font = '26px "Hiragino Mincho ProN",serif';
  g.fillStyle = '#444';
  ['1位 数理零（理数科）', '2位 内藤蘭', '3位 三峰', '4位 櫻優'].forEach((s, i) => g.fillText(s, 100, 180 + i * 42));

  g.fillStyle = '#2b2b2b';
  g.font = 'bold 30px "Hiragino Mincho ProN",serif';
  g.fillText('✝本質✝募集所', 730, 130);
  g.font = '24px "Hiragino Mincho ProN",serif';
  g.fillStyle = '#555';
  ['本質を送ってください', '紙に書いて読みます', '寺地星のカス配信'].forEach((s, i) => g.fillText(s, 730, 180 + i * 38));

  g.fillStyle = '#2b2b2b';
  g.font = 'bold 28px "Hiragino Mincho ProN",serif';
  g.fillText('球技大会 組合せ', 430, 140);
  g.font = '24px "Hiragino Mincho ProN",serif';
  g.fillStyle = '#555';
  g.fillText('B組 vs A組', 430, 190);

  g.fillStyle = '#2b2b2b';
  g.font = 'bold 26px "Hiragino Mincho ProN",serif';
  g.fillText('北棟自販機 コーンスープ補充について（検討中）', 150, 530);
  g.font = '22px "Hiragino Mincho ProN",serif';
  g.fillStyle = '#666';
  g.fillText('※ 業者に連絡済み（未返信）', 150, 566);
  return tex(c);
}

/** 床（ビニルタイル） */
export function floorTexture() {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#cbb99c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${140 + Math.random() * 90},${125 + Math.random() * 80},${100 + Math.random() * 70},${Math.random() * 0.35})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(120,105,85,0.5)';
  g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  return tex(c, { repeat: [7, 6] });
}

/** 木目（机・椅子） */
export function woodTexture(tint = '#c69c6d') {
  const [c, g] = cv(512, 512);
  g.fillStyle = tint;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(120,88,54,${0.05 + Math.random() * 0.13})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath();
    const y = Math.random() * 512;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 24) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 5);
    g.stroke();
  }
  return tex(c, { repeat: [1, 1] });
}

/** 壁紙（少し汚れたクリーム色） */
export function wallTexture() {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#e9e4d8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${180 + Math.random() * 60},${175 + Math.random() * 60},${160 + Math.random() * 60},0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  g.strokeStyle = 'rgba(150,145,130,0.25)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 505); g.lineTo(512, 505); g.stroke();
  return tex(c, { repeat: [4, 2] });
}

/** ✝ パーティクル用スプライト */
export function crossSprite() {
  const [c, g] = cv(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#ffe9a8';
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.shadowColor = '#ffb347';
  g.shadowBlur = 22;
  g.beginPath(); g.moveTo(64, 16); g.lineTo(64, 112); g.stroke();
  g.beginPath(); g.moveTo(22, 52); g.lineTo(106, 52); g.stroke();
  g.beginPath(); g.moveTo(38, 34); g.lineTo(90, 86); g.stroke();
  g.lineWidth = 5;
  g.strokeStyle = '#fff7d6';
  g.beginPath(); g.moveTo(64, 16); g.lineTo(64, 112); g.stroke();
  g.beginPath(); g.moveTo(22, 52); g.lineTo(106, 52); g.stroke();
  return tex(c, { srgb: true });
}

/** 廊下の掲示（✝が落書きされたポスター） */
export function corridorPosterTexture() {
  const [c, g] = cv(512, 720);
  g.fillStyle = '#f6f3ea';
  g.fillRect(0, 0, 512, 720);
  g.fillStyle = '#1c2b4a';
  g.fillRect(0, 0, 512, 120);
  g.fillStyle = '#fff';
  g.font = 'bold 54px "Hiragino Mincho ProN",serif';
  g.fillText('✝本質✝年鑑', 60, 82);
  g.fillStyle = '#333';
  g.font = '30px "Hiragino Mincho ProN",serif';
  g.fillText('桐葉高校 理数科B組', 60, 190);
  g.fillText('編纂：倉石暁（2年A組）', 60, 240);
  g.font = '24px "Hiragino Mincho ProN",serif';
  g.fillStyle = '#555';
  ['両馬二郎 ✝本質✝発言 782回', 'うち「まじ✝本質✝」311回', '三重県臣「は？」312回', '寺地星 本質配信 16回'].forEach((s, i) => g.fillText(s, 60, 320 + i * 48));
  g.strokeStyle = '#1c2b4a';
  g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 692);
  g.fillStyle = 'rgba(190,40,40,0.8)';
  g.font = 'bold 40px sans-serif';
  g.fillText('✝', 430, 660);
  return tex(c);
}
