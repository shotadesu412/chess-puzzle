// 1つのモードを深く分析して、ボトルネックを洗い出す。
//
//   npm run analyze                      # 6×6を1000ゲーム
//   npm run analyze compact 3000
//   npm run analyze compact 3000 1500    # ノルマの上限を1500にして試す
//
// 見たいこと:
//   - どのラウンドで死ぬか / 死因は何か（ノルマ未達か手詰まりか）
//   - ラウンドごとの難易度カーブ（必要な点と実際に取れる点の差）
//   - 1ターンの選択肢の量（多すぎると探すのが作業になる）
//   - スコアがどこから来ているか（実力ぶんか、連鎖の運か、レア役か）
//   - 腕の差がラウンド数に出ているか

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { findRoyalChances } from '../src/hints.js';
import { VARIANTS } from '../src/rules.js';
import { GROUP_KIND } from '../src/score.js';

const variant = VARIANTS[process.argv[2] ?? 'compact'] ?? VARIANTS.compact;
const GAMES = Number(process.argv[3] ?? 1000);
const QUOTA_MAX = Number(process.argv[4] ?? 0); // 0 なら上限なし
// 第5引数に off を渡すとレア役の巻き戻しを無効化して比較できる
const REWIND = process.argv[5] === 'off' ? { royal: 0, queens: 0, kings: 0 } : undefined;
const MAX_TURNS = 600;

/** その手で何マス消えるか。0なら消えない */
function clearedBy(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(b, move.to.r, move.to.c)) return 0;
  return findMatches(b).length;
}

/** その盤面の全ての合法手と、消せる手を返す */
function scanMoves(board) {
  const size = board.length;
  const legal = [];
  const scoring = [];
  let best = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of movableSquares(board, { r, c })) {
        const move = { from: { r, c }, to };
        legal.push(move);
        const cleared = clearedBy(board, move);
        if (cleared === 0) continue;
        scoring.push({ move, cleared });
        if (cleared > best) best = cleared;
      }
    }
  }
  return { legal, scoring, best };
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 1ゲーム遊ぶ。
 * policy:
 *   skilled … 一番多く消せる手（従来の「上手いプレイヤー」）
 *   hunter  … レア役が決まるならそれを最優先（リーチ表示を見て狙うプレイヤー）
 *   casual  … 消せる手からランダム
 *   novice  … 合法手からランダム
 */
function playGame(policy, collect) {
  const game = createGame(Math.random, {
    variant,
    quotaMax: QUOTA_MAX,
    ...(REWIND ? { royalRewind: REWIND } : {}),
  });
  let turns = 0;
  let earnedThisRound = 0;

  while (!game.over && turns < MAX_TURNS) {
    const { legal, scoring, best } = scanMoves(game.board);
    if (legal.length === 0) return { game, turns, cause: '手詰まり(動かせない)' };

    collect?.turn?.({ legal: legal.length, scoring: scoring.length, best, round: game.round });

    let move;
    if (policy === 'hunter') {
      const chances = findRoyalChances(game.board);
      if (chances.length > 0) move = pick(chances);
    }
    if (move) { /* レア役を優先 */ }
    else if (policy === 'novice') move = pick(legal);
    else if (scoring.length === 0) {
      collect?.noScoring?.();
      move = pick(legal);
    } else if (policy === 'casual') move = pick(scoring).move;
    else move = pick(scoring.filter((e) => e.cleared === best)).move;

    const result = applyMove(game, move.from, move.to);
    turns++;
    earnedThisRound += result.gained;
    collect?.move?.(result);

    if (result.check) {
      collect?.round?.({
        round: result.check.round,
        target: result.check.target,
        earned: earnedThisRound,
        total: result.check.roundScore,
        passed: result.check.passed,
      });
      earnedThisRound = 0;
    }
  }
  return { game, turns, cause: game.over ? 'ノルマ未達' : '打ち切り' };
}

// ---------------- 集計 ----------------

