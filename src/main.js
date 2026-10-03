import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildClassroom, buildLights } from './world/classroom.js';
import { Ryoma, CrossBurst, loadRyoma, prepareRig, normalizeModel } from './world/ryoma.js';
import { vendingTexture } from './world/textures.js';
import { Player, makeRooms } from './player/player.js';
import { Hud, MotionPanel, MOTIONS } from './ui/hud.js';
import { RyomaBrain } from './brain/engine.js';
import { ChatView } from './ui/chat.js';
import { BoardView } from './ui/board.js';
import { SYSTEM_PROMPT } from './data/profile.js';

/* ══════════════════════════════════════════════════════════
   設定
   ══════════════════════════════════════════════════════════ */
const STORE = 'ryoma3d.settings.v1';
const defaults = {
  voice: false, rate: 1.1, amb: false, flip: false, rig: true, steps: true,
  time: 'day', corn: true, cameo: true, lite: false,
  llm: false, endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini', key: '', prompt: SYSTEM_PROMPT,
};
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
const settings = Object.assign({}, defaults, load(STORE, {}));
function save() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* */ } }

/* 両馬の立ち位置（黒板の前・窓側の列のあたり） */
const RYOMA_POS = [1.0, 0, -3.65];

/* ══════════════════════════════════════════════════════════
   3D：教室
   ══════════════════════════════════════════════════════════ */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('loading').innerHTML =
    '<div class="load-inner"><div class="load-mark">✝</div><h1>WebGLが使えません</h1>' +
    '<p class="load-tip">このブラウザでは3Dを表示できません。会話だけでもしたかった……。</p></div>';
  throw err;
}
renderer.setSize(innerWidth, innerHeight, false);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.lite ? 1 : 1.75));
renderer.shadowMap.enabled = !settings.lite;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb6c4);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.06, 200);
camera.rotation.order = 'YXZ';
camera.position.set(1.0, 1.62, -1.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 1.05;
controls.maxDistance = 9;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.56;
controls.target.set(RYOMA_POS[0], 1.32, RYOMA_POS[2]);
controls.enabled = false;

const RYOMA_AT = new THREE.Vector3(...RYOMA_POS);

const classroom = buildClassroom({ cornSoup: settings.corn });
scene.add(classroom.group);
let lights = buildLights(scene, { quality: settings.lite ? 'low' : 'high', time: settings.time });

const particles = new CrossBurst(scene, 46);
const rooms = makeRooms(classroom.ROOM);

/* ── 光の中の埃 ── */
const dust = (() => {
  const N = 420;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = classroom.ROOM.xMax - 0.2 - Math.random() * 4.2;
    pos[i * 3 + 1] = 0.4 + Math.random() * 2.4;
    pos[i * 3 + 2] = classroom.ROOM.zMin + Math.random() * (classroom.ROOM.zMax - classroom.ROOM.zMin);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xfff2d6, size: 0.017, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

/* ══════════════════════════════════════════════════════════
   一人称プレイヤー
   ══════════════════════════════════════════════════════════ */
const hud = new Hud({
  root: document.getElementById('hud'),
  prompt: document.getElementById('prompt'),
  promptText: document.getElementById('promptText'),
  crosshair: document.getElementById('crosshair'),
  minimap: document.getElementById('minimap'),
  hint: document.getElementById('hudHint'),
  toast: document.getElementById('toast'),
});

const sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume?.();
    return this.ctx;
  },
  step(sprinting) {
    if (!settings.steps) return;
    try {
      const ctx = this.ensure();
      const len = Math.floor(ctx.sampleRate * 0.07);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = sprinting ? 900 : 640;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = sprinting ? 0.16 : 0.09;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
    } catch { /* */ }
  },
};

let mode = 'walk';   // 'walk' | 'cam'
const player = new Player(camera, {
  dom: canvas,
  colliders: classroom.colliders,
  rooms,
  onInteract: (it) => interact(it),
  onLockChange: (locked) => hud.setLocked(locked),
  sound,
});
player.teleport(0.8, RYOMA_POS[2] + 2.3, 0, -0.04);   // 中央の通路・黒板側を向く

const motions = new MotionPanel({
  root: document.getElementById('motions'),
  onPick: (id) => playMotion(id),
});

/* ── 調べられる物 ── */
const ryomaInteractable = {
  id: 'ryoma', label: '両馬二郎に話しかける', key: '両馬',
  getPos: () => (ryoma ? new THREE.Vector3(ryoma.root.position.x, 1.45, ryoma.root.position.z) : new THREE.Vector3()),
  range: 2.8,
  bonus: 0.25,   // 机やスマホより「人」を優先する
};
player.interactables = [...classroom.interactables, ryomaInteractable];

const TOPIC_OF = {
  board: '黒板の地形図、覚えてる？',
  notice: '掲示板に何か書いた？',
  phone: 'スマホで何見てるの？',
  window: '窓の外、見た？',
  desk: '机の中、見せてくれない？',
};

async function interact(it) {
  if (!it) return;
  resetIdle();
  if (it.id === 'ryoma') {
    document.getElementById('chat').classList.remove('collapsed');
    player.exitLock();
    hud.toast('話しかけている…（Enterで送信）');
    setTimeout(() => document.getElementById('input').focus(), 60);
    return;
  }
  if (it.id === 'vending') {
    settings.corn = !settings.corn;
    save();
    const t = vendingTexture(settings.corn);
    classroom.vendMat.map?.dispose();
    classroom.vendMat.map = t;
    classroom.vendMat.needsUpdate = true;
    const el = document.getElementById('cfgCorn');
    if (el) el.checked = settings.corn;
    chat.system(settings.corn
      ? '（自販機の一番下の段に、コーンスープが戻っていた）'
      : '（コーンスープを買い占めた。ボタンは点滅したまま灯りが消えている）');
    hud.toast(settings.corn ? 'コーンスープを補充した' : 'コーンスープを買い占めた');
    return;
  }
  const topic = TOPIC_OF[it.id];
  if (topic) {
    player.exitLock();
    await handleUser(topic);
  }
}

function playMotion(id) {
  if (!ryoma || !ryoma.rig) return;
  if (id === 'rest') { ryoma.hold('rest'); }
  else ryoma.motion(id, 2.4);
  motions.setActive(id);
  answerMotion = id;
  setTimeout(() => { if (ryoma?.pose === id && id !== 'rest') { ryoma.hold('rest'); motions.setActive('rest'); } }, 2600);
}

/* ══════════════════════════════════════════════════════════
   モード切替（歩く / カメラ）
   ══════════════════════════════════════════════════════════ */
const VIEWS = {
  seat: { pos: [1.9, 1.42, -2.1], target: [RYOMA_POS[0], 1.32, RYOMA_POS[2]] },
  side: { pos: [3.7, 1.5, -2.7], target: [RYOMA_POS[0], 1.3, RYOMA_POS[2]] },
  board: { pos: [-0.5, 1.85, -2.3], target: [-0.3, 1.7, classroom.ROOM.zMin] },
  room: { pos: [3.9, 2.6, 3.7], target: [0, 0.9, -1.0] },
  corridor: { pos: [-6.3, 1.6, 1.3], target: [0.2, 1.35, -2.0] },
};
let tween = null;

function setMode(next) {
  mode = next;
  const walk = mode === 'walk';
  controls.enabled = !walk;
  player.enable(walk);
  hud.setVisible(walk);
  motions.setVisible(walk);
  document.getElementById('views').classList.toggle('hidden', walk);
  document.getElementById('touch').classList.toggle('hidden', !(walk && matchMedia('(pointer: coarse)').matches));
  document.getElementById('btnMode').classList.toggle('on', walk);
  document.getElementById('btnModeCam').classList.toggle('on', !walk);
  if (walk) {
    camera.fov = 62;
  } else {
    camera.fov = 46;
    if (!tween) goView('seat');
  }
  camera.updateProjectionMatrix();
  resize();
}

function goView(name) {
  const v = VIEWS[name];
  if (!v) return;
  tween = {
    t: 0, dur: 1.0,
    p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
    t0: controls.target.clone(), t1: new THREE.Vector3(...v.target),
  };
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}

document.getElementById('btnMode').addEventListener('click', () => setMode('walk'));
document.getElementById('btnModeCam').addEventListener('click', () => setMode('cam'));
document.getElementById('views').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (mode === 'walk') setMode('cam');
  goView(b.dataset.view);
});
addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;      // 入力中はショートカット無効
  const k = e.key.toLowerCase();
  if (k === 'm') setMode(mode === 'walk' ? 'cam' : 'walk');
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && MOTIONS[n - 1]) playMotion(MOTIONS[n - 1].id);
});

