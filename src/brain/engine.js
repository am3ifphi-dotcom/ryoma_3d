import {
  INTENTS, FALLBACKS, SHORT_REPLIES, EMPTY_REPLIES,
  REACTIONS, IDLE_LINES, CAMEOS, SCORE_COMMENTS,
} from './lexicon.js';
import { makePost } from './board.js';

const H = '✝本質✝';

/** 全角→半角・小文字化・記号除去 */
function normalize(s) {
  return (s || '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　\s]+/g, '')
    .toLowerCase();
}

export class RyomaBrain {
  constructor() {
    this.memory = {
      name: null,
      turn: 0,
      topics: [],
      recentLines: [],
      usedIntents: [],
      postNo: 811,
      honshitsuCount: 0,
      lastUserText: '',
    };
    this.chance = (p) => Math.random() < p;
  }

  /** ランダム選択（直近の繰り返しを避ける） */
  pick(list, key = '') {
    if (!list || !list.length) return '';
    const recent = this.memory.recentLines;
    let pool = list.filter((x) => !recent.includes(key + '::' + x));
    if (!pool.length) pool = list;
    const v = pool[Math.floor(Math.random() * pool.length)];
    recent.push(key + '::' + v);
    if (recent.length > 40) recent.splice(0, recent.length - 40);
    return v;
  }

  cleanName(raw) {
    return (raw || '')
      .replace(/^(俺|私|僕|おれ|わたし|ぼく|あたし|自分|おいら)(は|が|って|っていう)?/u, '')
      .replace(/(です|だよ|だな|だ|といいます|っていいます|と申します|もうします|って呼んで|って呼ばれてる|って呼ばれて|っていう|という|と名乗|でーす|ですわ)$/u, '')
      .replace(/[、。，．,.!！?？\s]+$/u, '')
      .trim();
  }

  rememberName(text, loose = false) {
    const stop = /^(俺|私|僕|おれ|わたし|ぼく|あたし|お前|あなた|君|名前|何|なに|なん|なんで|どう|そう|はい|うん|いや|は|が|を|に|も|の|で|と|か|よ|ね|です)$/u;
    let cand = null;
    const m = text.match(/名前(?:は|、|って)?\s*([^、。，,.\s!！?？]{1,10})/u)
      || text.match(/([^、。，,.\s!！?？]{1,10})(?:です|といいます|っていいます|と申します|って呼んで|って呼ばれて)(?:[、。！!？?]|$)/u);
    if (m) cand = this.cleanName(m[1]);
    if (loose && !cand) cand = this.cleanName(text);
    if (cand && cand.length >= 1 && cand.length <= 10 && !stop.test(cand)) {
      this.memory.name = cand;
      return cand;
    }
    return this.memory.name;
  }

  /** 話題（「〜についてどう思う？」の〜）を抜き出す */
  extractTopic(text) {
    const patterns = [
      /(.+?)(について|に関して|ってどう|はどう|をどう|ってどう思う|についてどう)/,
      /(.+?)(って|とは|というのは)(なに|何|どう|どうな)/,
      /(.+?)の(本質|ほんしつ)/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) {
        let t = m[1].trim()
          .replace(/^(ねえ|なあ|おい|ちょっと|あの|その|でも|ところで|そういえば)/, '')
          .replace(/[、。！？!?…ー〜~]+$/, '')
          .replace(/^(って|とは)$/, '');
        t = t.replace(/^(この|その|あの)/, '');
        if (t.length >= 1 && t.length <= 24) return t;
      }
    }
    return null;
  }

  /** 本質度：0〜100。ゆるい指標 */
  scoreHonshitsu(text, norm) {
    let s = 18 + Math.random() * 14;
    const add = (re, v, limit = 1) => {
      const m = norm.match(re);
      if (m) s += v * Math.min(limit, m.length);
    };
    if (/本質|ほんしつ/.test(norm)) s += 28;
    if (/✝/.test(text)) s += 14;
    add(/[？?]/g, 6, 2);
    if (text.length > 18) s += 8;
    if (text.length > 40) s += 6;
    add(/(なぜ|どうして|なんで|どうやって|意味|理由)/g, 7, 2);
    add(/(感じ|思う|気がする|心|人生|世界|時間|記憶|孤独|意味)/g, 6, 3);
    add(/(地形図|等高線|地図|地理|ヘイカツ|味噌|河岸段丘|地質)/g, 9, 2);
    add(/(コーンスープ|自販機|電線|窓|夜道|山|稜線|雨)/g, 8, 2);
    add(/(二郎|ラーメン|乳化|麺)/g, 8, 1);
    add(/(三重|みえ|臣|冷笑)/g, 7, 1);
    add(/(笑|www|ｗ)/g, 3, 3);
    if (/^[\s　]*$/.test(text)) s = 0;
    if (text.length <= 3 && !/本質|✝/.test(text)) s = Math.min(s, 22);
    s += (Math.random() - 0.5) * 14;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  scoreComment(score) {
    return SCORE_COMMENTS.find((c) => score >= c.min).text;
  }

  /** メインの応答生成 */
  reply(rawText) {
    const text = (rawText ?? '').toString().trim();
    const norm = normalize(text);
    this.memory.turn += 1;
    this.memory.lastUserText = text;

    if (!text) {
      return this.build([this.pick(EMPTY_REPLIES, 'empty')], { score: 0, intent: 'empty' });
    }

    // ── 名前を聞いた直後は、短い返事をそのまま名前として受け取る
    if (this.memory.askingName) {
      this.memory.askingName = false;
      const n = text.length <= 14 ? this.rememberName(text, true) : null;
      if (n) {
        return this.build([this.pick([
          `${n}、覚えた。${n}の${H}、そのうち掲示板に書くかもしれない`,
          `おう、${n}。名前があると${H}が呼びやすくなる`,
          `${n}か。いい名前だ。${H}に合う`,
        ], 'gotname')], { score: this.scoreHonshitsu(text, norm), intent: 'username' });
      }
    }

    // ── intent 判定
    const topic = this.extractTopic(text);
    const ctx = { text, norm, topic, brain: this };
    const scored = [];
    for (const it of INTENTS) {
      // 長いキーワードほど強い（部分一致の誤爆を緩和）
      let w = 0;
      let hit = false;
      for (const k of it.kw) {
        const nk = normalize(k);
        if (norm.includes(nk)) { hit = true; w += Math.min(1, nk.length / 3); }
      }
      if (!hit) continue;
      // 「〜についてどう思う？」の話題そのものに触れる intent を優先する
      if (topic) {
        const nt = normalize(topic);
        if (it.kw.some((k) => nt.includes(normalize(k)) || normalize(k).includes(nt))) w += 1.3;
      }
      scored.push({ it, w: w * it.w + Math.random() * 0.25 });
    }
    scored.sort((a, b) => b.w - a.w);

    let chosen = null;
    if (scored.length) {
      // 直近と同じ intent は少し減点して会話の硬直を防ぐ
      const used = this.memory.usedIntents;
      for (const s of scored) {
        const last = used[used.length - 1] === s.it.id;
        const near = used.slice(-3).includes(s.it.id);
        s.w *= last ? 0.82 : near ? 0.92 : 1;
      }
      scored.sort((a, b) => b.w - a.w);
      chosen = scored[0].it;
    }

    let lines;
    let cands = null;
    let intentId = 'fallback';
    let forceBoard = false;

    if (chosen) {
      intentId = chosen.id;
      const out = chosen.react(ctx);
      // 配列の入れ子 = 続けて言う台詞。そうでなければ候補から 1〜2 本選ぶ
      if (Array.isArray(out) && Array.isArray(out[0])) {
        lines = out[Math.floor(Math.random() * out.length)].slice();
      } else {
        cands = Array.isArray(out) ? out.slice() : [out];
        lines = [this.pick(cands, chosen.id)];
      }
      if (chosen.board) forceBoard = true;
      this.memory.usedIntents.push(intentId);
      if (this.memory.usedIntents.length > 12) this.memory.usedIntents.shift();
    } else {
      lines = [this.pick(FALLBACKS, 'fallback')];
      if (text.length <= 4 && this.chance(0.45)) lines = [this.pick(SHORT_REPLIES, 'short')];
    }

    // ── 相槌を前置きするか、もう一言足すか（どちらか一方）
    const kind = /[？?]$/.test(text) || /(どう|なぜ|なに|何|いつ|だれ|誰|教えて)/.test(norm)
      ? 'question'
      : (/本質|✝|すご|やば/.test(norm) ? 'strong' : 'mild');
    if (lines.length === 1 && this.chance(kind === 'strong' ? 0.45 : 0.24)) {
      const r = this.pick(REACTIONS[kind], 'react:' + kind);
      if (r && !lines.includes(r)) lines.unshift(r);
    } else if (cands && lines.length === 1 && cands.length > 1 && this.chance(0.4)) {
      const second = this.pick(cands, chosen.id);
      if (!lines.includes(second)) lines.push(second);
    }

    // ── 話題つきテンプレの埋め込み
    lines = lines.map((l) => l.replace(/\{topic\}/g, topic || 'それ'));

    // ── 名前を覚えていたら時々呼ぶ
    if (this.memory.name && this.chance(0.2)) {
      lines[0] = `${this.memory.name}、` + lines[0];
    }

    const score = this.scoreHonshitsu(text, norm);
    if (score >= 70) this.memory.honshitsuCount += 1;

    return this.build(lines, {
      score,
      intent: intentId,
      topic,
      board: forceBoard || (score >= 72 && this.chance(0.3)) || (this.chance(0.08)),
      cameo: this.chance(0.13) ? this.pick(CAMEOS, 'cameo') : null,
    });
  }

  build(lines, opt) {
    const score = opt.score ?? 40;
    let board = null;
    if (opt.board) {
      board = makePost(this, opt.topic || this.memory.lastUserText);
      this.memory.postNo = board.no;
    }
    return {
      lines,
      score,
      scoreComment: this.scoreComment(score),
      board,
      cameo: opt.cameo || null,
      intent: opt.intent,
      burst: lines.some((l) => l.includes(H)) || (board ? true : false),
    };
  }

  idle() {
    const l = this.pick(IDLE_LINES, 'idle');
    return { lines: [l], score: null, board: null, cameo: null, intent: 'idle', burst: l.includes(H) };
  }

  /** 開幕の一言 */
  opening() {
    return {
      lines: [
        `おう。座れ。`,
        `ここが北棟の理数科B組。窓の真横が室外機だから、冷房つけると授業の声とダブルで聞こえる。`,
        `俺は両馬二郎。二郎系週三で、${H}を撒いて生きてる。何でも聞け。答えは出ないけどな`,
      ],
      score: null, board: null, cameo: null, intent: 'opening', burst: true,
    };
  }
}
