// ゲーム進行。DOMには一切触らない（テストしやすくするため）。
//
// 1手の流れ:
//   移動（相手の駒を取る／元のマスが空く）
//     → 消去判定（移動直後の位置で判定するので、狙った場所でそのまま消える）
//     → 消去 → 重力で落として補充 → もう一度判定（連鎖）… 消えなくなるまで
//
// applyMove は盤面の変化を「フェーズの配列」で返す。UIはそれを順に再生するだけでよい。

import { applyGravity, cloneBoard, createInitialBoard } from './board.js';
import { findMatches, groupMatches } from './match.js';
import { movableSquares } from './moves.js';
import { DEFAULT_RULES, targetForRound } from './rules.js';
import { GROUP_KIND, KIND_MULTIPLIER, classifyGroup, scoreForGroup } from './score.js';

const MAX_RESOLVE_LOOPS = 100; // 補充がたまたま連鎖し続けた場合の保険

export function createGame(rng = Math.random, options = {}) {
  // モード固有の設定 → 呼び出し側の指定 の順に上書きする
  const variant = options.variant ?? DEFAULT_RULES.variant;
  const rules = { ...DEFAULT_RULES, ...variant.rules, ...options, variant };
  return {
    rng,
    rules,
    board: createInitialBoard(rng, rules.variant),
    score: 0,
    moves: 0,
    maxChain: 0,
    // レアな並びを消した回数
    royalMatches: {
      [GROUP_KIND.Royal]: 0,
      [GROUP_KIND.Queens]: 0,
      [GROUP_KIND.Kings]: 0,
    },
    // ノルマ（数ターンごとのスコア関門）
    round: 1,
    target: targetForRound(rules, 1),
    roundScore: 0,
    turnsLeft: rules.quotaInterval,
    over: false,
  };
}

/** from の駒が to へ動けるか */
export function canMove(game, from, to) {
  if (game.over) return false;
  return movableSquares(game.board, from).some((s) => s.r === to.r && s.c === to.c);
}

/**
 * 1手を実行する。
 * 戻り値: { phases, chain, gained }（動かせない手なら null）
 */
export function applyMove(game, from, to) {
  if (!canMove(game, from, to)) return null;

  const board = game.board;
  const phases = [];

  // 1. 移動：取られた駒は消え、動かした駒の元いたマスが空く
  board[to.r][to.c] = board[from.r][from.c];
  board[from.r][from.c] = null;
  phases.push({ kind: 'move', from, to, board: cloneBoard(board) });

  // 2. 消去 → 重力 → 再判定 を繰り返す
  let chain = 0;
  let gained = 0;
  let matches = findMatches(board);

  for (let guard = 0; guard < MAX_RESOLVE_LOOPS; guard++) {
    if (matches.length > 0) {
      chain++;

      // 隣接するマスをまとめて、カタマリごとに点数を出す。
      // 点数は消す前の盤面で計算する（ワイルドかどうかを見るため）。
      // カタマリごとの点数は、消えた位置に得点を出す演出でも使う。
      const groups = groupMatches(matches).map((cells) => {
        const groupKind = classifyGroup(board, cells);
        return {
          cells,
          kind: groupKind,
          points: scoreForGroup(cells.length, chain, groupKind, game.rules.chainGrowth),
        };
      });

      let points = 0;
      let royalKind = null; // このフェーズで出た一番レアなカタマリ
      for (const group of groups) {
        points += group.points;
        if (group.kind !== GROUP_KIND.Normal) {
          game.royalMatches[group.kind]++;
          if (!royalKind || KIND_MULTIPLIER[group.kind] > KIND_MULTIPLIER[royalKind]) {
            royalKind = group.kind;
          }
        }
      }

      gained += points;
      game.score += points;
      phases.push({
        kind: 'clear',
        cells: matches,
        groups,
        chain,
        points,
        royalKind,
        board: cloneBoard(board),
      });
      for (const { r, c } of matches) board[r][c] = null;
    }

    if (applyGravity(board, game.rng, game.rules.variant)) {
      phases.push({ kind: 'fall', board: cloneBoard(board) });
    }

    matches = findMatches(board);
    if (matches.length === 0) break;
  }

  game.moves++;
  game.maxChain = Math.max(game.maxChain, chain);

  return { phases, chain, gained, check: advanceRound(game, gained) };
}

/**
 * 1ターン進めて、ラウンドの区切りならノルマを判定する。
 * 区切りでなければ null を返す。
 */
function advanceRound(game, gained) {
  const rules = game.rules;
  game.roundScore += gained;
  game.turnsLeft--;
  if (game.turnsLeft > 0) return null;

  const passed = game.roundScore >= game.target;
  const check = {
    round: game.round,
    target: game.target,
    roundScore: game.roundScore,
    passed,
  };

  if (!passed) {
    game.over = true;
    return check;
  }

  // 超えた分は次のラウンドへ持ち越す（設定次第）。大連鎖の貯金がここで効く
  game.roundScore = rules.quotaCarryOver ? game.roundScore - game.target : 0;
  game.round++;
  game.target = targetForRound(rules, game.round);
  game.turnsLeft = rules.quotaInterval;
  return check;
}
