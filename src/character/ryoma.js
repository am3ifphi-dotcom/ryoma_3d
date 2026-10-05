// Loads the Tripo GLB, auto-rigs it, and wires up the animator + props.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { applySkinWeights, buildSkeleton } from './rig.js';
import { computeSmoothNormals } from './normals.js';
import { CharacterAnimator } from './animator.js';
import { Face, loadFacePatches } from './face.js';

const MODEL_HEIGHT = 0.9795; // raw model height (y extent)
const TARGET_HEIGHT = 1.73; // metres
export const SCALE = TARGET_HEIGHT / MODEL_HEIGHT;

export const SHADOW_LAYER = 1; // shadow-only proxy lives here

function makeEmoteTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // bubble
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 10;
  const r = 88;
  g.beginPath();
  g.arc(128, 112, r, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(104, 190); g.lineTo(128, 240); g.lineTo(150, 188);
  g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.moveTo(100, 184); g.lineTo(128, 242); g.lineTo(156, 184); g.strokeStyle = '#1a1a1a'; g.stroke();
  g.fillStyle = '#fff'; g.fillRect(104, 176, 48, 16);
  // glyph
  g.fillStyle = text === '✝' ? '#b8860b' : '#1a1a1a';
  g.font = `bold ${text === '✝' ? 150 : 128}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, text === '…' ? 86 : 116);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePhoneScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8fb9e8'; g.fillRect(0, 0, 256, 512);
  // status bar
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 256, 34);
  g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left'; g.fillText('16:42', 12, 24);
  g.textAlign = 'center'; g.font = 'bold 22px "Hiragino Sans","Noto Sans JP",sans-serif'; g.fillText('理数科B組(7)', 128, 25);
  const msgs = [
    ['両馬', 'いま道歩いてたらすごい✝本質✝が降りてきた', false],
    ['三重', 'は？', true],
    ['両馬', '今日の電線✝本質✝感ある', false],
    ['三重', '日本語やめろ', true],
    ['砂糖', 'コーンスープまだ無い', true],
    ['両馬', 'それまじ✝本質✝', false],
  ];
  let y = 54;
  g.font = '15px "Hiragino Sans","Noto Sans JP",sans-serif';
  for (const [who, text, other] of msgs) {
    const w = Math.min(190, g.measureText(text).width + 22);
    const x = other ? 14 : 256 - 14 - w;
    g.fillStyle = other ? '#ffffff' : '#8de36b';
    g.beginPath(); g.roundRect(x, y, w, 46, 12); g.fill();
    g.fillStyle = '#222'; g.textAlign = 'left';
    g.fillText(who, x + 10, y + 16);
    g.font = '13px "Hiragino Sans","Noto Sans JP",sans-serif';
    g.fillText(text.length > 15 ? text.slice(0, 15) + '…' : text, x + 10, y + 36);
    g.font = '15px "Hiragino Sans","Noto Sans JP",sans-serif';
    y += 58;
  }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 468, 256, 44);
  g.fillStyle = '#999'; g.font = '14px sans-serif'; g.textAlign = 'left'; g.fillText('メッセージを入力  ✝', 14, 495);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function loadRyoma({ onProgress } = {}) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const load = (url, weight) => new Promise((res, rej) => loader.load(url, res, (e) => onProgress?.(url, e.loaded / (e.total || 17_200_000) * weight), rej));
  const [full, lod, facePatches] = await Promise.all([load('models/ryoma.glb', 1), load('models/ryoma_lod.glb', 1), loadFacePatches('models/ryoma_face.bin')]);

  let fullMesh, lodMesh;
  full.scene.traverse((o) => { if (o.isMesh) fullMesh = o; });
  lod.scene.traverse((o) => { if (o.isMesh) lodMesh = o; });

  const material = fullMesh.material;
  material.roughness = 1.0;
  material.metalness = 1.0; // ORM texture drives both
  material.envMapIntensity = 0.6;
  material.normalScale.set(0.5, 0.5); // the generated normal map carries artefacts; the 1.9M-tri mesh has the real detail
  for (const t of [material.map, material.normalMap, material.roughnessMap]) if (t) t.anisotropy = 16;

  // Full-precision, slightly smoothed normals: the GLB stores 8-bit normals and the
  // AI-generated surface has mm-scale grain that hard light turns into a rough,
  // "low-res" look. Smoothing the normals (not the vertices) hides the grain while
  // keeping every silhouette and feature.
  const tn = performance.now();
  computeSmoothNormals(fullMesh.geometry, { iterations: 3 });
  computeSmoothNormals(lodMesh.geometry, { iterations: 1 });
  console.info(`[ryoma] normals recomputed in ${(performance.now() - tn).toFixed(0)} ms`);

  // --- rig -----------------------------------------------------------------
  const t0 = performance.now();
  applySkinWeights(fullMesh.geometry);
  applySkinWeights(lodMesh.geometry);
  const { root: rootBone, bones, skeleton } = buildSkeleton();
  console.info(`[ryoma] skin weights computed in ${(performance.now() - t0).toFixed(0)} ms`);

  const outer = new THREE.Group(); // world placement + yaw
  outer.name = 'ryoma';
  const model = new THREE.Group(); // model-space frame: rotate +X(face) → +Z, scale to metres
  model.rotation.y = -Math.PI / 2;
  model.scale.setScalar(SCALE);
  model.position.y = (MODEL_HEIGHT / 2) * SCALE; // feet on the floor
  outer.add(model);

  const skinnedFull = new THREE.SkinnedMesh(fullMesh.geometry, material);
  skinnedFull.name = 'ryoma_full';
  skinnedFull.frustumCulled = false;
  skinnedFull.castShadow = false; // the LOD proxy casts the shadow
  skinnedFull.receiveShadow = true;

  const skinnedLod = new THREE.SkinnedMesh(lodMesh.geometry, material);
  skinnedLod.name = 'ryoma_lod';
  skinnedLod.frustumCulled = false;
  skinnedLod.castShadow = true;
  skinnedLod.receiveShadow = true;

  model.add(rootBone);
  model.add(skinnedFull);
  model.add(skinnedLod);
  model.updateMatrixWorld(true);
  skinnedFull.bind(skeleton);
  skinnedLod.bind(skeleton);

  // --- face (eyelids / brows / mouth overlays) -----------------------------------
  const face = new Face({ patches: facePatches, skeleton, parent: model, baseMaterial: material });
  face.setExpression('bored', { speed: 50 }); // he is on his phone when the player arrives

  // --- props -------------------------------------------------------------------
  const phone = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.072, 0.15, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.35, metalness: 0.6 })
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.064, 0.138),
    new THREE.MeshStandardMaterial({ map: makePhoneScreenTexture(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.2 })
  );
  screen.material.emissiveMap = screen.material.map;
  screen.material.emissiveIntensity = 0.9;
  screen.position.z = 0.0045;
  phone.add(body, screen);
  // in the left hand (model space units: divide by SCALE since the bone frame is model-space)
  phone.scale.setScalar(1 / SCALE);
  phone.position.set(0.02, -0.05, 0.012);
  phone.rotation.set(0, Math.PI / 2 + 0.25, -0.35, 'YXZ');
  bones.handL.add(phone);

  // --- emote sprite ---------------------------------------------------------------
  const emoteTextures = {};
  const emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: true, depthWrite: false }));
  emote.scale.set(0, 0, 1);
  emote.position.set(0, 0.27, 0.0); // above the head (model space, relative to head bone)
  emote.renderOrder = 10;
  bones.head.add(emote);
  let emoteT = -1;

  const animator = new CharacterAnimator({ bones, root: outer, model });
  animator.onEmote = (kind) => showEmote(kind);
  animator.face = face;

  function showEmote(kind) {
    if (!emoteTextures[kind]) emoteTextures[kind] = makeEmoteTexture(kind);
    emote.material.map = emoteTextures[kind];
    emote.material.needsUpdate = true;
    emoteT = 0;
  }

  const headWorld = new THREE.Vector3();

  const api = {
    object: outer,
    model,
    bones,
    skeleton,
    animator,
    face,
    phone,
    showEmote,
    /** world position of the top of the head (for the speech bubble) */
    getHeadTop(out = new THREE.Vector3()) {
      bones.headTop.getWorldPosition(out);
      return out;
    },
    getHead(out = headWorld) { bones.head.getWorldPosition(out); return out; },
    setQuality(high) {
      skinnedFull.visible = high;
      face.setLowQuality(!high);
      // in low mode the LOD is also the visible mesh; keep it on the default layer
      skinnedLod.layers.set(high ? SHADOW_LAYER : 0);
      if (!high) skinnedLod.layers.enable(SHADOW_LAYER);
    },
    update(dt, playerPos) {
      animator.update(dt, playerPos);
      face.update(dt);
      // emote pop
      if (emoteT >= 0) {
        emoteT += dt;
        const life = 1.5;
        let s;
        if (emoteT < 0.25) { const u = emoteT / 0.25; s = 0.17 * (1 + 0.35 * Math.sin(u * Math.PI)) * u; }
        else if (emoteT < life - 0.3) s = 0.17 + 0.006 * Math.sin(emoteT * 6);
        else s = 0.17 * Math.max(0, (life - emoteT) / 0.3);
        emote.scale.set(s, s, 1);
        emote.position.y = 0.27 + Math.min(0.02, emoteT * 0.04);
        if (emoteT > life) { emoteT = -1; emote.scale.set(0, 0, 1); }
      }
    },
  };
  api.setQuality(true);
  return api;
}
