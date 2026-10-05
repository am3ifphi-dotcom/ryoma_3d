// Dialogue runner + speech bubble (HTML overlay projected from the 3D head position).
import * as THREE from 'three';
import { INTRO, TOPICS, SMALLTALK, FAREWELLS, NAME } from './script.js';
import { sfx } from '../audio/sfx.js';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const decorate = (s) => esc(s).replace(/✝本質✝/g, '<span class="hon">✝本質✝</span>').replace(/✝/g, '<span class="dag">✝</span>');

// gesture / mood → facial expression (see EXPRESSIONS in character/face.js)
const GESTURE_FACE = {
  cross: 'grin', pointUp: 'smug', point: 'serious', shrug: 'think', facepalm: 'annoyed', scratch: 'sad',
  lookWindow: 'serious', think: 'think', notice: 'surprised', wave: 'happy', spread: 'happy', nod: 'neutral',
  nodSlow: 'serious', lean: 'smug', chestHand: 'smug', handWaveNo: 'annoyed', phoneShow: 'excited',
  phoneLook: 'bored', lookAwayShy: 'sad', tilt: 'think', excited: 'excited', bow: 'closed', shake: 'annoyed',
  glasses: 'smug', chin: 'think', pocketShrug: 'bored',
};
const MOOD_FACE = { up: 'happy', low: 'bored', calm: 'neutral' };
function pickExpression(node) {
  if (node.mood === 'up' && ['grin', 'excited', 'happy', 'smug'].includes(GESTURE_FACE[node.g])) return GESTURE_FACE[node.g];
  if (node.mood === 'low') return GESTURE_FACE[node.g] === 'annoyed' ? 'annoyed' : (node.g === 'scratch' || node.g === 'lookAwayShy' ? 'sad' : 'bored');
  return GESTURE_FACE[node.g] || MOOD_FACE[node.mood || 'calm'];
}

