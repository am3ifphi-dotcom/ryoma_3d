import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
const { width: W, height: H, data } = jpeg.decode(readFileSync('scripts/ref.jpg'), { useTArray: true, formatAsRGBA: true });
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i+1], data[i+2]]; };
const hex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const C = 16, R = 10;
console.log(`=== 16×10 の平均色（上が0%） ===`);
for (let r = 0; r < R; r++) {
  let line = String(Math.round((r / R) * 100)).padStart(3) + '%';
  for (let c = 0; c < C; c++) {
    let A = [0,0,0], n = 0;
    for (let y = Math.floor((r*H)/R); y < Math.floor(((r+1)*H)/R); y++)
      for (let x = Math.floor((c*W)/C); x < Math.floor(((c+1)*W)/C); x++) { const p = px(x,y); A[0]+=p[0];A[1]+=p[1];A[2]+=p[2];n++; }
    line += ' ' + hex(A.map((v) => v / n));
  }
  console.log(line);
}
