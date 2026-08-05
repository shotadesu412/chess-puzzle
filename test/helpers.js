// テスト用のヘルパー。

import { Color, PieceType, RANK_TABLES, createPiece } from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';

/** テストの既定は8×8モード */
export const TEST_VARIANT = VARIANTS.standard;
export const SIZE = TEST_VARIANT.boardSize;

/** ランクを表す文字から代表的な駒を作る（W = ワイルド = クイーン） */
export const RANK_TO_TYPE = {
  1: PieceType.Pawn,
  2: PieceType.Knight,
  3: PieceType.Rook,
  W: PieceType.Queen,
};

/** "W1" → 白ランク1、"BW" → 黒のワイルド、"." → 空きマス */
export function piece(code) {
  if (code === '.') return null;
  const color = code[0] === 'W' ? Color.White : Color.Black;
  return createPiece(RANK_TO_TYPE[code[1]], color, RANK_TABLES.threeTier);
}

/**
 * 文字列の配列から盤面を作る。1行は空白区切りの8マス。
 * 足りない行は白と黒を交互に置いて埋める（消える組み合わせが出来ないダミー）。
 */
export function makeBoard(rows, size = SIZE) {
  const board = [];
  for (let r = 0; r < size; r++) {
    if (r < rows.length) {
      const cells = rows[r].trim().split(/\s+/).map(piece);
      if (cells.length !== size) throw new Error(`行 ${r} のマス数が ${cells.length} です`);
      board.push(cells);
    } else {
      // 市松に色を変えたポーンで埋める（縦横に同色が3つ並ばない）
      board.push(
        Array.from({ length: size }, (_, c) => piece((r + c) % 2 === 0 ? 'W1' : 'B1'))
      );
    }
  }
  return board;
}

/** 盤面の1マスを差し替える */
export function put(board, r, c, type, color) {
  board[r][c] = createPiece(type, color, RANK_TABLES.threeTier);
}

/** 再現性のある乱数（線形合同法） */
export function seededRng(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** {r,c} の配列を比較しやすい文字列の集合に変換する */
export function toKeySet(cells) {
  return new Set(cells.map(({ r, c }) => `${r},${c}`));
}
