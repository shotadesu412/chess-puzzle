// チュートリアル。動かし方と消え方だけを、実戦と同じ盤面で覚えてもらう。
//
// **文章は使わない。** 光らせる場所だけで伝える。
//   白い枠が脈打つマス   … 次にタップするところ
//   緑の枠が脈打つマス   … そこへ入れば揃う相手（タップするところではない）
//
// 各ステップは「駒を選ぶ→動かす」までをひと続きで行う。
// ステップごとに盤面を作り直すので、前のステップの結果に左右されない。
//
// 盤面の書き方: 1マスを2文字で表す。1文字目が色(w/b)、2文字目が駒。
//   P=ポーン R=ルーク N=ナイト B=ビショップ Q=クイーン K=キング
//
// 盤面を作るときのコツ:
//   色を1マスおきに交互にしておけば、同じ色が3つ並ばないので絶対に消えない。
//   消したい場所だけ、意図的に交互を崩す。

import { Color, PieceType, RANK_TABLES, createPiece } from './pieces.js';
import { VARIANTS } from './rules.js';

/** チュートリアルは実際に遊ぶモード（6×6）で行う */
export const TUTORIAL_VARIANT = VARIANTS.compact;

const TOKEN_TO_TYPE = {
  P: PieceType.Pawn,
  R: PieceType.Rook,
  N: PieceType.Knight,
  B: PieceType.Bishop,
  Q: PieceType.Queen,
  K: PieceType.King,
};

/** 文字列の配列から盤面を作る */
export function parseBoard(rows, rankTable = TUTORIAL_VARIANT.rankTable) {
  return rows.map((row) =>
    row.trim().split(/\s+/).map((token) => {
      const color = token[0] === 'w' ? Color.White : Color.Black;
      return createPiece(TOKEN_TO_TYPE[token[1]], color, rankTable);
    })
  );
}

// 色が1マスおきに交互なので、この盤面では何も消えない。
// (0,3) の白ルークを主役にする。
const BOARD_MOVE = [
  'bP wN bP wR bP wB',
  'wN bN wP bN wR bP',
  'bP wN bP wN bP wB',
  'wR bP wP bN wB bP',
  'bB wP bR wN bP wR',
  'wP bB wR bP wN bP',
];

// (2,1)の白ナイトと(2,2)の白ビショップが並んでいる（どちらもランク2＝同じ色のオーラ）。
// (2,3) の黒ポーンを白ルークで取ると、白のランク2が3つ並んで消える。
const BOARD_MATCH = [
  'bP wN bP wR bP wB',
  'wN bN wP bN wR bP',
  'bP wN wB bP bP wB',
  'wR bP wP bN wB bP',
  'bB wP bR wN bP wR',
  'wP bB wR bP wN bP',
];

// (4,1)(4,2) の黒ポーンが並んでいる。(1,3) の黒クイーンを (4,3) に入れると、
// クイーンがワイルドとしてポーンの代わりになり3つ揃う。
// 動かすのを黒の駒にして「白も黒も動かせる」も同時に伝える。
const BOARD_WILD = [
  'bP wN bP wR bP wB',
  'wN bN wP bQ wR bP',
  'bP wN bP wR bP wB',
  'wR bP wB bP wN bP',
  'bB bP bP wR bN wR',
  'wP bB wR bN wN bP',
];

/**
 * ステップ定義。
 *   select   … タップしてほしい駒（白い枠で脈打たせる）
 *   move     … 動かしてほしい先（選んだあと白い枠で脈打たせる）
 *   partners … そこへ入れば揃う相手（緑の枠で脈打たせる。タップ対象ではない）
 */
export const TUTORIAL_STEPS = [
  // 1. 動かす。取れるのは違う色の駒がいるマスだけ、というのを1手で見せる
  {
    board: BOARD_MOVE,
    select: { r: 0, c: 3 },
    move: { r: 0, c: 2 },
  },
  // 2. 消す。先に「揃う相手2つ」を光らせてから動かしてもらう
  {
    board: BOARD_MATCH,
    select: { r: 0, c: 3 },
    move: { r: 2, c: 3 },
    partners: [{ r: 2, c: 1 }, { r: 2, c: 2 }],
  },
  // 3. ワイルド。クイーンはどのランクの代わりにもなる
  {
    board: BOARD_WILD,
    select: { r: 1, c: 3 },
    move: { r: 4, c: 3 },
    partners: [{ r: 4, c: 1 }, { r: 4, c: 2 }],
  },
];