/* ══════════════════════════════════════════════════════════
   吹き出し
   ══════════════════════════════════════════════════════════ */
const bubbleEl = document.getElementById('bubble');
const bubbleText = document.getElementById('bubbleText');
let bubbleUntil = 0;
function showBubble(text, seconds = 4.5) {
  bubbleText.textContent = text;
  bubbleEl.classList.remove('hidden');
  bubbleEl.style.opacity = '1';
  bubbleUntil = performance.now() + seconds * 1000;
}
const _v = new THREE.Vector3();
function updateBubble() {
  if (bubbleEl.classList.contains('hidden') || !ryoma) return;
  if (performance.now() > bubbleUntil) {
    bubbleEl.style.opacity = '0';
    if (performance.now() > bubbleUntil + 400) bubbleEl.classList.add('hidden');
    return;
  }
  ryoma.anchor.getWorldPosition(_v);
  _v.project(camera);
  if (_v.z > 1) { bubbleEl.style.opacity = '0'; return; }
  const x = (_v.x * 0.5 + 0.5) * innerWidth;
  const y = (-_v.y * 0.5 + 0.5) * innerHeight;
  const margin = innerWidth > 780 ? 470 : 130;
  bubbleEl.style.left = `${Math.max(130, Math.min(innerWidth - margin, x))}px`;
  bubbleEl.style.top = `${Math.max(80, y - 12)}px`;
  bubbleEl.style.opacity = '1';
}

