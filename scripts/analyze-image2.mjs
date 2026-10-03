/**
 * 参照画像の構造解析：細かい色グリッド＋エッジ（縦線・横線）の検出
 * 使い方: node scripts/analyze-image2.mjs [jpg]
 */
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const file = process.argv[2] || 'scripts/ref.jpg';
const { width: W, height: H, data } = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true });
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

function code(R, G, B) {
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const v = mx / 255, s = mx === 0 ? 0 : (mx - mn) / mx;
  if (v < 0.16) return 'K';            // ほぼ黒
  if (s < 0.14) return v > 0.78 ? 'W' : v > 0.5 ? 'G' : v > 0.28 ? 'g' : 'k';
  let h;
  if (mx === R) h = (60 * ((G - B) / (mx - mn)) + 360) % 360;
  else if (mx === G) h = 60 * ((B - R) / (mx - mn)) + 120;
  else h = 60 * ((R - G) / (mx - mn)) + 240;
  if (h < 18 || h >= 340) return v < 0.45 ? 'r' : 'R';   // 赤
  if (h < 45) return v < 0.45 ? 'o' : 'O';               // 橙 / 木
  if (h < 70) return v < 0.5 ? 'y' : 'Y';                // 黄
  if (h < 165) return v < 0.45 ? 'n' : 'N';              // 緑
  if (h < 200) return 'C';                               // 水
  if (h < 265) return v < 0.5 ? 'b' : 'B';               // 青
  return 'M';
}

const CC = 74, CR = 40;
console.log(`=== 色コード ${CC}×${CR} （K黒 k暗 g灰 G明灰 W白 R赤 O橙 Y黄 N緑 C水 B青 M紫 / 小文字=暗い） ===`);
console.log('     ' + Array.from({ length: CC }, (_, i) => (i % 10 === 0 ? String(Math.round((i / CC) * 10)) : ' ')).join(''));
for (let r = 0; r < CR; r++) {
  let line = '';
  for (let c = 0; c < CC; c++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = Math.floor((r * H) / CR); y < Math.floor(((r + 1) * H) / CR); y++) {
      for (let x = Math.floor((c * W) / CC); x < Math.floor(((c + 1) * W) / CC); x++) {
        const p = px(x, y); R += p[0]; G += p[1]; B += p[2]; n++;
      }
    }
    line += code(R / n, G / n, B / n);
  }
  console.log(String(Math.round((r / CR) * 100)).padStart(3) + '% ' + line);
}

/* エッジ解析 */
const lum = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [R, G, B] = px(x, y);
  lum[y * W + x] = 0.299 * R + 0.587 * G + 0.114 * B;
}
const colEdge = new Float32Array(W), rowEdge = new Float32Array(H);
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const gx = Math.abs(lum[y * W + x + 1] - lum[y * W + x - 1]);
  const gy = Math.abs(lum[(y + 1) * W + x] - lum[(y - 1) * W + x]);
  colEdge[x] += gx; rowEdge[y] += gy;
}
const norm = (arr) => { const m = Math.max(...arr); return Array.from(arr, (v) => v / (m || 1)); };
const ce = norm(colEdge), re = norm(rowEdge);
console.log('\n=== 縦のエッジが強い列（= 縦線・窓枠・黒板の端） ===');
let s = '';
for (let x = 0; x < W; x++) s += ce[x] > 0.75 ? '#' : ce[x] > 0.5 ? '+' : ce[x] > 0.3 ? '.' : ' ';
console.log('  ' + s);
console.log('=== 横のエッジが強い行（= 横線・机の列・黒板の上下） ===');
re.forEach((v, y) => {
  if (v > 0.3) console.log(`  y=${String(y).padStart(3)} (${String(Math.round((y / H) * 100)).padStart(3)}%)  ${'#'.repeat(Math.round(v * 40))} ${v.toFixed(2)}`);
});

/* 大きな長方形（同色のかたまり）を探す：8x8 ブロックのラベル安定度 */
console.log('\n=== 均質な帯（行方向に色が続いているところ） ===');
for (let r = 0; r < CR; r++) {
  let line = '';
  for (let c = 0; c < CC; c++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = Math.floor((r * H) / CR); y < Math.floor(((r + 1) * H) / CR); y++) {
      for (let x = Math.floor((c * W) / CC); x < Math.floor(((c + 1) * W) / CC); x++) {
        const p = px(x, y); R += p[0]; G += p[1]; B += p[2]; n++;
      }
    }
    line += code(R / n, G / n, B / n);
  }
  const runs = line.match(/(.)\1{5,}/g) || [];
  if (runs.length) console.log(`  ${String(Math.round((r / CR) * 100)).padStart(3)}%: ${runs.map((x) => `${x[0]}×${x.length}`).join('  ')}`);
}
