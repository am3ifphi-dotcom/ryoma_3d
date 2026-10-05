// Facial expressions for a model that has no blend shapes and scattered face UVs.
//
// Strategy: small overlay patches (triangles copied from the face by scripts/make-face.mjs)
// are skinned to the same skeleton and pushed ~0.5 mm out along their normals. Their
// materials draw the features procedurally in model space (pre-skinning coordinates):
//   • eyelids  – skin-coloured lid that slides down over the eye opening (blink / half-closed /
//                happy "^ ^" arc) with a lash line
//   • eyebrows – a skin "cover" hides the painted brows while a textured copy of the
//                brow triangles is translated / tilted by the vertex shader
//   • mouth    – a skin cover with a procedural mouth (smile curve, opening with teeth)
//
// Model-space facts (character faces +X, +Z = his right):
//   eye opening centre y 0.4085, z ±0.021, half-width 0.0105, half-height 0.0022
//   brow centre line  y = 0.4100 + 0.29·|z|,  |z| 0.009…0.036
//   mouth             y 0.3715, half-width 0.0125
import * as THREE from 'three';
import { applySkinWeights } from './rig.js';

const SKIN = new THREE.Color().setRGB(0.86, 0.69, 0.57, THREE.SRGBColorSpace); // measured around the mouth/brows

// ---------------------------------------------------------------------------
// patch file
// ---------------------------------------------------------------------------
export async function loadFacePatches(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = 4 + hlen;
  const out = {};
  for (const [name, p] of Object.entries(header.patches)) {
    const f32 = (e) => new Float32Array(buf, base + e.off, e.len);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f32(p.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f32(p.nrm), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(f32(p.uv), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, base + p.idx.off, p.idx.len), 1));
    applySkinWeights(g);
    out[name] = g;
  }
  return out;
}