/* ══════════════════════════════════════════════════════════
   音声・環境音
   ══════════════════════════════════════════════════════════ */
let jaVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices().filter((v) => /ja(-|_)?JP/i.test(v.lang) || /japan/i.test(v.name));
  jaVoice = vs.find((v) => /google/i.test(v.name)) || vs[0] || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text) {
  if (!settings.voice || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[✝]/g, '').replace(/[「」]/g, ''));
    u.lang = 'ja-JP';
    u.rate = settings.rate;
    u.pitch = 0.9;
    if (jaVoice) u.voice = jaVoice;
    speechSynthesis.speak(u);
  } catch { /* */ }
}

let audioCtx = null, ambNodes = null;
function toggleAmbience(on) {
  if (on) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
    if (ambNodes) { ambNodes.gain.gain.value = 0.5; return; }
    const len = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.5;
    src.connect(lp).connect(gain).connect(audioCtx.destination);
    src.start();
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    const og = audioCtx.createGain();
    og.gain.value = 0.02;
    const olp = audioCtx.createBiquadFilter();
    olp.type = 'lowpass'; olp.frequency.value = 180;
    osc.connect(olp).connect(og).connect(gain);
    osc.start();
    ambNodes = { src, osc, gain };
  } else if (ambNodes) {
    ambNodes.gain.gain.value = 0;
  }
}

/* ══════════════════════════════════════════════════════════
   会話
   ══════════════════════════════════════════════════════════ */
const brain = new RyomaBrain();
const chat = new ChatView({
  log: document.getElementById('log'),
  topics: document.getElementById('topics'),
  form: document.getElementById('composer'),
  input: document.getElementById('input'),
  onSend: (t) => handleUser(t),
  topicsList: [
    '✝本質✝って何？',
    '二郎系の話をしよう',
    'ヘイカツの授業、やばかった',
    '三重の名前、まだ埋めてる？',
    'コーンスープが戻ってきた',
    '進路、どうしてる？',
    '窓の外、見た？',
    'ちょっと疲れた',
  ],
});
const board = new BoardView({
  root: document.getElementById('boardPanel'),
  scroll: document.getElementById('boardScroll'),
  dot: document.getElementById('boardDot'),
});

const history = [];
let ryoma = null;
let idleTimer = null;
let thinking = false;
let answerMotion = 'rest';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** セリフの内容に合わせて身振りを選ぶ */
function motionFor(line) {
  if (/✝本質✝/.test(line)) return 'honshitsu';
  if (/スマホ|掲示板|書き込|検索/.test(line)) return 'phone';
  if (/ヘイカツ|地形図|等高線|黒板|河岸段丘|味噌/.test(line)) return 'point';
  if (/わかんない|わからん|考え|悩|どうしよ/.test(line)) return 'think';
  if (/疲れ|だる|眠/.test(line)) return 'cross';
  if (/おはよ|やっほ|またな|じゃあな/.test(line)) return 'wave';
  if (/机|教科書|ノート/.test(line)) return 'scratch';
  return null;
}