const stat = (arr) => {
  if (!arr.length) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: arr.length,
    avg: arr.reduce((t, x) => t + x, 0) / arr.length,
    p10: q(0.1), median: q(0.5), p90: q(0.9), max: s.at(-1),
  };
};

const rounds = [];
const turnCounts = [];
const scores = [];
const causes = {};
const legalCounts = [];
const scoringCounts = [];
const bestCounts = {};
const chainCounts = {};
const sizePoints = {};   // 消したマス数 -> 得点合計
const chainPoints = { '1連鎖目(実力)': 0, '2連鎖目以降(運)': 0 };
const royalPoints = {};
const royalCounts = {};
const perRound = {};     // ラウンド番号 -> { 到達, 突破, 稼いだ点[] }
let noScoringTurns = 0;
let totalPoints = 0;
const rewinds = [];

const collect = {
  turn({ legal, scoring, best, round }) {
    legalCounts.push(legal);
    scoringCounts.push(scoring);
    bestCounts[best] = (bestCounts[best] ?? 0) + 1;
    perRound[round] ??= { reached: 0, passed: 0, earned: [] };
  },
  noScoring() { noScoringTurns++; },
  move(result) {
    chainCounts[result.chain] = (chainCounts[result.chain] ?? 0) + 1;
    for (const phase of result.phases) {
      if (phase.rewind) rewinds.push(phase.rewind.from - phase.rewind.to);
    }
    for (const phase of result.phases) {
      if (phase.kind !== 'clear') continue;
      for (const group of phase.groups) {
        totalPoints += group.points;
        const key = group.cells.length >= 5 ? '5マス以上' : `${group.cells.length}マス`;
        sizePoints[key] = (sizePoints[key] ?? 0) + group.points;
        chainPoints[phase.chain === 1 ? '1連鎖目(実力)' : '2連鎖目以降(運)'] += group.points;
        if (group.kind !== GROUP_KIND.Normal) {
          royalPoints[group.kind] = (royalPoints[group.kind] ?? 0) + group.points;
          royalCounts[group.kind] = (royalCounts[group.kind] ?? 0) + 1;
        }
      }
    }
  },
  round({ round, earned, passed }) {
    perRound[round] ??= { reached: 0, passed: 0, earned: [] };
    perRound[round].reached++;
    perRound[round].earned.push(earned);
    if (passed) perRound[round].passed++;
  },
};

process.stderr.write(`${variant.name} を ${GAMES} ゲーム分析中...\n`);
for (let g = 0; g < GAMES; g++) {
  const { game, turns, cause } = playGame(process.env.POLICY ?? 'skilled', collect);
  rounds.push(game.round);
  turnCounts.push(turns);
  scores.push(game.score);
  causes[cause] = (causes[cause] ?? 0) + 1;
  if ((g + 1) % 500 === 0) process.stderr.write(`  ${g + 1}/${GAMES}\n`);
}

// 腕の差（ゲーム数は控えめ）
const skillGames = Math.max(200, Math.round(GAMES / 5));
const byPolicy = {};
for (const policy of ['skilled', 'casual', 'novice']) {
  const r = [], t = [];
  for (let g = 0; g < skillGames; g++) {
    const { game, turns } = playGame(policy);
    r.push(game.round); t.push(turns);
  }
  byPolicy[policy] = { round: stat(r), turns: stat(t) };
}

// ---------------- 出力 ----------------

const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;
const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log(`\n=== ${variant.name}${QUOTA_MAX ? ` / ノルマ上限 ${QUOTA_MAX}` : ''} / ${GAMES}ゲーム (${turnCounts.reduce((a, b) => a + b, 0).toLocaleString()}ターン) ===`);

console.log('\n■ ゲームの終わり方');
{
  const r = stat(rounds), t = stat(turnCounts), s = stat(scores);
  line('到達ラウンド', `下位10% ${r.p10} / 中央 ${r.median} / 上位10% ${r.p90} / 最高 ${r.max}`);
  line('総ターン数', `下位10% ${t.p10} / 中央 ${t.median} / 上位10% ${t.p90} / 最高 ${t.max}`);
  line('最終スコア', `中央 ${s.median.toLocaleString()} / 上位10% ${s.p90.toLocaleString()} / 最高 ${s.max.toLocaleString()}`);
  for (const [cause, n] of Object.entries(causes)) line(`死因: ${cause}`, pct(n, GAMES));
}

