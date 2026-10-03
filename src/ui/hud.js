/**
 * 一人称モードの HUD：照準・操作ヒント・近づいた時の「E」・ミニマップ
 */
export class Hud {
  constructor({ root, prompt, promptText, crosshair, minimap, hint, toast }) {
    this.root = root;
    this.promptEl = prompt;
    this.promptText = promptText;
    this.crosshair = crosshair;
    this.canvas = minimap;
    this.ctx = minimap?.getContext('2d');
    this.hint = hint;
    this.toastEl = toast;
    this.toastTimer = null;
    this._last = '';
  }

  setVisible(v) { this.root?.classList.toggle('hidden', !v); }

  setPrompt(text) {
    if (text === this._last) return;
    this._last = text;
    if (!this.promptEl) return;
    if (text) {
      this.promptText.textContent = text;
      this.promptEl.classList.remove('hidden');
      this.crosshair?.classList.add('active');
    } else {
      this.promptEl.classList.add('hidden');
      this.crosshair?.classList.remove('active');
    }
  }

  setLocked(locked) {
    this.hint?.classList.toggle('hidden', locked);
  }

  toast(msg, ms = 2600) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  drawMinimap({ room, colliders, player, yaw, ryoma, ryomaYaw, focus }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    const pad = 8;
    const x0 = room.xMin - 3.4, x1 = room.xMax;
    const z0 = room.zMin, z1 = room.zMax;
    const sc = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
    const ox = pad + ((W - pad * 2) - (x1 - x0) * sc) / 2;
    const oy = pad + ((H - pad * 2) - (z1 - z0) * sc) / 2;
    const X = (x) => ox + (x - x0) * sc;
    const Z = (z) => oy + (z - z0) * sc;

    ctx.clearRect(0, 0, W, H);
    // 教室
    ctx.fillStyle = 'rgba(24,28,34,0.62)';
    ctx.fillRect(X(room.xMin), Z(room.zMin), (room.xMax - room.xMin) * sc, (room.zMax - room.zMin) * sc);
    // 廊下
    ctx.fillStyle = 'rgba(24,28,34,0.42)';
    ctx.fillRect(X(room.xMin - 3.3), Z(room.zMin - 0.6), 3.3 * sc, (room.zMax - room.zMin + 1.6) * sc);
    ctx.strokeStyle = 'rgba(214,224,232,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(X(room.xMin), Z(room.zMin), (room.xMax - room.xMin) * sc, (room.zMax - room.zMin) * sc);
    ctx.strokeRect(X(room.xMin - 3.3), Z(room.zMin - 0.6), 3.3 * sc, (room.zMax - room.zMin + 1.6) * sc);

    // 机など
    ctx.fillStyle = 'rgba(190,205,220,0.35)';
    for (const c of colliders) {
      ctx.fillRect(X(c.minX), Z(c.minZ), (c.maxX - c.minX) * sc, (c.maxZ - c.minZ) * sc);
    }

    // 両馬
    if (ryoma) {
      ctx.save();
      ctx.translate(X(ryoma.x), Z(ryoma.z));
      ctx.rotate(-(ryomaYaw || 0));   // モデルの正面(+X)を +Z に向けた回転
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath();
      ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 自分
    ctx.save();
    ctx.translate(X(player.x), Z(player.z));
    ctx.rotate(-yaw - Math.PI / 2);
    ctx.fillStyle = '#8fe3ff';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-4, 4.5); ctx.lineTo(-4, -4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // 注視対象
    if (focus?.pos) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(focus.pos.x), Z(focus.pos.z), 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** モーション・パレット（ポケットの手を出して動かす） */
export const MOTIONS = [
  { id: 'rest', name: 'ポケット', hint: '手をポケットに戻す' },
  { id: 'phone', name: 'スマホ', hint: 'スマホをのぞき込む' },
  { id: 'point', name: '指さす', hint: '黒板・窓の外を指さす' },
  { id: 'explain', name: '説明', hint: '両手を広げて説明する' },
  { id: 'think', name: '考える', hint: '顎に手を当てる' },
  { id: 'scratch', name: '頭をかく', hint: '' },
  { id: 'cross', name: '腕組み', hint: '' },
  { id: 'wave', name: '手を振る', hint: '' },
  { id: 'down', name: '手を下ろす', hint: 'ポケットから出してだらり' },
  { id: 'honshitsu', name: '✝本質✝', hint: '両手を上げる' },
  { id: 'bow', name: 'お辞儀', hint: '' },
  { id: 'surprise', name: 'のけぞる', hint: '' },
];

export class MotionPanel {
  constructor({ root, onPick }) {
    this.root = root;
    this.grid = root.querySelector('.motion-grid');
    this.buttons = [];
    for (const m of MOTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = m.name;
      b.title = m.hint || m.name;
      b.dataset.motion = m.id;
      b.addEventListener('click', () => onPick?.(m.id));
      this.grid.appendChild(b);
      this.buttons.push(b);
    }
  }
  setActive(id) {
    for (const b of this.buttons) b.classList.toggle('on', b.dataset.motion === id);
  }
  setVisible(v) { this.root.classList.toggle('hidden', !v); }
}
