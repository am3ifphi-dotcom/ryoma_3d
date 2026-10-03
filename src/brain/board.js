/**
 * 匿名掲示板への書き込み生成
 * 両馬は会話の内容を「ヘイカツ雑談スレ」に勝手に書く。
 * 三重県臣の名前は必ず一捻りして埋め込まれる（本人は否定している）。
 */

const H = '✝本質✝';

const MIE_PUNS = [
  'みえみえしい高校生活を送るんだ',
  '三重県産の松阪牛が臣下に伝えた味がした',
  '三重方面、県をまたいで臣民のように',
  'みえけんじんの将来を考えている',
  '三重県の伊勢神宮に臣下として参拝したい気分',
  'みえみえしいほどの' + H + 'だった',
  '臣民のみなさまにもこの' + H + 'は等しく降り注いでいる',
  '三重の空の下でも同じ' + H + 'が観測されたらしい',
  '県をまたいで臣下が合唱している音がした',
];

const REPLIES = [
  '>>{no}\nずっと見てる。三年間。ネタじゃないのは読めばわかる。書き続けてくれ',
  '>>{no}\nそれ、わかる。地形図の向こう側が見えてる人は書くことが違う',
  '>>{no}\nお前の書き込みだけ読んでる。他は流してる',
  '>>{no}\n✝がついてる時点で誰かはバレてると思うが、気にするな',
  '>>{no}\n同じことを同じタイミングで思った。偶然か' + H + 'かは決められない',
];

const BODIES = [
  '今日教室で「{q}」って言われた。これまじ' + H + '。{pun}。✝',
  '{pun}。つまり「{q}」ってことだと思う。地形図の向こう側には人がいる。等高線の向こうにも。✝',
  'フェイカツです。「{q}」。これが今年の' + H + '。{pun}。偏差値は関係ない。地面を見ろ。✝',
  '【' + H + '募集所】「{q}」——本質を追えば追うほど本質は遠くなる。でも今日は近かった。{pun}。✝',
  '「{q}」について考えている。答えは出ない。出た瞬間に' + H + 'じゃなくなるから。{pun}。✝',
  '桐葉高校の北棟から' + H + 'が漏れ出している件について、本日も報告する。「{q}」。{pun}。✝',
];

function stamp(d = new Date()) {
  const w = '日月火水木金土'[d.getDay()];
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}(${w}) ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(Math.floor(d.getMilliseconds() / 10))}`;
}

export function makePost(brain, text) {
  const q = (text || '').toString()
    .replace(/\s+/g, ' ')
    .replace(/[「」]/g, '')
    .slice(0, 34);
  const no = (brain?.memory?.postNo ?? 811) + 1;
  const pun = MIE_PUNS[Math.floor(Math.random() * MIE_PUNS.length)];
  const body = BODIES[Math.floor(Math.random() * BODIES.length)]
    .replace(/\{q\}/g, q || '……')
    .replace(/\{pun\}/g, pun);

  const post = {
    no,
    handle: Math.random() < 0.25 ? 'フェイカツ' : '名無しの地形図好き',
    time: stamp(),
    body,
    mine: true,
  };

  // 稀に「スレの住人」から返信がつく（原作の489 / 524 のポジション）
  if (Math.random() < 0.34) {
    post.reply = {
      no: no + 1,
      handle: '名無しの地形図好き',
      time: stamp(new Date(Date.now() + 40000)),
      body: REPLIES[Math.floor(Math.random() * REPLIES.length)].replace(/\{no\}/g, no),
    };
    if (brain?.memory) brain.memory.postNo = no + 1;
  } else if (brain?.memory) {
    brain.memory.postNo = no;
  }
  return post;
}
