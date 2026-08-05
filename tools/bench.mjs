// バランス計測。ルールや出現率をいじったら、これを流して前後の数値を比べる。
//
//   npm run bench "調整の内容"
//
// 見るべき数値:
//   ランダム盤面の消えるマス … ルール自体の緩さ。少ないほど「揃いにくい」
//   消えた手                  … 適当に指したときに何かが消える割合
//   平均連鎖 / 最大連鎖       … 連鎖が暴走していないか
//   消せる手なし / 手詰まり   … 0% でないと詰むゲームになる

import { cloneBoard, randomPiece } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { DEFAULT_RULES } from '../src/rules.js';

/** ノルマ判定を無効化する設定（このツールでは終了条件を測らないため） */
const NO_QUOTA = { quotaBase: 0, quotaGrowth: 1 };

const label = process.argv[2] ?? '計測';

// --- 1. ルールの緩さ: 完全ランダムな盤面に含まれる「消えるマス」 ---
let cells = 0;
const TRIALS = 500;
for (let i = 0; i < TRIALS; i++) {
  const size = DEFAULT_RULES.variant.boardSize;
  const board = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => randomPiece(Math.random))
  );
  cells += findMatches(board).length;
}
const rawCells = cells / TRIALS;

// --- 2. プレイアウト ---
function allMoves(board) {
  const moves = [];
  const size = board.length;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      for (const to of movableSquares(board, { r, c })) moves.push({ from: { r, c }, to });
  return moves;
}

function makesMatch(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  return findMatches(b).length > 0;
}

function playout({ games, movesPerGame, greedy }) {
  const chains = [];
  let matched = 0, total = 0, legal = 0, noScoring = 0, stuck = 0, score = 0;

  for (let g = 0; g < games; g++) {
    // ノルマで途中終了しないようにして、素の消えやすさ・スコアだけを測る
    const game = createGame(Math.random, NO_QUOTA);
    for (let m = 0; m < movesPerGame; m++) {
      const moves = allMoves(game.board);
      if (moves.length === 0) { stuck++; break; }
      legal += moves.length;
      const scoring = moves.filter((mv) => makesMatch(game.board, mv));
      if (scoring.length === 0) noScoring++;
      const pool = greedy && scoring.length > 0 ? scoring : moves;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const result = applyMove(game, pick.from, pick.to);
      total++;
      if (result.chain > 0) { matched++; chains.push(result.chain); }
    }
    score += game.score;
  }

  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    '消えた手': `${((matched / total) * 100).toFixed(1)}%`,
    '平均連鎖': avg(chains).toFixed(2),
    '最大連鎖': chains.length ? Math.max(...chains) : 0,
    '平均スコア': Math.round(score / games),
    '合法手数': Math.round(legal / total),
    '消せる手なし': `${((noScoring / total) * 100).toFixed(1)}%`,
    '手詰まり': stuck,
  };
}

console.log(`=== ${label} ===`);
console.log(`ランダム盤面64マス中の「消えるマス」: ${rawCells.toFixed(1)} マス (${((rawCells / 64) * 100).toFixed(0)}%)`);
console.table({
  'ランダムに指す': playout({ games: 30, movesPerGame: 50, greedy: false }),
  '狙って指す': playout({ games: 30, movesPerGame: 50, greedy: true }),
});