async function handleUser(text) {
  resetIdle();
  const meEl = chat.user(text, null, null);
  chat.typing(true);
  thinking = true;
  if (mode === 'walk') player.exitLock();

  let reply;
  if (settings.llm && settings.key) {
    try {
      reply = await llmReply(text);
    } catch (err) {
      chat.system('（AI接続に失敗したので、いつもの両馬が返す）');
      reply = brain.reply(text);
    }
  } else {
    reply = brain.reply(text);
  }

  const wait = Math.min(1600, 420 + text.length * 26 + Math.random() * 380);
  await sleep(wait);
  chat.hideTyping();

  chat.addScore(meEl, reply.score, reply.scoreComment);

  for (const line of reply.lines) {
    chat.ryoma(line);
    showBubble(line, 3.4 + Math.min(4, line.length / 22));
    speak(line);
    ryoma?.speak(0.6 + line.length / 26, line.includes('✝本質✝') ? 1.2 : 0.8);
    const m = motionFor(line);
    if (m && m !== answerMotion) {
      answerMotion = m;
      ryoma?.motion(m, 2.2);
      motions.setActive(m);
    }
    if (line.includes('✝本質✝')) {
      ryoma?.cheer();
      if (ryoma) {
        ryoma.anchor.getWorldPosition(_v);
        particles.burst(new THREE.Vector3(_v.x, _v.y - 0.25, _v.z + 0.15), 10 + Math.floor(Math.random() * 8));
      }
    }
    await sleep(520 + Math.min(1100, line.length * 16));
  }

  if (reply.board) {
    await sleep(420);
    chat.board(reply.board);
    board.add(reply.board);
    ryoma?.speak(1.2, 1);
    ryoma?.motion('phone', 2.4);
  }
  if (reply.cameo && settings.cameo) {
    await sleep(700);
    const line = reply.cameo.lines[Math.floor(Math.random() * reply.cameo.lines.length)];
    chat.cameo(reply.cameo.who, line);
    showBubble(`（${reply.cameo.who}）${line}`, 3);
  }

  chat.typing(false);
  thinking = false;
  resetIdle();
}

async function llmReply(userText) {
  history.push({ role: 'user', content: userText });
  const body = {
    model: settings.model,
    messages: [{ role: 'system', content: settings.prompt }, ...history.slice(-12)],
    temperature: 0.92,
    max_tokens: 260,
  };
  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('empty');
  history.push({ role: 'assistant', content: text });
  const b = brain.reply(userText);
  return {
    lines: text.split(/\n+/).filter(Boolean).slice(0, 3),
    score: b.score, scoreComment: b.scoreComment, board: b.board, cameo: b.cameo,
  };
}

async function sayIdle() {
  if (thinking) { resetIdle(); return; }
  const r = brain.idle();
  chat.ryoma(r.lines[0]);
  showBubble(r.lines[0], 4);
  speak(r.lines[0]);
  ryoma?.speak(1.4, 0.7);
  resetIdle();
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(sayIdle, 34000);
}

