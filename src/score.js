// 得点計算。
//
// 設計の狙い:
//   1. 一度に多く消すほど得になる（消えた数の2乗）。
//      3個消しと5個消しが同じような点数だと、盤面を読む意味が無くなるため。
//   2. 連鎖ボーナスは控えめ（1手ごとに +0.5倍）。
//      連鎖は落下の運で決まる部分が大きく、ここを強くすると運ゲーになる。
//   3. クイーン・キングだけが並んだとき（WWW）は特大ボーナス。
//      1600回の消去で6回しか起きない激レア。狙うものではなく、出たら嬉しい要素。
//      平均スコアには「無いもの」として設計してある。

import { PieceType, isWild } from './pieces.js';
import { DEFAULT_RULES } from './rules.js';

/** 基礎点の係数（消えた数の2乗に掛ける） */
export const BASE_SCORE = 5;

/**
 * カタマリの種類と倍率。
 *
 * ワイルド（クイーン・キング）の出現率は合わせて10%、内訳は各5%。
 * つまり同じ色でワイルドが3つ並ぶ時点で希少で、
 * さらにその8回に1回だけ「クイーンだけ」または「キングだけ」になる。
 * その希少さに合わせて倍率も8倍にしてある。
 */
export const GROUP_KIND = {
  Normal: 'normal', // 普通の消し
  Royal: 'royal',   // クイーンとキングが混ざったワイルド揃い
  Queens: 'queens', // クイーンだけ（隠し要素）
  Kings: 'kings',   // キングだけ（隠し要素）
};

export const KIND_MULTIPLIER = {
  [GROUP_KIND.Normal]: 1,
  [GROUP_KIND.Royal]: 50,
  [GROUP_KIND.Queens]: 400,
  [GROUP_KIND.Kings]: 400,
};

/**
 * n連鎖目の倍率。等比で増える（growth=2 なら 1, 2, 4, 8, 16 …）。
 * 大連鎖ほど滅多に起きないので、倍率を大きくしても平均スコアへの影響は小さい。
 */
export function chainMultiplier(chain, growth = DEFAULT_RULES.chainGrowth) {
  return growth ** (chain - 1);
}

/** 1カタマリぶんの点数 */
export function scoreForGroup(size, chain, kind = GROUP_KIND.Normal, growth) {
  const base = size * size * BASE_SCORE;
  return Math.round(base * chainMultiplier(chain, growth) * KIND_MULTIPLIER[kind]);
}

/** カタマリの種類を判定する（消す前の盤面で調べること） */
export function classifyGroup(board, group) {
  const pieces = group.map(({ r, c }) => board[r][c]);
  if (!pieces.every(isWild)) return GROUP_KIND.Normal;

  const types = new Set(pieces.map((piece) => piece.type));
  if (types.size > 1) return GROUP_KIND.Royal;
  return types.has(PieceType.Queen) ? GROUP_KIND.Queens : GROUP_KIND.Kings;
}
