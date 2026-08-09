// 得点計算。
//
// 設計の狙い:
//   1. 一度に多く消すほど得になる（消えた数の2乗）。
//      3個消しと5個消しが同じような点数だと、盤面を読む意味が無くなるため。
//   2. 連鎖ボーナスは控えめ（1手ごとに +0.5倍）。
//      連鎖は落下の運で決まる部分が大きく、ここを強くすると運ゲーになる。
//   3. ワイルド（クイーン・キング）だけが並んだとき＝ロイヤルは特大ボーナス。
//      昇格でワイルドを作れるようになったので、**これは狙って作るもの**になった。
//      実測でもロイヤルを狙う立ち回りがスコア2.7倍で最適戦略になっている。
//      倍率は「偶然の希少さ」ではなく「狙ったときの作りにくさ」で決めてある。
//   4. ランクによる点数の差は付けない。付けるとポーンを消す動機が強まり、
//      昇格（＝ワイルドの供給源）が痩せる。詳しくは CLAUDE.md の「ランクと点数」。

import { PieceType, isWild } from './pieces.js';
import { DEFAULT_RULES } from './rules.js';

/** 基礎点の係数（消えた数の2乗に掛ける） */
export const BASE_SCORE = 5;

/**
 * カタマリの種類と倍率。
 *
 * **「狙って作りに行ったときの出やすさ」に合わせてある**（`npm run royal-hunt` の実測）。
 * 待っていれば出るものではなく、狙って作るものになったので、
 * 基準は「偶然の希少さ」ではなく「狙ったときの難しさ」。
 *
 * 400ゲームの実測（1ゲームあたり・その種類を狙った立ち回りで）:
 *   混合    2.93回 → 基準
 *   クイーン 1.24回 → 混合の2.4倍レア → 110倍
 *   キング  0.96回 → 混合の3.1倍レア → 150倍
 *
 * クイーンの方がキングより作りやすいのは、クイーンが盤面のどこへでも動けて
 * 揃えに行けるため。狙わない場合は逆にキングの方が出やすい（巻き添えで消えにくい）。
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
  [GROUP_KIND.Queens]: 110,
  [GROUP_KIND.Kings]: 150,
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