/* ══════════════════════════════════════════════════════════
   UI イベント
   ══════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

$('btnBoard').addEventListener('click', () => togglePanel('boardPanel'));
$('btnSettings').addEventListener('click', () => togglePanel('settingsPanel'));
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden'));
});
function togglePanel(id) {
  const el = $(id);
  const wasHidden = el.classList.contains('hidden');
  $('boardPanel').classList.add('hidden');
  $('settingsPanel').classList.add('hidden');
  if (wasHidden) {
    el.classList.remove('hidden');
    if (id === 'boardPanel') $('boardDot').classList.remove('on');
  }
}

$('btnVoice').addEventListener('click', () => {
  settings.voice = !settings.voice;
  $('cfgVoice').checked = settings.voice;
  $('btnVoice').textContent = settings.voice ? '🔊' : '🔈';
  if (!settings.voice) window.speechSynthesis?.cancel();
  save();
});

$('btnCollapse').addEventListener('click', () => $('chat').classList.add('collapsed'));
$('btnExpand').addEventListener('click', () => $('chat').classList.remove('collapsed'));

const bind = (id, key, after) => {
  const el = $(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!settings[key];
  else el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = el.type === 'checkbox' ? el.checked : el.value;
    save();
    after?.(settings[key]);
  });
};
bind('cfgVoice', 'voice', (v) => { $('btnVoice').textContent = v ? '🔊' : '🔈'; });
bind('cfgRate', 'rate', (v) => { settings.rate = parseFloat(v) || 1.1; save(); });
bind('cfgAmb', 'amb', (v) => toggleAmbience(v));
bind('cfgFlip', 'flip', (v) => ryoma?.flip(v));
bind('cfgRig', 'rig', (v) => ryoma?.setRigEnabled(v));
bind('cfgSteps', 'steps');
bind('cfgTime', 'time', (v) => applyTime(v));
bind('cfgCorn', 'corn', (v) => {
  const t = vendingTexture(v);
  classroom.vendMat.map?.dispose();
  classroom.vendMat.map = t;
  classroom.vendMat.needsUpdate = true;
});
bind('cfgCameo', 'cameo');
bind('cfgLite', 'lite', (v) => {
  renderer.shadowMap.enabled = !v;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, v ? 1 : 1.75));
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
});
bind('cfgLLM', 'llm');
bind('cfgEndpoint', 'endpoint');
bind('cfgModel', 'model');
bind('cfgKey', 'key');
bind('cfgPrompt', 'prompt');

function applyTime(v) {
  for (const l of lights.lamps) scene.remove(l);
  if (lights.sun?.target) scene.remove(lights.sun.target);
  scene.remove(lights.hemi, lights.sun, lights.fill);
  lights = buildLights(scene, { quality: settings.lite ? 'low' : 'high', time: v });
  const sky = { morning: 0xa9c3d8, day: 0x9fb6c4, evening: 0xd9a878, night: 0x1c2431 }[v] || 0x9fb6c4;
  scene.background = new THREE.Color(sky);
  dust.material.opacity = v === 'night' ? 0.22 : 0.5;
}

$('btnVoice').textContent = settings.voice ? '🔊' : '🔈';

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([chat.exportText()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `両馬二郎との会話_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('btnClear').addEventListener('click', () => {
  chat.clear();
  board.clear();
  history.length = 0;
  chat.system('会話を消した。✝本質✝は消えない。');
});

/* ── スマホ：ジョイスティック・視点ドラッグ・E ── */
(() => {
  const stick = $('stick');
  const knob = stick.querySelector('i');
  let id = null, ox = 0, oy = 0;
  const R = 46;
  const start = (e) => {
    const t = [...e.changedTouches].find((x) => x.identifier === id) || e.changedTouches[0];
    id = t.identifier;
    const r = stick.getBoundingClientRect();
    ox = r.left + r.width / 2; oy = r.top + r.height / 2;
    move(e);
  };
  const move = (e) => {
    const t = [...e.touches].find((x) => x.identifier === id);
    if (!t) return;
    let dx = t.clientX - ox, dy = t.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.touchMove = { x: dx / R, y: dy / R };
    e.preventDefault();
  };
  const end = () => { id = null; knob.style.transform = ''; player.touchMove = null; };
  stick.addEventListener('touchstart', start, { passive: false });
  stick.addEventListener('touchmove', move, { passive: false });
  stick.addEventListener('touchend', end);
  stick.addEventListener('touchcancel', end);

  // 画面ドラッグで視点
  let lx = 0, ly = 0, lookId = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookId = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const t = [...e.touches].find((x) => x.identifier === lookId);
    if (!t || mode !== 'walk') return;
    player.yaw -= (t.clientX - lx) * 0.005;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (t.clientY - ly) * 0.005));
    lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  $('btnTouchE').addEventListener('click', () => player.tryInteract());
})();

