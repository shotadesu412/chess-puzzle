// 書き出したプレイ履歴を分析する。
//
//   npm run analyze-log <書き出したJSONのパス>
//
// 画面の「プレイ履歴 → 書き出す」で出したファイルを読む。
//
// シミュレーションの「上手いプレイヤー」は作り物なので、実際の人間が
// どう指しているかはこれでしか分からない。特に見たいのは:
//   - 一番多く消せる手をどれくらい選べているか（＝伸びしろ）
//   - 1手にかける時間（＝1ゲームが実際に何分なのか。尺の逆算はここに乗っている）
//   - どのラウンドで落ちているか

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('使い方: npm run analyze-log <書き出したJSONのパス>');
  process.exit(1);
}

const dump = JSON.parse(readFileSync(path, 'utf8'));
const games = (dump.games ?? dump).filter((g) => g.end && g.turns.length > 0);

if (games.length === 0) {
  console.error('分析できるゲームがありません（1手も指していないゲームは記録されません）');
  process.exit(1);
}

const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] : 0);
const sum = (a) => a.reduce((t, x) => t + x, 0);
const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

const allTurns = games.flatMap((g) => g.turns);

// --- 全体 ---------------------------------------------------------------

console.log(`\n■ 全体（${games.length}ゲーム / ${allTurns.length}手）`);
const byMode = {};
for (const g of games) {
  (byMode[g.mode] ??= []).push(g);
}
const modeRows = {};
for (const [mode, list] of Object.entries(byMode)) {
  const turns = list.map((g) => g.end.turns);
  const secs = list.map((g) => sum(g.turns.map((t) => t.ms)) / 1000);
  modeRows[mode] = {
    'ゲーム': list.length,
    'ターン中央': q(turns, 0.5),
    '実時間の中央': `${(q(secs, 0.5) / 60).toFixed(1)}分`,
    '1手あたり': `${(sum(secs) / sum(turns)).toFixed(1)}秒`,
    'スコア中央': q(list.map((g) => g.end.score), 0.5).toLocaleString(),
    'スコア最高': Math.max(...list.map((g) => g.end.score)).toLocaleString(),
    '到達R中央': q(list.map((g) => g.end.round), 0.5),
  };
}
console.table(modeRows);
console.log('  ※「1手あたり」はシミュレーションで仮定した4.3秒の答え合わせ。ズレていたら尺を測り直すこと');

// --- 選択の質 -----------------------------------------------------------

console.log('\n■ 選択の質（一番多く消せる手を選べているか）');
const withChoice = allTurns.filter((t) => t.b > 0 && t.o > 0);
const tookBest = withChoice.filter((t) => t.n >= t.b);
const hadBetter = withChoice.filter((t) => t.b > t.n);

console.log(`  最善手を選べた   : ${pct(tookBest.length, withChoice.length)}`);
console.log(`  もっと消せた     : ${pct(hadBetter.length, withChoice.length)}`);
console.log(`  取りこぼしの中央 : ${q(hadBetter.map((t) => t.b - t.n), 0.5)}マス`);
console.log(`  1手番の選択肢中央: ${q(withChoice.map((t) => t.o), 0.5)}手`);

// 「選択肢が多いほど選べなくなる」かを見る
console.log('\n  選択肢の数ごとの最善手率:');
const buckets = [[1, 8], [9, 14], [15, 20], [21, 30], [31, 999]];
for (const [lo, hi] of buckets) {
  const inBucket = withChoice.filter((t) => t.o >= lo && t.o <= hi);
  if (inBucket.length < 5) continue;
  const best = inBucket.filter((t) => t.n >= t.b).length;
  const label = hi === 999 ? `${lo}手以上` : `${lo}〜${hi}手`;
  console.log(`    ${label.padEnd(10)} ${pct(best, inBucket.length).padStart(6)}  (${inBucket.length}手番)`);
}

// --- 考える時間 ---------------------------------------------------------

console.log('\n■ 1手にかけた時間');
const ms = allTurns.map((t) => t.ms);
console.log(`  中央 ${(q(ms, 0.5) / 1000).toFixed(1)}秒 / 上位25% ${(q(ms, 0.75) / 1000).toFixed(1)}秒 / 上位10% ${(q(ms, 0.9) / 1000).toFixed(1)}秒`);
const slow = allTurns.filter((t) => t.ms > 10000);
console.log(`  10秒以上かかった手: ${pct(slow.length, allTurns.length)}（ヒントが出る手）`);

// --- 終わり方 -----------------------------------------------------------

console.log('\n■ 終わり方');
const why = {};
for (const g of games) why[g.end.why] = (why[g.end.why] ?? 0) + 1;
const label = { quota: 'ノルマ未達', stuck: '手詰まり', quit: '途中でやめた' };
for (const [k, n] of Object.entries(why)) {
  console.log(`  ${(label[k] ?? k).padEnd(12)} ${pct(n, games.length)} (${n}ゲーム)`);
}

const died = games.filter((g) => g.end.why === 'quota');
if (died.length > 0) {
  console.log('\n  落ちたラウンドの分布:');
  const rounds = {};
  for (const g of died) rounds[g.end.round] = (rounds[g.end.round] ?? 0) + 1;
  for (const r of Object.keys(rounds).map(Number).sort((a, b) => a - b)) {
    console.log(`    ラウンド${String(r).padStart(2)} ${'█'.repeat(Math.round((rounds[r] / died.length) * 40))} ${pct(rounds[r], died.length)}`);
  }
}

// --- レア役 -------------------------------------------------------------

console.log('\n■ レア役');
const royals = { royal: 0, queens: 0, kings: 0 };
for (const t of allTurns) if (t.k) royals[t.k]++;
const royalLabel = { royal: '♛♚ ロイヤル', queens: '♛ クイーンロイヤル', kings: '♚ キングロイヤル' };
for (const [k, n] of Object.entries(royals)) {
  const per = n === 0 ? '—' : `${(games.length / n).toFixed(1)}ゲームに1回`;
  console.log(`  ${royalLabel[k].padEnd(20)} ${String(n).padStart(4)}回  ${per}`);
}

// --- 駒の使い方 ---------------------------------------------------------

console.log('\n■ 動かした駒');
const pieces = {};
for (const t of allTurns) pieces[t.p] = (pieces[t.p] ?? 0) + 1;
for (const [type, n] of Object.entries(pieces).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(8)} ${pct(n, allTurns.length).padStart(6)} (${n}手)`);
}

const colors = {};
for (const t of allTurns) colors[t.c] = (colors[t.c] ?? 0) + 1;
console.log(`\n  白 ${pct(colors.white ?? 0, allTurns.length)} / 黒 ${pct(colors.black ?? 0, allTurns.length)}`);
console.log('  ※ 大きく偏っていたら「白も黒も動かせる」が伝わっていない可能性がある');

// --- 連鎖 ---------------------------------------------------------------

console.log('\n■ 連鎖');
const chains = {};
for (const t of allTurns) chains[t.ch] = (chains[t.ch] ?? 0) + 1;
for (const c of Object.keys(chains).map(Number).sort((a, b) => a - b)) {
  if (c === 0) continue;
  console.log(`  ${c}連鎖 ${pct(chains[c], allTurns.length).padStart(6)}`);
}
console.log();