// ---------------------------------------------------------------------------
// shader helpers
// ---------------------------------------------------------------------------
const VERT_COMMON = /* glsl */ `
  varying vec3 vModelPos;
  uniform float uOffset;
`;
function injectVertex(shader, extraDecl = '', extraTransform = '') {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_COMMON}\n${extraDecl}`)
    .replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position);\n vModelPos = position;\n ${extraTransform}\n transformed += objectNormal * uOffset;`
    );
}
function injectFragment(shader, decl, beforeColor, afterColor = '') {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n varying vec3 vModelPos;\n${decl}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${beforeColor}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${afterColor}`);
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------
function makeLidMaterial(side) {
  const cz = 0.021 * side;
  const u = {
    uOffset: { value: 0.0006 },
    uClose: { value: 0 }, // 0 open … 1 closed (upper lid)
    uHappy: { value: 0 }, // 0 … 1 : closed-arc "^" shape
    uSquint: { value: 0 }, // lower lid raise
  };
  const m = new THREE.MeshStandardMaterial({ color: SKIN.clone(), roughness: 0.75, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    injectVertex(shader);
    injectFragment(
      shader,
      /* glsl */ `
        uniform float uClose, uHappy, uSquint;
        const float CY = 0.4085, CZ = ${cz.toFixed(4)}, HW = 0.0105, HH = 0.0022;
        float lidAlpha; float lashMix; float shadeMix;
      `,
      /* glsl */ `
        {
          float y = vModelPos.y;
          float t = (vModelPos.z - CZ) / HW;
          float t2 = clamp(t * t, 0.0, 1.0);
          float arc = sqrt(1.0 - t2);
          float yUp = CY + HH * arc;                 // eye opening top edge
          float yLo = CY - HH * arc;                 // bottom edge
          float cap = yUp + 0.0015;                  // lid never drawn above this (frame bar / brow live there)
          float lidLin = mix(yUp + 0.0003, yLo - 0.0005, uClose);   // descending upper lid
          float lidArc = CY + HH * (1.0 - t2 * 1.6) * 0.95;          // "^ ^" happy line
          float lid = mix(lidLin, lidArc, uHappy);
          float w = fwidth(y) + 0.00005;
          float above = smoothstep(lid - w, lid + w, y);
          float below = 1.0 - smoothstep(cap - w, cap + w, y);
          float cover = above * below;
          float whole = smoothstep(yLo - 0.0008 - w, yLo - 0.0008 + w, y) * below;
          cover = max(cover, whole * uHappy);
          float low = yLo + uSquint * HH * 1.6;      // raised lower lid (squint)
          float aLo = (1.0 - smoothstep(low - w, low + w, y)) * smoothstep(yLo - 0.001 - w, yLo - 0.001 + w, y);
          cover = max(cover, aLo * step(0.001, uSquint));
          float side = smoothstep(1.3, 1.0, abs(t));
          lidAlpha = cover * side;
          if (lidAlpha < 0.004) discard;
          float dLash = abs(y - lid);
          lashMix = (1.0 - smoothstep(0.0003, 0.0009, dLash)) * smoothstep(0.02, 0.12, max(uClose, uHappy));
          float dLow = low - y;
          lashMix = max(lashMix, (1.0 - smoothstep(0.0001, 0.0006, dLow)) * step(0.0, dLow) * uSquint * 0.7);
          shadeMix = (1.0 - smoothstep(0.0008, 0.003, y - lid)) * step(lid, y) * uClose * 0.45;
        }
      `,
      /* glsl */ `
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.78, shadeMix);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.08, 0.07), lashMix);
        diffuseColor.a *= lidAlpha;
      `
    );
  };
  m.userData.uniforms = u;
  return m;
}

function makeBrowCoverMaterial(side) {
  const u = { uOffset: { value: 0.0004 }, uShow: { value: 1 } };
  const m = new THREE.MeshStandardMaterial({ color: SKIN.clone(), roughness: 0.75, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    injectVertex(shader);
    injectFragment(
      shader,
      /* glsl */ `uniform float uShow; float coverAlpha;`,
      /* glsl */ `
        {
          float az = abs(vModelPos.z);
          float cy = 0.4100 + 0.29 * az;
          float d = abs(vModelPos.y - cy);
          // soft edges: opaque within the brow band, fading to the patch border
          coverAlpha = (1.0 - smoothstep(0.0033, 0.0052, d)) * smoothstep(0.0075, 0.0105, az) * (1.0 - smoothstep(0.0325, 0.036, az));
          coverAlpha *= smoothstep(0.4112, 0.4125, vModelPos.y); // never below the glasses bar
          coverAlpha *= uShow;
          if (coverAlpha < 0.004) discard;
        }
      `,
      /* glsl */ `diffuseColor.a *= coverAlpha;`
    );
  };
  m.userData.uniforms = u;
  return m;
}

function makeBrowMaterial(baseMaterial, side) {
  const u = {
    uOffset: { value: 0.0009 },
    uRaise: { value: 0 }, // metres, + = up
    uTilt: { value: 0 }, // radians, + = inner end down (angry) for both sides
    uShow: { value: 1 },
  };
  const m = baseMaterial.clone();
  m.transparent = true; m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;
  const cz = 0.0215 * side;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    injectVertex(
      shader,
      /* glsl */ `uniform float uRaise, uTilt;`,
      /* glsl */ `
        {
          // tilt about the brow centre (y,z plane) then raise
          float cy = 0.4100 + 0.29 * ${Math.abs(cz).toFixed(4)};
          float cz = ${cz.toFixed(4)};
          float a = uTilt * ${side > 0 ? '1.0' : '-1.0'};
          float dy = transformed.y - cy, dz = transformed.z - cz;
          transformed.y = cy + dy * cos(a) - dz * sin(a) + uRaise;
          transformed.z = cz + dy * sin(a) + dz * cos(a);
          transformed.x += uRaise * 0.3; // the forehead slopes back; keep the brow on the surface
        }
      `
    );
    injectFragment(
      shader,
      /* glsl */ `uniform float uShow; float browAlpha;`,
      /* glsl */ `
        {
          float az = abs(vModelPos.z);
          float cy = 0.4100 + 0.29 * az;
          float d = abs(vModelPos.y - cy);
          browAlpha = (1.0 - smoothstep(0.0036, 0.0052, d)) * smoothstep(0.0075, 0.0105, az) * (1.0 - smoothstep(0.0325, 0.036, az));
          browAlpha *= smoothstep(0.4108, 0.4122, vModelPos.y);
          browAlpha *= uShow;
          if (browAlpha < 0.004) discard;
        }
      `,
      /* glsl */ `diffuseColor.a *= browAlpha;`
    );
  };
  m.userData.uniforms = u;
  return m;
}

function makeMouthMaterial(baseMaterial) {
  const u = {
    uOffset: { value: 0.0005 },
    uOpen: { value: 0 }, // 0 … 1
    uSmile: { value: 0 }, // -1 frown … +1 smile
    uWide: { value: 1 }, // width multiplier
    uShow: { value: 1 },
  };
  // textured copy of the mouth area (keeps the painted shading), mouth drawn on top
  const m = baseMaterial.clone();
  m.transparent = true; m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    injectVertex(shader);
    injectFragment(
      shader,
      /* glsl */ `
        uniform float uOpen, uSmile, uWide, uShow;
        const float MY = 0.3715, MW = 0.0125;
        float mAlpha; vec3 mColor; float mMix; float lipLineMix;
      `,
      /* glsl */ `
        {
          float y = vModelPos.y, z = vModelPos.z;
          float hw = MW * uWide;
          float t = clamp(z / hw, -1.0, 1.0);
          float shape = 1.0 - t * t;                    // 1 at centre, 0 at corners
          float lipLine = MY - uSmile * 0.0028 * shape + uSmile * 0.001; // corners up for a smile
          float openH = uOpen * 0.011 * pow(shape, 0.6);
          float upper = lipLine + openH * 0.35;
          float lower = lipLine - openH * 0.65;
          float w = fwidth(y) + 0.00004;
          float inside = smoothstep(lower - w, lower + w, y) * (1.0 - smoothstep(upper - w, upper + w, y)) * step(abs(z), hw);
          // cover alpha: opaque around the mouth, fading to the patch border
          float dz = max(0.0, abs(z) - hw);
          float dy = max(0.0, abs(y - MY) - 0.004);
          mAlpha = (1.0 - smoothstep(0.0, 0.0055, dz)) * (1.0 - smoothstep(0.0, 0.0045, dy)) * uShow;
          // nothing to draw while the mouth is relaxed → let the real mouth show
          mAlpha *= smoothstep(0.0, 0.05, max(uOpen, abs(uSmile)));
          if (mAlpha < 0.004) discard;
          // open mouth: cavity + teeth band under the upper lip
          vec3 cavity = vec3(0.22, 0.07, 0.07);
          vec3 teeth = vec3(0.92, 0.9, 0.86);
          float teethBand = smoothstep(upper - 0.0022, upper - 0.0006, y) * step(0.25, uOpen) * step(abs(z), hw * 0.75);
          mColor = mix(cavity, teeth, teethBand);
          mMix = inside;
          // closed lip line (thin, darker skin) with soft corners
          float dLine = abs(y - lipLine);
          float line = (1.0 - smoothstep(0.00025, 0.0007, dLine)) * (1.0 - uOpen * 0.8) * (1.0 - smoothstep(0.85, 1.0, abs(t)));
          float corner = (1.0 - smoothstep(0.0, 0.0015, length(vec2(dLine, max(0.0, abs(z) - hw * 0.92))))) * 0.6;
          lipLineMix = max(line, corner) * (1.0 - inside);
        }
      `,
      /* glsl */ `
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.3, 0.26), lipLineMix * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, mColor, mMix);
        diffuseColor.a *= mAlpha;
      `
    );
  };
  m.userData.uniforms = u;
  return m;
}

// ---------------------------------------------------------------------------
// expression presets  (raise in mm, tilt in deg; + tilt = inner end down = angry)
// ---------------------------------------------------------------------------
export const EXPRESSIONS = {
  neutral: { close: 0.08, happy: 0, squint: 0, browRaiseR: 0, browRaiseL: 0, browTiltR: 0, browTiltL: 0, smile: 0.05, open: 0 },
  smug: { close: 0.35, happy: 0, squint: 0.3, browRaiseR: 0.6, browRaiseL: -0.3, browTiltR: -4, browTiltL: 4, smile: 0.45, open: 0 },
  happy: { close: 0.1, happy: 0, squint: 0.45, browRaiseR: 1.2, browRaiseL: 1.2, browTiltR: -8, browTiltL: -8, smile: 0.9, open: 0.05 },
  grin: { close: 1, happy: 1, squint: 0, browRaiseR: 1.6, browRaiseL: 1.6, browTiltR: -10, browTiltL: -10, smile: 1, open: 0.1 },
  surprised: { close: 0, happy: 0, squint: 0, browRaiseR: 2.8, browRaiseL: 2.8, browTiltR: -6, browTiltL: -6, smile: -0.1, open: 0.45 },
  annoyed: { close: 0.4, happy: 0, squint: 0.2, browRaiseR: -0.8, browRaiseL: -0.8, browTiltR: 9, browTiltL: 9, smile: -0.35, open: 0 },
  angry: { close: 0.2, happy: 0, squint: 0.35, browRaiseR: -1.4, browRaiseL: -1.4, browTiltR: 14, browTiltL: 14, smile: -0.5, open: 0 },
  sad: { close: 0.45, happy: 0, squint: 0, browRaiseR: 1.0, browRaiseL: 1.0, browTiltR: -14, browTiltL: -14, smile: -0.6, open: 0 },
  think: { close: 0.3, happy: 0, squint: 0.15, browRaiseR: 1.6, browRaiseL: -0.6, browTiltR: -6, browTiltL: 6, smile: -0.1, open: 0 },
  bored: { close: 0.6, happy: 0, squint: 0.1, browRaiseR: 0, browRaiseL: 0, browTiltR: 0, browTiltL: 0, smile: -0.15, open: 0 },
  excited: { close: 0, happy: 0, squint: 0.2, browRaiseR: 2.2, browRaiseL: 2.2, browTiltR: -8, browTiltL: -8, smile: 0.8, open: 0.3 },
  serious: { close: 0.15, happy: 0, squint: 0.25, browRaiseR: -0.6, browRaiseL: -0.6, browTiltR: 6, browTiltL: 6, smile: -0.1, open: 0 },
  closed: { close: 1, happy: 0, squint: 0, browRaiseR: 0, browRaiseL: 0, browTiltR: 0, browTiltL: 0, smile: 0.1, open: 0 },
};

// kana → mouth opening for the lip-flap (vowel class)
const VOWEL_OPEN = { a: 0.85, i: 0.3, u: 0.4, e: 0.55, o: 0.7, n: 0.15 };
function vowelOf(ch) {
  const code = ch.charCodeAt(0);
  let k = ch;
  if (code >= 0x30a1 && code <= 0x30f6) k = String.fromCharCode(code - 0x60); // katakana → hiragana
  const rows = {
    a: 'あかさたなはまやらわがざだばぱぁゃ', i: 'いきしちにひみりぎじぢびぴぃ', u: 'うくすつぬふむゆるぐずづぶぷぅゅっ',
    e: 'えけせてねへめれげぜでべぺぇ', o: 'おこそとのほもよろをごぞどぼぽぉょ', n: 'ん',
  };
  for (const v in rows) if (rows[v].includes(k)) return v;
  if (/[a-zA-Z]/.test(k)) return 'aeiou'.includes(k.toLowerCase()) ? k.toLowerCase() : 'u';
  if (/[\u4e00-\u9fff]/.test(k)) return ['a', 'o', 'e', 'u', 'i'][code % 5]; // kanji: pseudo-random vowel
  return null; // punctuation → closed
}

// ---------------------------------------------------------------------------
export class Face {
  /**
   * @param {Object} opts
   * @param {Object<string,THREE.BufferGeometry>} opts.patches
   * @param {THREE.Skeleton} opts.skeleton
   * @param {THREE.Object3D} opts.parent     model-space group
   * @param {THREE.Material} opts.baseMaterial
   */
  constructor({ patches, skeleton, parent, baseMaterial }) {
    this.meshes = [];
    const mk = (geo, mat, order) => {
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.frustumCulled = false; sm.castShadow = false; sm.receiveShadow = true;
      sm.renderOrder = order;
      parent.add(sm);
      sm.bind(skeleton);
      this.meshes.push(sm);
      return sm;
    };
    this.lidR = mk(patches.eyeR, makeLidMaterial(1), 2);
    this.lidL = mk(patches.eyeL, makeLidMaterial(-1), 2);
    this.coverR = mk(patches.browR, makeBrowCoverMaterial(1), 1);
    this.coverL = mk(patches.browL, makeBrowCoverMaterial(-1), 1);
    this.browR = mk(patches.browR, makeBrowMaterial(baseMaterial, 1), 3);
    this.browL = mk(patches.browL, makeBrowMaterial(baseMaterial, -1), 3);
    this.mouth = mk(patches.mouth, makeMouthMaterial(baseMaterial), 1);

    this.cur = { ...EXPRESSIONS.neutral };
    this.target = { ...EXPRESSIONS.neutral };
    this.expression = 'neutral';
    this.blend = 6; // 1/s

    // blink
    this.blink = 0; this.blinkT = -1; this.nextBlink = 2 + Math.random() * 3; this.doubleBlink = false;
    // lip flap
    this.talkOpen = 0; this.talkTarget = 0; this.talkDecay = 0;
    this.time = 0;
    this.visible = true;
  }

  setExpression(name, { speed = 6 } = {}) {
    const e = EXPRESSIONS[name] || EXPRESSIONS.neutral;
    this.expression = name;
    this.blend = speed;
    Object.assign(this.target, e);
  }
  /** feed one typed character → mouth flap */
  speakChar(ch) {
    const v = vowelOf(ch);
    this.talkTarget = v ? VOWEL_OPEN[v] * (0.8 + Math.random() * 0.3) : 0.05;
    this.talkDecay = 0.16;
  }
  setVisible(b) { this.visible = b; for (const m of this.meshes) m.visible = b; }

  update(dt) {
    this.time += dt;
    const k = Math.min(1, dt * this.blend);
    for (const key in this.target) this.cur[key] += (this.target[key] - this.cur[key]) * k;

    // blink scheduler
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < 0.18;
      this.nextBlink = 2.2 + Math.random() * 4.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.11, o = 0.14; // close / open durations
      let b;
      if (this.blinkT < d) b = this.blinkT / d;
      else if (this.blinkT < d + o) b = 1 - (this.blinkT - d) / o;
      else { b = 0; if (this.doubleBlink) { this.doubleBlink = false; this.blinkT = 0; } else this.blinkT = -1; }
      this.blink = Math.max(0, Math.min(1, b));
    } else this.blink = 0;

    // lip flap
    this.talkDecay -= dt;
    if (this.talkDecay <= 0) this.talkTarget = 0;
    this.talkOpen += (this.talkTarget - this.talkOpen) * Math.min(1, dt * 22);

    const c = this.cur;
    const close = Math.max(c.close, this.blink * (1 - c.happy));
    const uR = this.lidR.material.userData.uniforms, uL = this.lidL.material.userData.uniforms;
    uR.uClose.value = uL.uClose.value = Math.max(close, c.happy);
    uR.uHappy.value = uL.uHappy.value = c.happy * (1 - this.blink);
    uR.uSquint.value = uL.uSquint.value = c.squint * (1 - this.blink);

    const bR = this.browR.material.userData.uniforms, bL = this.browL.material.userData.uniforms;
    const wob = 0.00015 * Math.sin(this.time * 1.3); // tiny life
    bR.uRaise.value = c.browRaiseR * 0.001 + wob;
    bL.uRaise.value = c.browRaiseL * 0.001 + wob;
    bR.uTilt.value = c.browTiltR * Math.PI / 180;
    bL.uTilt.value = c.browTiltL * Math.PI / 180;

    const mu = this.mouth.material.userData.uniforms;
    mu.uOpen.value = Math.max(c.open, this.talkOpen);
    mu.uSmile.value = c.smile;
    mu.uWide.value = 1 + 0.15 * Math.max(0, c.smile) - 0.1 * this.talkOpen;
  }
}