/* ══════════════════════════════════════════════════════════
   ループ
   ══════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const panel = w > 780 ? 400 : 0;
  camera.aspect = (w + panel) / h;
  if (panel) camera.setViewOffset(w + panel, h, panel, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  // 照準は「カメラが実際に向いている場所」へ（パネル分のオフセットを打ち消す）
  document.documentElement.style.setProperty('--aim-x', `${(w - panel) / 2}px`);
}
addEventListener('resize', resize);

let mapTick = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (mode === 'walk') {
    player.update(dt);
    hud.setPrompt(player.focus ? player.focus.label : '');
    mapTick += dt;
    if (mapTick > 0.06) {
      mapTick = 0;
      hud.drawMinimap({
        room: classroom.ROOM, colliders: classroom.colliders,
        player: player.pos, yaw: player.yaw,
        ryoma: ryoma ? ryoma.root.position : null,
        ryomaYaw: ryoma ? ryoma.root.rotation.y : 0,
        focus: player.focus,
      });
    }
  } else {
    if (tween) {
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (k >= 1) tween = null;
    }
    controls.update();
    hud.setPrompt('');
  }

  // 室外機のファン
  classroom.fan.rotation.x += dt * 22;
  const now = new Date();
  classroom.hands.children[0].rotation.z = -((now.getHours() % 12) / 12 + now.getMinutes() / 720) * Math.PI * 2;
  classroom.hands.children[1].rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
  classroom.screen.material.opacity = 0.55 + Math.sin(t * 1.7) * 0.3;

  // 埃
  const dp = dust.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    let y = dp.getY(i) + dt * (0.035 + (i % 7) * 0.006);
    if (y > 2.9) y = 0.35;
    dp.setY(i, y);
    dp.setZ(i, dp.getZ(i) + Math.sin(t * 0.5 + i) * dt * 0.02);
  }
  dp.needsUpdate = true;

  ryoma?.update(dt, camera);
  particles.update(dt);
  updateBubble();

  renderer.render(scene, camera);
}

/* ══════════════════════════════════════════════════════════
   起動
   ══════════════════════════════════════════════════════════ */
async function boot() {
  const bar = $('loadbar');
  const note = $('loadnote');
  const url = (import.meta.env.BASE_URL || '/') + 'ryoma.glb';

  let rigResult = null;
  try {
    const model = await loadRyoma(url, (p) => {
      bar.style.width = `${Math.round(p * 62)}%`;
      note.textContent = `3Dモデルを読み込み中… ${Math.round(p * 100)}%`;
    });
    bar.style.width = '66%';
    try {
      if (settings.rig) {
        note.textContent = '骨を入れています…（手と腕を分離中）';
        rigResult = await prepareRig(model, (p) => {
          bar.style.width = `${Math.round(66 + p * 32)}%`;
          note.textContent = `ポケットの手を分離中… ${Math.round(p * 100)}%`;
        });
      } else {
        normalizeModel(model);
      }
    } catch (err) {
      console.error('自動リグに失敗', err);
      try { normalizeModel(model); } catch { /* */ }
      chat.system('（自動リグの生成に失敗したので、静止モデルで表示する）');
    }
    ryoma = new Ryoma(model, {
      position: RYOMA_AT,
      rig: rigResult?.rig || null,
      skinned: rigResult?.skinned || null,
      plain: rigResult?.plain || null,
    });
    ryoma.flip(!!settings.flip);
    scene.add(ryoma.root);
    // すり抜け防止の当たり判定
    classroom.colliders.push({
      minX: RYOMA_POS[0] - 0.3, maxX: RYOMA_POS[0] + 0.3,
      minZ: RYOMA_POS[2] - 0.26, maxZ: RYOMA_POS[2] + 0.26, tag: '両馬',
    });
    bar.style.width = '100%';
  } catch (err) {
    console.error(err);
    note.textContent = '3Dモデルを読み込めなかった。会話はできる。';
    chat.system('（3Dモデルの読み込みに失敗した。教室と会話はそのまま動く）');
  }

  $('loading').classList.add('gone');
  setTimeout(() => $('loading').remove(), 900);
  setMode('walk');
  applyTime(settings.time);
  resize();
  animate();

  await sleep(600);
  hud.toast('WASD で歩いて、両馬に近づいたら E', 4200);
  await sleep(900);
  const open = brain.opening();
  for (const line of open.lines) {
    chat.ryoma(line);
    showBubble(line, 3.2 + line.length / 26);
    ryoma?.speak(0.6 + line.length / 26, 0.9);
    await sleep(700 + Math.min(900, line.length * 14));
  }
  chat.system('話したいことを入力してね。Enterで送信。');
  resetIdle();
  if (settings.amb) toggleAmbience(true);
}
boot();
