#!/usr/bin/env python3
"""Pads the UV islands of the Ryoma GLB textures (public/models/ryoma.glb).

Tripo packs the atlas as hundreds of tightly packed islands and fills the gaps
with a hair-coloured noise. With mipmapping / bilinear filtering that fill bleeds
into the islands along every UV seam, which shows up as dark dotted lines and
grain on the face, neck and hands. This script

  1. rasterises every triangle in UV space to get the island coverage mask,
  2. erodes the mask by 1 texel (the outermost ring is already contaminated),
  3. fills every non-covered texel with the colour of the nearest covered texel
     (full-image Euclidean distance transform), for the base-colour,
     metallic-roughness and normal maps,
  4. rewrites the GLB with the new images (all other buffer views untouched).

usage: git show 947cdc8:tripo_pbr_model_027619a0-6088-43a9-a361-f4bf67271416_meshopt.glb > .tmp/ryoma_orig.glb
       node scripts/dump-uv.mjs && python3 scripts/pad-textures.py
"""
import io, json, struct, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = '.tmp/ryoma_orig.glb'  # pristine Tripo export (kept out of git)
DST = 'public/models/ryoma.glb'

t0 = time.time()
f = open(SRC, 'rb').read()
jl = struct.unpack_from('<I', f, 12)[0]
j = json.loads(f[20:20 + jl])
bin_ = f[20 + jl + 8:]

uv = np.fromfile('.tmp/uv.f32', dtype=np.float32).reshape(-1, 2)
idx = np.fromfile('.tmp/idx.u32', dtype=np.uint32).reshape(-1, 3)
N = 4096
mask = Image.new('L', (N, N), 0)
d = ImageDraw.Draw(mask)
for row in (uv * N)[idx].reshape(-1, 6):
    d.polygon([(row[0], row[1]), (row[2], row[3]), (row[4], row[5])], fill=255, outline=255)
cover = np.array(mask) > 0
print(f'coverage {cover.mean():.3f}  ({time.time()-t0:.1f}s)')
core = ndimage.binary_erosion(cover, iterations=1, border_value=0)
# nearest covered texel for every texel
_, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
print(f'edt done ({time.time()-t0:.1f}s)')

new_images = []
for k, im in enumerate(j['images']):
    bv = j['bufferViews'][im['bufferView']]
    off = bv.get('byteOffset', 0)
    src = Image.open(io.BytesIO(bin_[off:off + bv['byteLength']]))
    mode = src.mode
    arr = np.array(src.convert('RGB') if mode != 'RGBA' else src)
    padded = arr[iy, ix]
    if k == 1:
        # metallic-roughness: the skin is painted quite glossy (roughness ≈ 0.25 on the nose,
        # 0.5 on the cheeks) which makes every mm of mesh grain and texture seam sparkle under
        # the classroom lights. Floor the roughness at 0.6, soften the blotchy map a little and
        # zero the (noise-only) metallic channel.
        g = ndimage.gaussian_filter(padded[..., 1].astype(np.float32), 2.0)
        padded = padded.copy()
        padded[..., 1] = np.clip(153 + g * 0.4, 0, 255).astype(np.uint8)
        padded[..., 2] = 0
    out = io.BytesIO()
    if im['mimeType'] == 'image/png':
        Image.fromarray(padded).save(out, format='PNG', optimize=False, compress_level=6)
    else:
        Image.fromarray(padded).save(out, format='JPEG', quality=94, subsampling=0)
    new_images.append(out.getvalue())
    print(f'image {k} {im["mimeType"]} {bv["byteLength"]} -> {len(new_images[-1])} bytes ({time.time()-t0:.1f}s)')

# --- rebuild the binary chunk: copy every buffer view, replacing the image ones ---
img_bv = {im['bufferView']: n for n, im in enumerate(j['images'])}
chunks = []
cursor = 0
for i, bv in enumerate(j['bufferViews']):
    if 'extensions' in bv and 'EXT_meshopt_compression' in bv['extensions']:
        ext = bv['extensions']['EXT_meshopt_compression']
        data = bin_[ext.get('byteOffset', 0):ext.get('byteOffset', 0) + ext['byteLength']]
        pad = (-len(data)) % 4
        ext['byteOffset'] = cursor
        chunks.append(data + b'\0' * pad)
        cursor += len(data) + pad
        # bv.buffer / bv.byteOffset reference the (data-less) fallback buffer 1 – unchanged
    else:
        off = bv.get('byteOffset', 0)
        data = new_images[img_bv[i]] if i in img_bv else bin_[off:off + bv['byteLength']]
        pad = (-len(data)) % 4
        bv['byteOffset'] = cursor
        bv['byteLength'] = len(data)
        chunks.append(data + b'\0' * pad)
        cursor += len(data) + pad
binout = b''.join(chunks)
j['buffers'][0]['byteLength'] = len(binout)
js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binout))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js
glb += struct.pack('<II', len(binout), 0x004E4942) + binout
open(DST, 'wb').write(glb)
print(f'wrote {DST} {len(glb)/1e6:.1f} MB ({time.time()-t0:.1f}s)')
