import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildClassroom, ROOM } from './world/classroom.js';
import { loadRyoma, SHADOW_LAYER } from './character/ryoma.js';
import { Player } from './player.js';
import { DialogueSystem } from './dialogue/dialogue.js';
import { sfx } from './audio/sfx.js';

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd8f5);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);
const BASE_FOV = 62, TALK_FOV = 42; // conversation = bust shot so the face detail is actually visible

// ---------------------------------------------------------------------------
// lights
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x8c8578, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.position.set(-9, 7.5, -1.5);
sun.target.position.set(1.5, 0, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.layers.enable(SHADOW_LAYER);
scene.add(sun, sun.target);
const ceilingLights = [];
for (const z of [-2.6, 0, 2.6]) {
  const p = new THREE.PointLight(0xfff4e6, 9, 0, 2);
  p.position.set(0, 2.72, z);
  scene.add(p);
  ceilingLights.push(p);
}
// soft top light on the character for a contact shadow under him
const keySpot = new THREE.SpotLight(0xfff6ea, 14, 9, Math.PI / 5, 0.7, 1.6);
keySpot.position.set(0.6, 2.85, -1.6);
keySpot.castShadow = true;
keySpot.shadow.mapSize.set(1024, 1024);
keySpot.shadow.bias = -0.0003;
keySpot.shadow.normalBias = 0.02;
keySpot.shadow.camera.near = 0.5; keySpot.shadow.camera.far = 6;
keySpot.shadow.camera.layers.enable(SHADOW_LAYER);
scene.add(keySpot, keySpot.target);

// ---------------------------------------------------------------------------
// world
// ---------------------------------------------------------------------------
const world = buildClassroom(scene);

const player = new Player(camera, canvas, {
  colliders: world.colliders,
  bounds: { minX: -ROOM.W / 2 + 0.1, maxX: ROOM.W / 2 - 0.1, minZ: -ROOM.D / 2 + 0.1, maxZ: ROOM.D / 2 - 0.1 },
});

// ---------------------------------------------------------------------------
// UI refs
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const startEl = $('start'), enterBtn = $('enter'), bar = $('bar'), progressLabel = $('progressLabel');
const promptEl = $('prompt'), counterEl = $('counter'), countEl = $('count'), settingsEl = $('settings');
let honCount = Number(localStorage.getItem('ryoma.hon') || 0);
countEl.textContent = honCount;

// ---------------------------------------------------------------------------
// character
// ---------------------------------------------------------------------------
let ryoma = null;
let dialogue = null;
const RYOMA_POS = new THREE.Vector3(-0.35, 0, -2.55);
const state = { noticed: false, awayTimer: 0, talkAssist: 0, fov: BASE_FOV, started: false };

const progress = { full: 0, lod: 0 };
loadRyoma({
  onProgress: (url, v) => {
    if (url.includes('lod')) progress.lod = v; else progress.full = v;
    const p = Math.min(1, progress.full * 0.9 + progress.lod * 0.1);
    bar.style.width = `${(p * 100).toFixed(0)}%`;
    progressLabel.textContent = p < 1 ? `両馬を召喚中… ${(p * 100).toFixed(0)}%` : 'リグを生成中…';
  },
}).then((r) => {
  ryoma = r;
  r.object.position.copy(RYOMA_POS);
  r.object.rotation.y = 0.15; // facing +z (towards the door), a touch to the side
  r.animator.bodyYaw = r.animator.targetBodyYaw = 0.15;
  scene.add(r.object);
  keySpot.target.position.copy(RYOMA_POS);
  player.extraColliders.push({ x: RYOMA_POS.x, z: RYOMA_POS.z, r: 0.42 });

  dialogue = new DialogueSystem({
    character: r,
    camera,
    onStart: () => { player.enabled = false; state.talkAssist = 1.0; },
    onEnd: () => { player.enabled = true; },
    onHonshitsu: (n) => {
      honCount += n;
      countEl.textContent = honCount;
      localStorage.setItem('ryoma.hon', honCount);
      counterEl.classList.remove('pop'); void counterEl.offsetWidth; counterEl.classList.add('pop');
      setTimeout(() => counterEl.classList.remove('pop'), 400);
    },
  });

  bar.style.width = '100%';
  progressLabel.textContent = '準備完了';
  enterBtn.disabled = false;
  enterBtn.textContent = '教室に入る';
}).catch((e) => {
  console.error(e);
  progressLabel.textContent = '読み込みに失敗しました: ' + e.message;
});

// ---------------------------------------------------------------------------
// input / UI wiring
// ---------------------------------------------------------------------------
function enter() {
  if (!ryoma) return;
  startEl.classList.add('hidden');
  sfx.ensure();
  sfx.startAmbience();
  if (!state.started) { sfx.chime(0.35); state.started = true; }
  if (!document.body.classList.contains('touch')) player.lock();
}
enterBtn.addEventListener('click', enter);
canvas.addEventListener('click', () => {
  if (!state.started) return;
  if (!player.locked && !document.body.classList.contains('touch')) player.lock();
  else if (dialogue?.active) dialogue.advance();
});
$('talkBtn').addEventListener('click', () => interact('e'));
document.addEventListener('pointerlockchange', () => {
  if (!player.locked && state.started && !document.body.classList.contains('touch')) {
    // Esc: end the conversation and show the overlay hint
    if (dialogue?.active) dialogue.end();
  }
});

let nearTarget = false; // player can talk right now
function interact(key) {
  if (!ryoma || !dialogue) return;
  if (key === 'e') {
    if (dialogue.active) dialogue.advance();
    else if (nearTarget) dialogue.start();
    return;
  }
  if (typeof key === 'number' && dialogue.active) dialogue.choose(key - 1);
}
player.onInteract = interact;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); settingsEl.classList.toggle('show'); if (settingsEl.classList.contains('show')) document.exitPointerLock?.(); }
});
$('quality').addEventListener('change', (e) => {
  const high = e.target.value === 'high';
  ryoma?.setQuality(high);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.0));
});
$('shadows').addEventListener('change', (e) => {
  const v = e.target.value;
  renderer.shadowMap.enabled = v !== 'off';
  const size = v === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
});
$('sens').addEventListener('input', (e) => { player.sensitivity = 0.0022 * Number(e.target.value); });
$('vol').addEventListener('input', (e) => sfx.setVolume(Number(e.target.value)));
$('resetProgress').addEventListener('click', () => {
  localStorage.removeItem('ryoma.flags'); localStorage.removeItem('ryoma.seen'); localStorage.removeItem('ryoma.hon');
  honCount = 0; countEl.textContent = 0;
  if (dialogue) { dialogue.flags = {}; dialogue.seen = []; }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const debug = { paused: new URLSearchParams(location.search).has('debug') };
const _dir = new THREE.Vector3(), _toR = new THREE.Vector3(), _head = new THREE.Vector3(), _eye = new THREE.Vector3();

function tick() {
  requestAnimationFrame(tick);
  const dt = debug.paused ? 0 : Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  player.update(dt);
  world.acFan.rotation.x += dt * 14;
  // very subtle flicker on fluorescent panels
  const flick = 1.6 + Math.sin(t * 37) * 0.03 + Math.sin(t * 61.3) * 0.02;
  world.fixtures[0].material.emissiveIntensity = flick;

  if (ryoma) {
    _eye.copy(camera.position);
    _toR.copy(RYOMA_POS).sub(_eye); _toR.y = 0;
    const dist = _toR.length();
    const yawToPlayer = Math.atan2(-_toR.x, -_toR.z); // body +Z must point at the player
    const anim = ryoma.animator;

    // --- awareness state machine ---
    if (dialogue?.active) {
      anim.turnThreshold = 14;
      anim.faceYaw(yawToPlayer);
      anim.setLookTarget(_eye, true);
      state.awayTimer = 0;
    } else if (dist < 6.5) {
      if (!state.noticed) { state.noticed = true; anim.playGesture('notice'); anim.setState('idle'); anim.nextShift = 1.2; ryoma.face.setExpression('surprised', { speed: 10 }); setTimeout(() => { if (state.noticed && !dialogue.active) ryoma.face.setExpression('smug', { speed: 3 }); }, 1400); }
      anim.turnThreshold = dist < 3 ? 28 : 50;
      anim.faceYaw(yawToPlayer);
      anim.setLookTarget(_eye, true);
      state.awayTimer = 0;
    } else {
      state.awayTimer += dt;
      if (state.noticed && state.awayTimer > 4) { state.noticed = false; anim.setState('phone'); ryoma.face.setExpression('bored', { speed: 2 }); }
      anim.setLookTarget(_eye, dist < 9 && state.noticed);
    }

    // --- idle fidgets (not while talking) ---
    state.fidgetTimer = (state.fidgetTimer ?? 6) - dt;
    if (state.fidgetTimer <= 0 && !dialogue?.active && !anim.isGesturing) {
      const pool = state.noticed ? ['glasses', 'pocketShrug', 'lookWindow', 'scratch', 'nodSlow', 'glasses'] : ['glasses', 'lookWindow', 'phoneLookNod'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick === 'phoneLookNod') { anim.playGesture('nodSlow'); }
      else anim.playGesture(pick);
      if (pick === 'glasses') ryoma.face.setExpression('smug', { speed: 4 });
      else if (pick === 'lookWindow') ryoma.face.setExpression('serious', { speed: 3 });
      state.fidgetTimer = 7 + Math.random() * 9;
    }
    // micro-expressions while reading the group chat (not noticed, not talking)
    state.microTimer = (state.microTimer ?? 4) - dt;
    if (state.microTimer <= 0 && !dialogue?.active && !state.noticed) {
      const pool = ['bored', 'bored', 'smug', 'think', 'neutral', 'annoyed'];
      ryoma.face.setExpression(pool[Math.floor(Math.random() * pool.length)], { speed: 2.5 });
      state.microTimer = 4 + Math.random() * 6;
    }

    // --- interaction prompt: close + looking at him ---
    camera.getWorldDirection(_dir);
    _toR.normalize();
    const facing = _dir.x * _toR.x + _dir.z * _toR.z;
    nearTarget = !dialogue?.active && dist < 2.7 && facing > 0.55;
    promptEl.classList.toggle('show', nearTarget && (player.locked || document.body.classList.contains('touch')));
    document.body.classList.toggle('talking', !!dialogue?.active); // hides the crosshair (it sat on his forehead like a wart)

    // --- conversation camera assist + FOV ---
    if (dialogue?.active) {
      ryoma.getHead(_head);
      _head.y -= 0.10; // frame the face in the upper third (bubble above, shoulders below)
      if (state.talkAssist > 0) { player.lookAt(_head, dt, 5); state.talkAssist -= dt / 0.9; }
    }
    const targetFov = dialogue?.active ? TALK_FOV : BASE_FOV;
    state.fov += (targetFov - state.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - state.fov) > 0.01) { camera.fov = state.fov; camera.updateProjectionMatrix(); }

    ryoma.update(dt, _eye);
    dialogue?.update();
  }

  renderer.render(scene, camera);
}
tick();

// expose for debugging / screenshots (?debug=1 pauses the clock; __app.step(sec) advances deterministically)
window.__app = {
  scene, camera, renderer, player, state, debug,
  get ryoma() { return ryoma; }, get dialogue() { return dialogue; },
  step(seconds, fps = 60) {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) { ryoma?.update(1 / fps, camera.position); }
  },
};
