import { RyomaBrain } from '../src/brain/engine.js';

const inputs = [
  'こんにちは',
  'お前誰？',
  '✝本質✝って何？',
  '本質についてどう思う？',
  'ヘイカツの授業、やばかった',
  '地理の授業で味噌の話をしたんだって？',
  '三重の名前、まだ埋めてる？',
  '二郎系ラーメン、うまいよな',
  'コーンスープが戻ってきた',
  'うちの学校、偏差値どのくらい？',
  '数学が全然わからない',
  '寺地の配信、どうなった？',
  '零ってすごいよな',
  '伊豆見についてどう思う？',
  '好きな人がいるんだ',
  '窓の外、見た？',
  '疲れた',
  'うるさい',
  'お前すごいな',
  'ありがとう',
  'またね',
  '掲示板に書いて',
  '俺の名前は田中です',
  '今日は雨だね',
  'そういう考え方もあるよね',
  'はい',
  '',
  '最近、将来のことが不安で眠れない。何のために勉強してるのかわからなくなる',
  '球体の体積の公式ってどうやって証明するの？',
  'ハワイ行きたい',
];

const brain = new RyomaBrain();
for (const q of inputs) {
  const r = brain.reply(q);
  console.log('─'.repeat(70));
  console.log(`YOU  : ${q || '(無言)'}`);
  if (r.score != null) console.log(`       [本質度 ${r.score}] ${r.scoreComment}  (intent=${r.intent})`);
  for (const l of r.lines) console.log(`両馬 : ${l}`);
  if (r.board) {
    console.log(`掲示板: ${r.board.no} ${r.board.handle} ${r.board.time}`);
    console.log(r.board.body.split('\n').map((s) => '        ' + s).join('\n'));
    if (r.board.reply) {
      console.log(`        >> ${r.board.reply.no} ${r.board.reply.handle}`);
      console.log(r.board.reply.body.split('\n').map((s) => '        ' + s).join('\n'));
    }
  }
  if (r.cameo) console.log(`${r.cameo.who}: ${r.cameo.lines[0]}`);
}
