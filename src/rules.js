// 調整用のパラメータをここに集約する。
// `createGame(rng, { ... })` で差し替えられるので、tools/ から総当たりで試せる。

import { PieceType, RANK_TABLES } from './pieces.js';

/**
 * 盤面のモード。ランクの区分・盤面サイズ・駒の出現率をまとめたもの。
 *
 * 出現率はランクごとの合計が揃うようにしてある。偏らせると
 * そのランクが3つ揃う確率が上がって盤面が消えやすくなりすぎる。
 */
export const VARIANTS = {
  standard: {
    id: 'standard',
    name: '8×8 / ランク3段階',
    boardSize: 8,
    rankTable: RANK_TABLES.threeTier,
    // ランク1: 30% / ランク2: 30% / ランク3: 30% / ワイルド: 10%
    spawn: [
      { type: PieceType.Pawn, weight: 30 },
      { type: PieceType.Knight, weight: 15 },
      { type: PieceType.Bishop, weight: 15 },
      { type: PieceType.Rook, weight: 30 },
      { type: PieceType.Queen, weight: 5 },
      { type: PieceType.King, weight: 5 },
    ],
    // このモード用のノルマ。上手いプレイヤーで11ラウンド55ターン（約4分）
    rules: { quotaBase: 300 },
  },

  compact: {
    id: 'compact',
    name: '6×6 / ランク2段階',
    boardSize: 6,
    rankTable: RANK_TABLES.twoTier,
    // ランク1: 45% / ランク2: 45% / ワイルド: 10%
    spawn: [
      { type: PieceType.Pawn, weight: 45 },
      { type: PieceType.Rook, weight: 15 },
      { type: PieceType.Bishop, weight: 15 },
      { type: PieceType.Knight, weight: 15 },
      { type: PieceType.Queen, weight: 5 },
      { type: PieceType.King, weight: 5 },
    ],
    // 6×6 はランクが2段階しかなく揃いやすい（ランダム盤面の24%が消える。8×8は16%）。
    // 8×8 と同じ 300 だと17ラウンド85ターンまで延びるので、ノルマを上げて尺を合わせる。
    // 450 なら11ラウンド55ターンで、腕の差も1.83倍と8×8（1.38倍）より大きい。
    rules: { quotaBase: 450 },
  },
};

export const DEFAULT_RULES = {
  /** 盤面のモード */
  variant: VARIANTS.standard,

  /**
   * 連鎖ごとの倍率（等比）。n連鎖目の倍率は growth^(n-1)。
   *
   * 連鎖は1つ伸びるごとに約0.29倍の頻度に減る（実測: 1連鎖70.8% / 2連鎖20.7% /
   * 3連鎖6.1% / 4連鎖1.7% / 5連鎖0.5%）。このとき倍率 g に対して
   *   期待値が発散しない条件: g < 1/0.29   = 3.4
   *   分散が発散しない条件  : g < √(1/0.29) = 1.86
   * 分散が発散すると「たまたま出た大連鎖」だけでスコアが決まる運ゲーになる。
   *
   * 連鎖は落下の運で決まるので、倍率を上げるほど腕の差は消えていく
   * （実測: x1で1.35倍 → x1.5で1.23倍 → x2で1.13倍）。
   * 大連鎖の見返り（8連鎖で17倍）と腕の差の両立点として1.5を採用。
   * 検証は `npm run chain-growth`。
   */
  chainGrowth: 1.5,

  // 以下のノルマ設定は `npm run tune` で16パターンを比較して決めた（8×8モード基準）。
  // 5ターン / x1.15 / 繰越あり だと、上手いプレイヤーで11ラウンド55ターン（約4分）、
  // 下手で7ラウンド35ターン。腕の差がラウンド数に1.57倍として出る。

  /** 何ターンごとにノルマを判定するか */
  quotaInterval: 5,

  /** 最初のラウンドのノルマ */
  quotaBase: 300,

  /** ラウンドごとにノルマが上がる倍率 */
  quotaGrowth: 1.15,

  /**
   * ノルマを超えた分を次のラウンドに繰り越すか。
   *
   * これが寿命を決める一番大きな要素だった。繰り越さないと、
   * プレイヤーの火力が成長しない以上「ノルマが実力を超えた瞬間に即終了」となり、
   * 成長率をどう変えても一律4〜7ラウンドで終わってしまう（実測）。
   * 繰り越すと余剰が貯金になり、狙って出せない大連鎖がちゃんと後で効いてくる。
   */
  quotaCarryOver: true,
};

/** そのラウンドのノルマ */
export function targetForRound(rules, round) {
  return Math.round(rules.quotaBase * rules.quotaGrowth ** (round - 1));
}
