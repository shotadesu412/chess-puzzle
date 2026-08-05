// 盤面（正方形の二次元配列）の生成・複製・重力処理。
// board[row][col] に駒オブジェクト、空きマスは null。row 0 が一番上。
//
// 盤面の大きさはモードによって変わるので、定数ではなく board.length から取る。

import { Color, createPiece } from './pieces.js';
import { hasAnySameRankRun, hasSameRankRun, isPartOfMatch } from './match.js';
import { DEFAULT_RULES } from './rules.js';

/** 補充する駒の引き直し回数の上限 */
const SPAWN_RETRY = 20;

/** 初期盤面を作り直す回数の上限 */
const BOARD_RETRY = 20;

/** 盤面の一辺の長さ */
export function sizeOf(board) {
  return board.length;
}

/** 盤の内側かどうか */
export function inside(board, r, c) {
  const size = board.length;
  return r >= 0 && r < size && c >= 0 && c < size;
}

/** 盤面を複製する（駒オブジェクト自体は共有する＝不変として扱う） */
export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

/** 重み付きランダムで駒を1個作る */
export function randomPiece(rng, variant = DEFAULT_RULES.variant) {
  const total = variant.spawn.reduce((sum, e) => sum + e.weight, 0);
  let n = rng() * total;
  for (const entry of variant.spawn) {
    n -= entry.weight;
    if (n < 0) {
      const color = rng() < 0.5 ? Color.White : Color.Black;
      return createPiece(entry.type, color, variant.rankTable);
    }
  }
  // 浮動小数の誤差で漏れた場合の保険
  return createPiece(variant.spawn[0].type, Color.White, variant.rankTable);
}

/**
 * 空きマスを詰める。列ごとに駒を下へ落とし、空いた上部に新しい駒を補充する。
 * 盤面が変化したら true を返す。
 *
 * 補充する駒は「置いた瞬間には消えない駒」から選ぶ。
 * ランダムに補充すると、補充した駒がそのまま消えて連鎖が止まらなくなるため。
 * 落下してきた駒どうしが揃って起きる連鎖は、これまでどおり発生する。
 */
export function applyGravity(board, rng, variant = DEFAULT_RULES.variant, options = {}) {
  const size = board.length;
  let changed = false;

  for (let c = 0; c < size; c++) {
    let write = size - 1; // 次に駒を置く行（下から詰める）
    for (let r = size - 1; r >= 0; r--) {
      if (board[r][c] === null) continue;
      if (write !== r) {
        board[write][c] = board[r][c];
        board[r][c] = null;
        changed = true;
      }
      write--;
    }
    for (let r = write; r >= 0; r--) {
      spawnPiece(board, r, c, rng, variant, options);
      changed = true;
    }
  }
  return changed;
}

/** そのマスに置いてよい駒か */
function isAcceptable(board, r, c, options) {
  if (isPartOfMatch(board, r, c)) return false;
  if (options.avoidSameRankRun && hasSameRankRun(board, r, c)) return false;
  return true;
}

/**
 * そのマスに、置いても消えない駒を置く。
 * avoidSameRankRun を立てると「色違いでも同じランクが3つ並ぶ」形も避ける（初期盤面用）。
 *
 * まず出現率どおりに引き直し、それでも見つからなければ全組み合わせを順に試す。
 * 6×6モードはランクが3種類しかなく、周りに囲まれると条件を満たす駒が
 * ワイルド（10%）だけになることがあるため、引き直しだけでは取りこぼす。
 */
function spawnPiece(board, r, c, rng, variant, options = {}) {
  for (let attempt = 0; attempt < SPAWN_RETRY; attempt++) {
    board[r][c] = randomPiece(rng, variant);
    if (isAcceptable(board, r, c, options)) return;
  }

  for (const entry of shuffled(variant.spawn, rng)) {
    for (const color of shuffled([Color.White, Color.Black], rng)) {
      board[r][c] = createPiece(entry.type, color, variant.rankTable);
      if (isAcceptable(board, r, c, options)) return;
    }
  }
  // どう置いても条件を満たせない場合はそのまま置いて連鎖に任せる
}

/** 配列を複製してシャッフルする */
function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 最初の盤面を作る（全マスを補充するのと同じ）。
 *
 * 消える組み合わせが無いのに加えて、**同じランクが3つ以上並ばない**ようにする。
 * ランクはオーラの色で見せているので、色違いで消えない並びが最初から見えていると
 * 「揃っているのに消えない」と誤解されるため。
 * 途中の補充ではこの制限はかけない（落下で偶然できる並びまでは避けられないので）。
 */
export function createInitialBoard(rng, variant = DEFAULT_RULES.variant) {
  const size = variant.boardSize;
  let board;

  // 端から順に埋めていくので、最後のほうで「どの駒を置いても条件を満たせない」
  // マスがまれに出る（6×6はランクが3種類しかないため約2%）。
  // その場合は盤面ごと作り直す。
  for (let attempt = 0; attempt < BOARD_RETRY; attempt++) {
    board = Array.from({ length: size }, () => new Array(size).fill(null));
    applyGravity(board, rng, variant, { avoidSameRankRun: true });
    if (!hasAnySameRankRun(board)) return board;
  }
  return board;
}
