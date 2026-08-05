// 「あと1手でレア役が決まる」状態を探す。
//
// ロイヤル役を作れる手は20ターンに1回くらい存在するのに、
// プレイヤーはそれに気づけていなかった（実測でチャンスのあるターンが5.2%）。
// 気づけるようにすると「知らないうちに出た／出なかった」が
// 「狙って決めた／惜しくも外した」に変わる。

import { cloneBoard } from './board.js';
import { findMatches, groupMatches } from './match.js';
import { movableSquares } from './moves.js';
import { isWild } from './pieces.js';
import { GROUP_KIND, classifyGroup } from './score.js';

/**
 * レア役（ワイルドだけのカタマリ）が成立する手を全部返す。
 * 戻り値は { from, to, cells, kind } の配列。
 *
 * ワイルドだけのカタマリを作れるのはワイルドを動かしたときだけなので、
 * 探索はワイルドの駒に限定してよい（盤面の1割程度しかないので十分速い）。
 */
export function findRoyalChances(board) {
  const chances = [];
  const size = board.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const piece = board[r][c];
      if (!piece || !isWild(piece)) continue;

      for (const to of movableSquares(board, { r, c })) {
        const next = cloneBoard(board);
        next[to.r][to.c] = piece;
        next[r][c] = null;

        const matches = findMatches(next);
        if (matches.length === 0) continue;

        for (const group of groupMatches(matches)) {
          const kind = classifyGroup(next, group);
          if (kind === GROUP_KIND.Normal) continue;
          chances.push({ from: { r, c }, to, cells: group, kind });
          break;
        }
      }
    }
  }

  return chances;
}
