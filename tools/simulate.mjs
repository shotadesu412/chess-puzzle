// 大量に自動プレイして、スコアの分布とレア役の発生率を調べる。
//
//   npm run simulate            # 2000ゲーム x 40ターン
//   npm run simulate 5000 40
//
// 「上手いプレイヤー」を想定し、毎ターン一番多く消せる手を選ぶ。
//
// 1ゲームの終わり方（本来の終了条件はまだ未実装なので、ここでの便宜的な定義）:
//   - 指定ターン数（既定40）を指したら終了
//   - 消せる手が1つも無くなったら、その時点で打ち切り
// スコアはターン数にほぼ比例するので、ターン数を変えたら数字も変わる。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { movableSquares } from '../src/moves.js';

import { GROUP_KIND } from '../src/score.js';

/** ノルマ判定を無効化する設定（このツールでは終了条件を測らないため） */
const NO_QUOTA = { quotaBase: 0, quotaGrowth: 1 };

const GAMES = Number(process.argv[2] ?? 2000);
const TURNS = Number(process.argv[3] ?? 40);

/**
 * その手で何マス消えるか。0なら消えない。
 * 駒を置いた先の行と列だけ先に調べて、消えない手は早く弾く（全体走査は重いため）。
 */
function clearedBy(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(b, move.to.r, move.to.c)) return 0;
  return findMatches(b).length;
}

function bestMoves(board) {
  let best = 0;
  let picks = [];
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of movableSquares(board, { r, c })) {
        const move = { from: { r, c }, to };
        const cleared = clearedBy(board, move);
        if (cleared === 0) continue;
        if (cleared > best) { best = cleared; picks = [move]; }
        else if (cleared === best) picks.push(move);
      }
    }
  }
  return picks;
}

const scores = [];
const windowSums = { 5: [], 10: [] };
const royalCounts = { [GROUP_KIND.Royal]: 0, [GROUP_KIND.Queens]: 0, [GROUP_KIND.Kings]: 0 };
const royalPoints = { [GROUP_KIND.Royal]: 0, [GROUP_KIND.Queens]: 0, [GROUP_KIND.Kings]: 0 };
let totalTurns = 0;
let stuck = 0;
const chainCounts = new Map(); // 連鎖数 -> その連鎖で終わった手の数
const gameMaxChains = [];

for (let g = 0; g < GAMES; g++) {
  // ノルマは無効化し、「40ターン指しきる」前提で分布を測る
  const game = createGame(Math.random, NO_QUOTA);
  const perTurn = [];
  for (let t = 0; t < TURNS; t++) {
    const picks = bestMoves(game.board);
    if (picks.length === 0) { stuck++; break; }
    const move = picks[Math.floor(Math.random() * picks.length)];
    const before = game.score;
    const result = applyMove(game, move.from, move.to);
    perTurn.push(game.score - before);
    totalTurns++;
    chainCounts.set(result.chain, (chainCounts.get(result.chain) ?? 0) + 1);
    for (const phase of result.phases) {
      if (phase.kind === 'clear' && phase.royalKind) royalPoints[phase.royalKind] += phase.points;
    }
  }
  gameMaxChains.push(game.maxChain);
  for (const kind of Object.keys(royalCounts)) royalCounts[kind] += game.royalMatches[kind];
  scores.push(game.score);
  for (const n of [5, 10]) {
    for (let i = 0; i + n <= perTurn.length; i += n) {
      windowSums[n].push(perTurn.slice(i, i + n).reduce((s, x) => s + x, 0));
    }
  }
  if ((g + 1) % 500 === 0) process.stderr.write(`  ${g + 1}/${GAMES} ゲーム完了\n`);
}

const sorted = [...scores].sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const mean = scores.reduce((s, x) => s + x, 0) / scores.length;

console.log(`\n=== ${GAMES}ゲーム x ${TURNS}ターン (${totalTurns}ターン) ===`);
console.log(`手詰まり: ${stuck} 回\n`);

console.log('1ゲームのスコア分布:');
for (const [label, p] of [['最低', 0], ['下位10%', 0.1], ['下位25%', 0.25], ['中央値', 0.5], ['上位25%', 0.75], ['上位10%', 0.9], ['上位1%', 0.99]]) {
  console.log(`  ${label.padEnd(8)}: ${q(p).toLocaleString()}`);
}
console.log(`  ${'最高'.padEnd(8)}: ${sorted.at(-1).toLocaleString()}`);
console.log(`  ${'平均'.padEnd(8)}: ${Math.round(mean).toLocaleString()}  (中央値の ${(mean / q(0.5)).toFixed(2)} 倍)`);

console.log('\n連鎖（コンボ）:');
{
  const chains = [...chainCounts.entries()].sort((a, b) => a[0] - b[0]);
  const moves = chains.reduce((s, [, n]) => s + n, 0);
  const cleared = chains.filter(([c]) => c > 0);
  const clearedMoves = cleared.reduce((s, [, n]) => s + n, 0);
  const weighted = cleared.reduce((s, [c, n]) => s + c * n, 0);

  console.log(`  平均連鎖（消えた手のみ）: ${(weighted / clearedMoves).toFixed(2)}`);
  console.log(`  平均連鎖（全ターン）    : ${(weighted / moves).toFixed(2)}`);
  console.log(`  最大連鎖                : ${Math.max(...chains.map(([c]) => c))}`);

  console.log('  内訳:');
  for (const [chain, n] of chains) {
    const label = chain === 0 ? '消えず' : `${chain}連鎖`;
    const pct = (n / moves) * 100;
    if (pct < 0.005) continue;
    console.log(`    ${label.padEnd(7)}: ${pct.toFixed(2).padStart(6)}%  ${'#'.repeat(Math.round(pct / 2))}`);
  }

  const maxSorted = [...gameMaxChains].sort((a, b) => a - b);
  const mq = (p) => maxSorted[Math.floor(maxSorted.length * p)];
  console.log(`  1ゲーム中の最大連鎖: 中央 ${mq(0.5)} / 上位10% ${mq(0.9)} / 上位1% ${mq(0.99)} / 最高 ${maxSorted.at(-1)}`);
}

console.log('\nレア役の発生:');
const totalRoyalPoints = Object.values(royalPoints).reduce((s, x) => s + x, 0);
const totalScore = scores.reduce((s, x) => s + x, 0);
for (const kind of [GROUP_KIND.Royal, GROUP_KIND.Queens, GROUP_KIND.Kings]) {
  const n = royalCounts[kind];
  const perGame = n / GAMES;
  console.log(
    `  ${kind.padEnd(7)}: ${String(n).padStart(4)}回  ` +
    `${perGame > 0 ? `${(1 / perGame).toFixed(0)}ゲームに1回` : '発生なし'}  ` +
    `スコア寄与 ${((royalPoints[kind] / totalScore) * 100).toFixed(1)}%`
  );
}
console.log(`  レア役の合計スコア寄与: ${((totalRoyalPoints / totalScore) * 100).toFixed(1)}%`);

console.log(`\nレア役を除いた実力ぶんの目安（中央値）: ${q(0.5).toLocaleString()}`);

console.log('\nノルマ設計用（連続Nターンの合計スコア）:');
for (const n of [5, 10]) {
  const w = [...windowSums[n]].sort((a, b) => a - b);
  const wq = (p) => w[Math.floor(w.length * p)];
  console.log(`  ${n}ターン: 下位10% ${wq(0.1)} / 下位25% ${wq(0.25)} / 中央 ${wq(0.5)} / 上位25% ${wq(0.75)} / 上位10% ${wq(0.9)}`);
}
