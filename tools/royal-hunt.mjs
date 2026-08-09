// 「ロイヤルを狙いに行く」立ち回りで、どの種類が一番作りやすいかを測る。
//
//   npm run royal-hunt [ゲーム数] [1ゲームのターン数]
//
// 空振り禁止なので「ターンを捨てて仕込む」はできない。
// 指せる手（＝必ず何か消える手）の中から、
//   ①今すぐ狙いのロイヤルが決まる手
//   ②狙いのワイルドを消さず、寄せる手
// を優先することで「狙う」を表現している。
//
// 一番作りやすい種類が分かれば、スコアの配分をそれに合わせられる。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, groupMatches, isPartOfMatch } from '../src/match.js';
import { playableSquares } from '../src/moves.js';
import { PieceType, isWild } from '../src/pieces.js';
import { DEFAULT_RULES, VARIANTS } from '../src/rules.js';
import { GROUP_KIND, classifyGroup } from '../src/score.js';

const GAMES = Number(process.argv[2] ?? 300);
const TURNS = Number(process.argv[3] ?? 60);
const variant = VARIANTS.compact;

/** 狙う対象。null なら「どのロイヤルでもよい」 */
const TARGETS = {
  '一番大きく消す（比較用）': { aim: null, greedy: true },
  'ロイヤルを狙う（種類問わず）': { aim: null },
  'クイーンロイヤルを狙う': { aim: PieceType.Queen },
  'キングロイヤルを狙う': { aim: PieceType.King },
};

/** その駒が狙いの対象か */
function isTarget(piece, aim) {
  if (!piece || !isWild(piece)) return false;
  return aim === null || piece.type === aim;
}

/** 同じ色で隣り合う「狙いのワイルド」の組の数＝揃えやすさ */
function alignment(board, aim) {
  let pairs = 0;
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const piece = board[r][c];
      if (!isTarget(piece, aim)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const next = board[r + dr]?.[c + dc];
        if (isTarget(next, aim) && next.color === piece.color) pairs++;
      }
    }
  }
  return pairs;
}

/** その手の結果を調べる */
function evaluate(board, move, aim) {
  const next = cloneBoard(board);
  next[move.to.r][move.to.c] = next[move.from.r][move.from.c];
  next[move.from.r][move.from.c] = null;

  const matches = findMatches(next);
  if (matches.length === 0) return null;

  let completes = false;
  let consumed = 0;
  for (const group of groupMatches(matches)) {
    const kind = classifyGroup(next, group);
    if (kind !== GROUP_KIND.Normal) {
      // 狙いに合ったロイヤルか
      if (aim === null) completes = true;
      else if (aim === PieceType.Queen && kind === GROUP_KIND.Queens) completes = true;
      else if (aim === PieceType.King && kind === GROUP_KIND.Kings) completes = true;
    }
    // 狙いのワイルドを普通の消しで潰していないか
    for (const { r, c } of group) {
      if (kind === GROUP_KIND.Normal && isTarget(next[r][c], aim)) consumed++;
    }
  }

  return { cleared: matches.length, completes, consumed, board: next };
}

function chooseMove(board, { aim, greedy }) {
  const moves = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      for (const to of playableSquares(board, { r, c }, true)) {
        moves.push({ from: { r, c }, to });
      }
    }
  }
  if (moves.length === 0) return null;

  const before = greedy ? 0 : alignment(board, aim);
  let best = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const result = evaluate(board, move, aim);
    if (!result) continue;

    let score = result.cleared;
    if (!greedy) {
      score += result.completes ? 10000 : 0;          // 決まるなら最優先
      score -= result.consumed * 40;                   // 狙いのワイルドは潰さない
      score += (alignment(result.board, aim) - before) * 15; // 寄せる
    }
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

function run(policy) {
  const royals = { [GROUP_KIND.Royal]: 0, [GROUP_KIND.Queens]: 0, [GROUP_KIND.Kings]: 0 };
  const scores = [];
  let stuck = 0;

  for (let g = 0; g < GAMES; g++) {
    const game = createGame(Math.random, { variant, quotaBase: 0, quotaGrowth: 1 });
    for (let t = 0; t < TURNS; t++) {
      const move = chooseMove(game.board, policy);
      if (!move) { stuck++; break; }
      const result = applyMove(game, move.from, move.to);
      for (const phase of result.phases) {
        if (phase.kind === 'clear' && phase.royalKind) royals[phase.royalKind]++;
      }
    }
    scores.push(game.score);
  }

  const per = (n) => (n / GAMES).toFixed(3);
  const every = (n) => (n === 0 ? '—' : `${(GAMES / n).toFixed(1)}ゲームに1回`);
  return {
    '混合': `${per(royals[GROUP_KIND.Royal])} (${every(royals[GROUP_KIND.Royal])})`,
    'クイーン': `${per(royals[GROUP_KIND.Queens])} (${every(royals[GROUP_KIND.Queens])})`,
    'キング': `${per(royals[GROUP_KIND.Kings])} (${every(royals[GROUP_KIND.Kings])})`,
    'スコア中央': median(scores).toLocaleString(),
    '手詰まり': `${((stuck / GAMES) * 100).toFixed(1)}%`,
  };
}

console.log(`6×6 / 空振り禁止あり / promoteAfter=${DEFAULT_RULES.promoteAfter} / 各${GAMES}ゲーム x ${TURNS}ターン\n`);
const rows = {};
for (const [label, policy] of Object.entries(TARGETS)) {
  rows[label] = run(policy);
  process.stderr.write(`  ${label} 完了\n`);
}
console.table(rows);
