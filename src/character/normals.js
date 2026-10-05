import * as THREE from 'three';

/**
 * Recomputes smooth, area-weighted vertex normals for an indexed geometry,
 * merging vertices that share a position (UV-seam duplicates) so no hard
 * seams appear. Replaces the (8-bit quantised) NORMAL attribute of the
 * meshopt-compressed GLB with full-precision normals — 8-bit normals produce
 * visible faceting / grain on large smooth surfaces such as the face.
 */
export function computeSmoothNormals(geometry, { iterations = 0 } = {}) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const n = pos.count;
  const p = pos.array;
  if (!index) { geometry.computeVertexNormals(); return; }
  const idx = index.array;

  // --- weld by position (hash of quantised coords) ---
  const Q = 1e5;
  const size = 1 << Math.ceil(Math.log2(n * 2));
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const next = new Int32Array(n).fill(-1);
  const rep = new Int32Array(n); // representative vertex per position
  for (let i = 0; i < n; i++) {
    const x = Math.round(p[i * 3] * Q), y = Math.round(p[i * 3 + 1] * Q), z = Math.round(p[i * 3 + 2] * Q);
    let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    h = (h >>> 0) & mask;
    let j = table[h], found = -1;
    while (j !== -1) {
      if (Math.round(p[j * 3] * Q) === x && Math.round(p[j * 3 + 1] * Q) === y && Math.round(p[j * 3 + 2] * Q) === z) { found = j; break; }
      j = next[j];
    }
    if (found === -1) { next[i] = table[h]; table[h] = i; rep[i] = i; } else rep[i] = found;
  }

  // --- accumulate face normals (area weighted) on the representatives ---
  const acc = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az;
    const e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    let v = rep[a] * 3; acc[v] += nx; acc[v + 1] += ny; acc[v + 2] += nz;
    v = rep[b] * 3; acc[v] += nx; acc[v + 1] += ny; acc[v + 2] += nz;
    v = rep[c] * 3; acc[v] += nx; acc[v + 1] += ny; acc[v + 2] += nz;
  }

  // normalise onto the representatives
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i) continue;
    const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
    acc[i * 3] /= l; acc[i * 3 + 1] /= l; acc[i * 3 + 2] /= l;
  }

  // --- optional normal smoothing: average with the 1-ring neighbourhood ---
  // (does not move vertices, so silhouettes are unchanged; hides the ~mm scale
  //  surface grain of photogrammetry / AI-generated meshes under hard light)
  let cur = acc;
  if (iterations > 0) {
    const edgesA = new Int32Array(idx.length), edgesB = new Int32Array(idx.length);
    let ne = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
      edgesA[ne] = a; edgesB[ne++] = b; edgesA[ne] = b; edgesB[ne++] = c; edgesA[ne] = c; edgesB[ne++] = a;
    }
    let nxt = new Float32Array(n * 3);
    for (let it = 0; it < iterations; it++) {
      nxt.set(cur); // self weight 1
      for (let e = 0; e < ne; e++) {
        const a = edgesA[e] * 3, b = edgesB[e] * 3;
        nxt[a] += cur[b]; nxt[a + 1] += cur[b + 1]; nxt[a + 2] += cur[b + 2];
        nxt[b] += cur[a]; nxt[b + 1] += cur[a + 1]; nxt[b + 2] += cur[a + 2];
      }
      for (let i = 0; i < n; i++) {
        if (rep[i] !== i) continue;
        const l = Math.hypot(nxt[i * 3], nxt[i * 3 + 1], nxt[i * 3 + 2]) || 1;
        nxt[i * 3] /= l; nxt[i * 3 + 1] /= l; nxt[i * 3 + 2] /= l;
      }
      const tmp = cur; cur = nxt; nxt = tmp;
    }
  }

  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rep[i] * 3;
    out[i * 3] = cur[r]; out[i * 3 + 1] = cur[r + 1]; out[i * 3 + 2] = cur[r + 2];
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
