import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildClassroom, buildLights } from './world/classroom.js';
import { Ryoma, CrossBurst, loadRyoma } from './world/ryoma.js';
import { vendingTexture } from './world/textures.js';
import { RyomaBrain } from './brain/engine.js';
import { ChatView } from './ui/chat.js';
import { BoardView } from './ui/board.js';
import { SYSTEM_PROMPT } from './data/profile.js';

/* ══════════════════════════════════════════════════════════
   設定
   ══════════════════════════════════════════════════════════ */
const STORE = 'ryoma3d.settings.v1';
const defaults = {
  voice: false, rate: 1.1, amb: false, flip: false,
  corn: true, cameo: true, lite: false,
  llm: false, endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini', key: '', prompt: SYSTEM_PROMPT,
};
const settings = Object.assign({}, defaults, load(STORE, {}));

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* */ } }

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
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb6c4);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.08, 200);
camera.position.set(0.9, 1.42, -1.0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 1.05;
controls.maxDistance = 8;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.56;
controls.target.set(0.55, 1.32, -2.75);

const classroom = buildClassroom({ cornSoup: settings.corn });
scene.add(classroom.group);
buildLights(scene, { quality: settings.lite ? 'low' : 'high' });

const particles = new CrossBurst(scene, 46);

const VIEWS = {
  seat: { pos: [0.9, 1.42, -1.0], target: [0.55, 1.3, -2.75] },
  side: { pos: [3.05, 1.52, -1.5], target: [0.55, 1.3, -2.75] },
  board: { pos: [-0.7, 1.72, 0.4], target: [0.1, 1.6, -3.9] },
  room: { pos: [3.5, 2.55, 3.3], target: [0, 0.9, -0.9] },
  corridor: { pos: [-5.9, 1.6, 1.7], target: [0.2, 1.35, -2.5] },
};

let tween = null;
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
document.getElementById('views').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) goView(b.dataset.view);
});
goView('seat');

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
  const margin = innerWidth > 780 ? 470 : 130;   // 右のチャットパネルを避ける
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
    // 室外機の低いうなり
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

const history = [];   // LLM 用
let ryoma = null;
let idleTimer = null;
let thinking = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function handleUser(text) {
  resetIdle();
  const meEl = chat.user(text, null, null);
  chat.typing(true);
  thinking = true;

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

  // 本質度はユーザーの発言に対して付く
  chat.addScore(meEl, reply.score, reply.scoreComment);

  for (const line of reply.lines) {
    chat.ryoma(line);
    showBubble(line, 3.4 + Math.min(4, line.length / 22));
    speak(line);
    ryoma?.speak(0.6 + line.length / 26, line.includes('✝本質✝') ? 1.2 : 0.8);
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('empty');
  history.push({ role: 'assistant', content: text });
  const b = brain.reply(userText);   // 本質度・掲示板判定だけ拝借
  return {
    lines: text.split(/\n+/).filter(Boolean).slice(0, 3),
    score: b.score,
    scoreComment: b.scoreComment,
    board: b.board,
    cameo: b.cameo,
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

/* ══════════════════════════════════════════════════════════
   ループ
   ══════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  // チャットパネル（右）に隠れないよう、画角を左にずらす
  const panel = w > 780 ? 400 : 0;
  camera.aspect = (w + panel) / h;
  if (panel) camera.setViewOffset(w + panel, h, panel, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (tween) {
    tween.t += dt;
    const k = Math.min(1, tween.t / tween.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (k >= 1) tween = null;
  }
  controls.update();

  // 室外機のファン
  classroom.fan.rotation.x += dt * 22;
  // 時計の針
  const now = new Date();
  classroom.hands.children[0].rotation.z = -((now.getHours() % 12) / 12 + now.getMinutes() / 720) * Math.PI * 2;
  classroom.hands.children[1].rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
  // スマホの明滅
  classroom.screen.material.opacity = 0.55 + Math.sin(t * 1.7) * 0.3;

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
  try {
    const model = await loadRyoma(url, (p) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      note.textContent = `3Dモデルを読み込み中… ${Math.round(p * 100)}%`;
    });
    ryoma = new Ryoma(model, {
      position: new THREE.Vector3(0.55, 0, -2.75),
      flip: settings.flip,
    });
    scene.add(ryoma.root);
    bar.style.width = '100%';
  } catch (err) {
    console.error(err);
    note.textContent = '3Dモデルを読み込めなかった。会話はできる。';
    chat.system('（3Dモデルの読み込みに失敗した。教室と会話はそのまま動く）');
  }

  $('loading').classList.add('gone');
  setTimeout(() => $('loading').remove(), 900);
  resize();
  animate();

  await sleep(700);
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