export class DialogueSystem {
  /**
   * @param {{ character: any, camera: THREE.Camera, onStart?:Function, onEnd?:Function, onHonshitsu?:Function }} opts
   */
  constructor({ character, camera, onStart, onEnd, onHonshitsu }) {
    this.ch = character;
    this.camera = camera;
    this.onStart = onStart; this.onEnd = onEnd; this.onHonshitsu = onHonshitsu;
    this.active = false;
    this.flags = JSON.parse(localStorage.getItem('ryoma.flags') || '{}');
    this.seen = JSON.parse(localStorage.getItem('ryoma.seen') || '[]');
    this.stack = []; // [{ nodes, i }]
    this.typing = null; // { full, n, timer, mood }
    this.waitingChoice = false;
    this.lineDone = false;

    // DOM
    this.el = document.getElementById('bubble');
    this.textEl = this.el.querySelector('.bubble-text');
    this.nameEl = this.el.querySelector('.bubble-name');
    this.nextEl = this.el.querySelector('.bubble-next');
    this.choicesEl = document.getElementById('choices');
    this.nameEl.textContent = NAME;
    this._v = new THREE.Vector3();
    this.choicesEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) this.choose(Number(b.dataset.i));
    });
  }

  save() {
    localStorage.setItem('ryoma.flags', JSON.stringify(this.flags));
    localStorage.setItem('ryoma.seen', JSON.stringify(this.seen));
  }

  pickFlow() {
    if (!this.flags.met) return INTRO;
    const unseen = TOPICS.filter((t) => !this.seen.includes(t.id));
    if (unseen.length) {
      const t = unseen[Math.floor(Math.random() * unseen.length)];
      this.seen.push(t.id); this.save();
      return [...t.nodes, { t: FAREWELLS[Math.floor(Math.random() * FAREWELLS.length)], g: 'wave', mood: 'up' }];
    }
    const s = SMALLTALK[Math.floor(Math.random() * SMALLTALK.length)];
    return s;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.stack = [{ nodes: this.pickFlow(), i: 0 }];
    this.el.classList.add('show');
    sfx.ui('open');
    this.ch.animator.setState('talk');
    this.onStart?.();
    this.next();
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.remove('show');
    this.choicesEl.classList.remove('show');
    this.choicesEl.innerHTML = '';
    this.waitingChoice = false;
    this.ch.animator.setTalking(false);
    this.ch.animator.setState('idle');
    this.ch.face?.setExpression('smug', { speed: 3 });
    if (this.typing) { clearInterval(this.typing.timer); this.typing = null; }
    sfx.ui('close');
    this.onEnd?.();
  }

  /** E / click / space */
  advance() {
    if (!this.active || this.waitingChoice) return;
    if (this.typing) { this.finishTyping(); return; }
    this.next();
  }

  next() {
    while (this.stack.length) {
      const top = this.stack[this.stack.length - 1];
      if (top.i >= top.nodes.length) { this.stack.pop(); continue; }
      const node = top.nodes[top.i++];
      if (node.set) { this.flags[node.set] = true; this.save(); continue; }
      if (node.if) { if (this.flags[node.if]) this.stack.push({ nodes: node.nodes, i: 0 }); continue; }
      if (node.choices) { this.showChoices(node.choices); return; }
      this.say(node);
      return;
    }
    this.end();
  }

  say(node) {
    this.lineDone = false;
    this.nextEl.classList.remove('show');
    this.textEl.innerHTML = '';
    if (node.g) this.ch.animator.playGesture(node.g);
    if (node.e) this.ch.showEmote(node.e);
    this.ch.face?.setExpression(node.x || pickExpression(node));
    this.ch.animator.setTalking(true);
    const full = node.t;
    const mood = node.mood || 'calm';
    const typing = { full, n: 0, mood, timer: 0 };
    this.typing = typing;
    const tick = () => {
      if (this.typing !== typing) return;
      const ch = full[typing.n];
      typing.n++;
      if (ch) this.ch.face?.speakChar(ch);
      this.textEl.innerHTML = decorate(full.slice(0, typing.n));
      if (ch && !/[\s、。…！？「」（）・,.!?]/.test(ch) && typing.n % 2 === 0) sfx.blip(mood, ch);
      let delay = 38;
      if (/[、，]/.test(ch)) delay = 160;
      else if (/[。！？]/.test(ch)) delay = 260;
      else if (ch === '…') delay = 220;
      if (typing.n >= full.length) { this.finishTyping(); return; }
      typing.timer = setTimeout(tick, delay);
    };
    tick();
  }

  finishTyping() {
    if (!this.typing) return;
    clearTimeout(this.typing.timer);
    const full = this.typing.full;
    this.typing = null;
    this.textEl.innerHTML = decorate(full);
    this.lineDone = true;
    this.nextEl.classList.add('show');
    this.ch.animator.setTalking(false);
    const count = (full.match(/✝本質✝/g) || []).length;
    if (count) this.onHonshitsu?.(count);
  }

  showChoices(choices) {
    this.waitingChoice = true;
    this._choices = choices;
    this.choicesEl.innerHTML = choices.map((c, i) => `<button data-i="${i}"><span class="key">${i + 1}</span>${esc(c.label)}</button>`).join('');
    this.choicesEl.classList.add('show');
    this.ch.animator.setTalking(false);
    this.ch.animator.playGesture('tilt');
    sfx.ui('select');
  }

  choose(i) {
    if (!this.waitingChoice) return;
    const c = this._choices[i];
    if (!c) return;
    this.waitingChoice = false;
    this.choicesEl.classList.remove('show');
    this.choicesEl.innerHTML = '';
    sfx.ui('click');
    this.stack.push({ nodes: c.nodes, i: 0 });
    this.next();
  }

  /** Call every frame: positions the bubble above the head. */
  update() {
    if (!this.active) return;
    const v = this.ch.getHeadTop(this._v);
    v.y += 0.12;
    v.project(this.camera);
    const behind = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const margin = 20;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const cx = Math.min(Math.max(x, w / 2 + margin), window.innerWidth - w / 2 - margin);
    const cy = Math.min(Math.max(y, h + margin + 24), window.innerHeight - margin);
    this.el.style.transform = `translate(${cx - w / 2}px, ${cy - h - 26}px)`;
    this.el.style.setProperty('--tail-x', `${Math.min(Math.max(x - (cx - w / 2), 30), w - 30)}px`);
    this.el.style.opacity = behind ? '0' : '1';
  }
}
