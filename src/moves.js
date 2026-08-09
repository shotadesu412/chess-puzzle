// 移動可能マスの計算。
//
// ルール:
//   駒はチェス本来の移動範囲の中で「自分と違う色の駒がいるマス」にだけ移動できる。
//   駒越えのブロックは一切考えない（間に何があっても射線は通る）。
//   移動先の駒は取られて盤から消え、元いたマスは空きマスになる。
//   ポーンは「取る動き」しか使わないので斜め1マス。ただし前後どちらの斜めも取れる。
//
// ポーンの前後を制限していたときは、ポーンの41%が「動かせない駒」になっていた
// （実測）。重力も下向きなので黒ポーンは最下段に溜まって二度と動けず、
// 白ポーンは最上段で同じことが起きる。盤面の3〜4割がポーンなので影響が大きい。

import { PieceType } from './pieces.js';
import { cloneBoard, inside } from './board.js';
import { findMatches, isPartOfMatch } from './match.js';

const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

const KNIGHT_STEPS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

const KING_STEPS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** ポーンは斜め4方向。チェスと違い後ろ向きにも取れる（下のコメント参照） */
const PAWN_STEPS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** from にいる駒が移動できるマスの一覧（{r, c} の配列） */
export function movableSquares(board, from) {
  const piece = board[from.r][from.c];
  if (!piece) return [];

  return candidateSquares(piece, from, board.length).filter(({ r, c }) => {
    if (!inside(board, r, c)) return false;
    const target = board[r][c];
    return target !== null && target.color !== piece.color;
  });
}

/** 移動先に駒があるかどうかを見ずに、チェスの移動範囲だけを列挙する */
function candidateSquares(piece, from, size) {
  switch (piece.type) {
    case PieceType.Pawn:
      return steps(from, PAWN_STEPS);
    case PieceType.Knight:
      return steps(from, KNIGHT_STEPS);
    case PieceType.King:
      return steps(from, KING_STEPS);
    case PieceType.Rook:
      return rays(from, ROOK_DIRS, size);
    case PieceType.Bishop:
      return rays(from, BISHOP_DIRS, size);
    case PieceType.Queen:
      return rays(from, QUEEN_DIRS, size);
    default:
      return [];
  }
}

function steps(from, offsets) {
  return offsets.map(([dr, dc]) => ({ r: from.r + dr, c: from.c + dc }));
}

/** 各方向に盤の端まで伸ばす。ブロックなし仕様なので途中の駒は無視する。 */
function rays(from, dirs, size) {
  const result = [];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i < size; i++) {
      result.push({ r: from.r + dr * i, c: from.c + dc * i });
    }
  }
  return result;
}

/** その手を指したら何か消えるか。移動先の行と列だけ見れば分かる */
export function wouldClear(board, from, to) {
  const next = cloneBoard(board);
  next[to.r][to.c] = next[from.r][from.c];
  next[from.r][from.c] = null;
  return isPartOfMatch(next, to.r, to.c);
}

/**
 * 実際に指せる手。
 *
 * `clearingOnly` を立てると「何か消える手」しか指せなくなる。
 * 空振りを許すと、ターンを捨ててレア役を仕込むのが最適解になってしまうため
 * （実測で空振り35手を挟むとスコアが2.4倍になった）。
 * 副作用として選択肢が大きく減り、盤面が読みやすくなる。
 */
export function playableSquares(board, from, clearingOnly = false) {
  const squares = movableSquares(board, from);
  if (!clearingOnly) return squares;
  return squares.filter((to) => wouldClear(board, from, to));
}

/**
 * その手を指したときに消えるマス数（0なら空振り）。
 *
 * 「一番多く消せる手はどれか」を測るのに使う。
 * 消えるかどうかだけでよいなら `wouldClear` の方が速い。
 */
export function clearedBy(board, from, to) {
  const next = cloneBoard(board);
  next[to.r][to.c] = next[from.r][from.c];
  next[from.r][from.c] = null;
  if (!isPartOfMatch(next, to.r, to.c)) return 0;
  return findMatches(next).length;
}

/** 盤上で指せる手を全部返す。`{ from, to }` の配列 */
export function allPlayableMoves(board, clearingOnly = false) {
  const moves = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      if (!board[r][c]) continue;
      for (const to of playableSquares(board, { r, c }, clearingOnly)) {
        moves.push({ from: { r, c }, to });
      }
    }
  }
  return moves;
}

/** 盤上に1手でも指せる手があるか（手詰まり判定用） */
export function hasAnyMove(board, clearingOnly = false) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] && playableSquares(board, { r, c }, clearingOnly).length > 0) return true;
    }
  }
  return false;
}
