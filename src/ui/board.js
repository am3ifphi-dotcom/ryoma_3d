/** 匿名掲示板パネル */
export class BoardView {
  constructor({ root, scroll, dot }) {
    this.scroll = scroll;
    this.dot = dot;
    this.count = 0;
    this.empty = scroll.querySelector('.board-empty');
    this.root = root;
  }

  add(post) {
    if (this.empty) { this.empty.remove(); this.empty = null; }
    this.count += 1;
    const p = document.createElement('div');
    p.className = 'post';
    p.innerHTML = `<div class="p-head">${post.no} 名無しの地形図好き ${post.time} ID:✝✝✝</div>`;
    const body = document.createElement('div');
    body.className = 'p-body';
    body.textContent = post.body;
    p.appendChild(body);
    this.scroll.appendChild(p);

    if (post.reply) {
      setTimeout(() => {
        const r = document.createElement('div');
        r.className = 'post reply';
        r.innerHTML = `<div class="p-head">${post.reply.no} 名無しの地形図好き ${post.reply.time} ID:???</div>`;
        const rb = document.createElement('div');
        rb.className = 'p-body';
        rb.textContent = post.reply.body;
        r.appendChild(rb);
        this.scroll.appendChild(r);
        this.scroll.scrollTop = this.scroll.scrollHeight;
      }, 2600);
    }
    this.scroll.scrollTop = this.scroll.scrollHeight;
    if (this.dot && this.root.classList.contains('hidden')) this.dot.classList.add('on');
  }

  clear() {
    this.scroll.innerHTML = '<div class="board-empty">両馬が何か書き込むまで、ここは静かです。</div>';
    this.empty = this.scroll.querySelector('.board-empty');
    this.count = 0;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (on && this.dot) this.dot.classList.remove('on');
  }
}
