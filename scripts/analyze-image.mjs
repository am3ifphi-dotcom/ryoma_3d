/**
 * 参照画像を「読める形」に変換する（視覚の代わり）。
 * 輝度の ASCII アート ＋ 色名のグリッド ＋ 主要色の統計を出力する。
 * 使い方: node scripts/analyze-image.mjs [jpg]
 */
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const file = process.argv[2] || 'scripts/ref.jpg';
const raw = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true });
const { width: W, height: H, data } = raw;
console.log(`画像サイズ: ${W} × ${H}`);

const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

/* ── 1. 輝度の ASCII アート ── */
const COLS = 96, ROWS = 46;
const ramp = ' .:-=+*#%@';
console.log('\n=== 輝度（@ が明るい） ===');
const lumGrid = [];
for (let r = 0; r < ROWS; r++) {
  let line = '';
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let sum = 0, n = 0;
    for (let y = Math.floor((r * H) / ROWS); y < Math.floor(((r + 1) * H) / ROWS); y += 2) {
      for (let x = Math.floor((c * W) / COLS); x < Math.floor(((c + 1) * W) / COLS); x += 2) {
        const [R, G, B] = px(x, y);
        sum += 0.299 * R + 0.587 * G + 0.114 * B;
        n++;
      }
    }
    const v = sum / Math.max(1, n);
    row.push(v);
    line += ramp[Math.min(ramp.length - 1, Math.floor((v / 255) * ramp.length))];
  }
  lumGrid.push(row);
  console.log(line);
}

/* ── 2. 色名グリッド ── */
function nameOf(R, G, B) {
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const v = mx / 255, s = mx === 0 ? 0 : (mx - mn) / mx;
  if (v < 0.12) return 'BLK';
  if (s < 0.12) return v > 0.8 ? 'WHT' : v > 0.55 ? 'GRY' : v > 0.3 ? 'gry' : 'drk';
  let h = 0;
  if (mx === R) h = (60 * ((G - B) / (mx - mn)) + 360) % 360;
  else if (mx === G) h = 60 * ((B - R) / (mx - mn)) + 120;
  else h = 60 * ((R - G) / (mx - mn)) + 240;
  const dark = v < 0.35, light = v > 0.75;
  let base;
  if (h < 12 || h >= 345) base = 'RED';
  else if (h < 40) base = light ? 'ORG' : 'BRN';
  else if (h < 70) base = 'YEL';
  else if (h < 160) base = 'GRN';
  else if (h < 200) base = 'CYN';
  else if (h < 260) base = 'BLU';
  else base = 'MAG';
  return dark ? base.toLowerCase() : base;
}
const CC = 32, CR = 18;
console.log('\n=== 色（BRN=木/机, GRN=黒板/緑, BLU=空/窓, WHT=明, GRY=壁, BLK=暗） ===');
for (let r = 0; r < CR; r++) {
  let line = '';
  for (let c = 0; c < CC; c++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = Math.floor((r * H) / CR); y < Math.floor(((r + 1) * H) / CR); y += 2) {
      for (let x = Math.floor((c * W) / CC); x < Math.floor(((c + 1) * W) / CC); x += 2) {
        const p = px(x, y); R += p[0]; G += p[1]; B += p[2]; n++;
      }
    }
    line += nameOf(R / n, G / n, B / n).slice(0, 3).padEnd(4);
  }
  console.log(String(Math.round((r / CR) * 100)).padStart(3) + '% ' + line);
}

/* ── 3. 主要色の出現率 ── */
const hist = new Map();
for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
  const [R, G, B] = px(x, y);
  const k = nameOf(R, G, B);
  hist.set(k, (hist.get(k) || 0) + 1);
}
const tot = [...hist.values()].reduce((a, b) => a + b, 0);
console.log('\n=== 主要色の出現率 ===');
[...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(5)} ${((v / tot) * 100).toFixed(1)}%`));

/* ── 4. 行・列ごとの明るさ（窓・黒板の位置推定） ── */
console.log('\n=== 列ごとの平均輝度（左→右） ===');
let s = '';
for (let c = 0; c < 48; c++) {
  let sum = 0, n = 0;
  for (let y = 0; y < H; y += 4) for (let x = Math.floor((c * W) / 48); x < Math.floor(((c + 1) * W) / 48); x += 3) {
    const [R, G, B] = px(x, y); sum += 0.299 * R + 0.587 * G + 0.114 * B; n++;
  }
  s += ramp[Math.min(9, Math.floor((sum / n / 255) * 10))];
}
console.log('  ' + s);
console.log('=== 行ごとの平均輝度（上→下） ===');
for (let r = 0; r < 24; r++) {
  let sum = 0, n = 0;
  for (let y = Math.floor((r * H) / 24); y < Math.floor(((r + 1) * H) / 24); y += 3) for (let x = 0; x < W; x += 5) {
    const [R, G, B] = px(x, y); sum += 0.299 * R + 0.587 * G + 0.114 * B; n++;
  }
  const v = sum / n;
  console.log(`  ${String(Math.round((r / 24) * 100)).padStart(3)}% ${'#'.repeat(Math.round(v / 6))} ${v.toFixed(0)}`);
}