console.log('\n■ ラウンドごとの難易度カーブ');
console.log('  R   ノルマ   到達数   突破率   そのRで稼いだ点(中央)   余裕');
for (const key of Object.keys(perRound).map(Number).sort((a, b) => a - b)) {
  const info = perRound[key];
  if (!info.reached) continue;
  const raw = Math.round(variant.rules.quotaBase * 1.15 ** (key - 1));
  const target = QUOTA_MAX > 0 ? Math.min(raw, QUOTA_MAX) : raw;
  const earned = stat(info.earned);
  const margin = earned.median ? (earned.median / target) : 0;
  console.log(
    `  ${String(key).padStart(2)}  ${String(target).padStart(6)}  ${String(info.reached).padStart(6)}  ` +
    `${pct(info.passed, info.reached).padStart(7)}  ${String(earned.median ?? 0).padStart(18)}   ${margin.toFixed(2)}倍`
  );
  if (key >= 20) break;
}

console.log('\n■ 1ターンの選択肢');
{
  const l = stat(legalCounts), s = stat(scoringCounts);
  line('合法手', `中央 ${l.median} (下位10% ${l.p10} / 上位10% ${l.p90})`);
  line('うち消せる手', `中央 ${s.median} (下位10% ${s.p10} / 上位10% ${s.p90})`);
  line('消せる手が0のターン', pct(noScoringTurns, legalCounts.length));
  const total = Object.values(bestCounts).reduce((a, b) => a + b, 0);
  const dist = Object.keys(bestCounts).map(Number).sort((a, b) => a - b)
    .map((k) => `${k}マス ${pct(bestCounts[k], total)}`).join(' / ');
  line('最大何マス消せるか', dist);
}

console.log('\n■ スコアの内訳');
for (const [k, v] of Object.entries(sizePoints).sort()) line(k, pct(v, totalPoints));
for (const [k, v] of Object.entries(chainPoints)) line(k, pct(v, totalPoints));
for (const kind of Object.keys(royalCounts)) {
  line(`レア役 ${kind}`, `${pct(royalPoints[kind], totalPoints)} (${(GAMES / royalCounts[kind]).toFixed(0)}ゲームに1回)`);
}

if (rewinds.length) {
  console.log('\n■ レア役によるノルマの巻き戻し');
  const r = stat(rewinds);
  line('発生回数', `${rewinds.length} 回 (${(GAMES / rewinds.length).toFixed(1)}ゲームに1回)`);
  line('巻き戻したラウンド数', `中央 ${r.median} / 平均 ${r.avg.toFixed(1)} / 最大 ${r.max}`);
}

console.log('\n■ 連鎖');
{
  const total = Object.values(chainCounts).reduce((a, b) => a + b, 0);
  const keys = Object.keys(chainCounts).map(Number).sort((a, b) => a - b);
  const weighted = keys.reduce((t, k) => t + k * chainCounts[k], 0);
  line('平均連鎖', (weighted / total).toFixed(2));
  line('最大連鎖', Math.max(...keys));
  line('分布', keys.filter((k) => chainCounts[k] / total >= 0.001)
    .map((k) => `${k}:${pct(chainCounts[k], total)}`).join(' '));
}

console.log(`\n■ 腕の差（各${skillGames}ゲーム）`);
console.log('  プレイヤー   到達ラウンド(中央)   ターン数(中央)');
for (const [policy, v] of Object.entries(byPolicy)) {
  const label = { skilled: '上手い', casual: '普通', novice: '初見' }[policy];
  console.log(`  ${label.padEnd(8)} ${String(v.round.median).padStart(14)} ${String(v.turns.median).padStart(16)}`);
}
console.log(`  上手い/普通 = ${(byPolicy.skilled.round.median / Math.max(byPolicy.casual.round.median, 1)).toFixed(2)}倍`);
