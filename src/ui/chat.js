/** チャット画面（ログ・お題・入力） */
export class ChatView {
  constructor({ log, topics, form, input, onSend, topicsList }) {
    this.logEl = log;
    this.form = form;
    this.input = input;
    this.onSend = onSend;
    this.entries = [];
    this.busy = false;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || this.busy) return;
      input.value = '';
      onSend(v);
    });

    if (topics && topicsList) {
      for (const t of topicsList) {
        const b = document.createElement('button');
        b.textContent = t;
        b.addEventListener('click', () => {
          if (this.busy) return;
          input.value = t;
          input.focus();
        });
        topics.appendChild(b);
      }
    }
  }

  _el(cls, parent) {
    const d = document.createElement('div');
    d.className = cls;
    (parent || this.logEl).appendChild(d);
    this._scroll();
    return d;
  }

  _scroll() {
    requestAnimationFrame(() => { this.logEl.scrollTop = this.logEl.scrollHeight; });
  }

  user(text, score, scoreComment) {
    this.entries.push({ who: 'me', text });
    const m = this._el('msg me');
    const b = document.createElement('div');
    b.className = 'bubble-text';
    b.textContent = text;
    m.appendChild(b);
    if (score != null) {
      const h = document.createElement('div');
      h.className = 'honshitsu';
      h.textContent = `本質度 ${score} ── ${scoreComment}`;
      m.appendChild(h);
    }
    return m;
  }

  ryoma(text) {
    this.entries.push({ who: '両馬二郎', text });
    const m = this._el('msg ryoma');
    const b = document.createElement('div');
    b.className = 'bubble-text';
    b.textContent = text;
    m.appendChild(b);
    return m;
  }

  cameo(who, text) {
    this.entries.push({ who, text });
    const m = this._el('msg cameo');
    const w = document.createElement('div');
    w.className = 'who-tag';
    w.textContent = who;
    const b = document.createElement('div');
    b.className = 'bubble-text';
    b.textContent = text;
    m.appendChild(w);
    m.appendChild(b);
    return m;
  }

  board(post) {
    this.entries.push({ who: '掲示板', text: post.body });
    const m = this._el('msg board');
    const card = document.createElement('div');
    card.className = 'board-card';
    const head = document.createElement('div');
    head.className = 'bc-head';
    head.innerHTML = `<span class="bc-tag">掲示板に書いた</span>${post.no} 名無しの地形図好き ${post.time} ID:✝`;
    const body = document.createElement('div');
    body.className = 'bc-body';
    body.textContent = post.body;
    card.appendChild(head);
    card.appendChild(body);
    if (post.reply) {
      const r = document.createElement('div');
      r.className = 'bc-reply';
      r.textContent = `${post.reply.no} 名無しの地形図好き ${post.reply.time}\n${post.reply.body}`;
      card.appendChild(r);
    }
    m.appendChild(card);
    return m;
  }

  system(text) {
    this.entries.push({ who: 'system', text });
    const d = this._el('sys');
    d.textContent = text;
    return d;
  }

  typing(on) {
    this.busy = on;
    if (on) {
      this.hideTyping();
      const t = document.createElement('div');
      t.className = 'typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      this.logEl.appendChild(t);
      this._scroll();
    } else {
      this.hideTyping();
    }
  }

  /** 入力は塞いだまま「…」だけ消す */
  hideTyping() {
    this.logEl.querySelector('.typing')?.remove();
  }

  addScore(el, score, comment) {
    if (score == null || !el) return;
    const h = document.createElement('div');
    h.className = 'honshitsu';
    h.textContent = `本質度 ${score} ── ${comment}`;
    el.appendChild(h);
    this._scroll();
  }

  exportText() {
    const now = new Date().toLocaleString('ja-JP');
    const body = this.entries
      .filter((e) => e.who !== 'system')
      .map((e) => `${e.who}: ${e.text}`)
      .join('\n');
    return `北棟・理数科B組 ── 両馬二郎との会話\n${now}\n${'─'.repeat(40)}\n${body}\n`;
  }

  clear() {
    this.entries = [];
    this.logEl.innerHTML = '';
  }
}
