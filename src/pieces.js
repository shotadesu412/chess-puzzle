// 駒の種類・色・ランクの定義。
//
// ランクは「どの駒どうしが揃うか」を決めるためだけの区分で、チェスの強さとは無関係。
// モードによって区分の仕方が変わるので、ランクは駒を作るときに埋め込む
// （盤面を見る側は piece.rank を見るだけでよく、どのモードかを知らなくて済む）。

export const Color = {
  White: 'white',
  Black: 'black',
};

export const PieceType = {
  Pawn: 'pawn',
  Rook: 'rook',
  Knight: 'knight',
  Bishop: 'bishop',
  Queen: 'queen',
  King: 'king',
};

/** クイーンとキングのランク。どのランクの代わりにもなる */
export const WILD = 'wild';

/**
 * ランクの区分表。
 *
 * threeTier … ポーン / ナイト・ビショップ / ルーク の3段階 + ワイルド。
 *             揃いにくくバランスは良いが、盤面を見て区別できないので数字の表示が要る。
 * twoTier   … ポーン / それ以外 の2段階 + ワイルド。
 *             「ポーン」「それ以外」「光っているクイーン・キング」で見分けられるので
 *             数字を出さずに済む。そのぶん揃いやすい。
 */
export const RANK_TABLES = {
  threeTier: {
    [PieceType.Pawn]: 1,
    [PieceType.Knight]: 2,
    [PieceType.Bishop]: 2,
    [PieceType.Rook]: 3,
    [PieceType.Queen]: WILD,
    [PieceType.King]: WILD,
  },
  twoTier: {
    [PieceType.Pawn]: 1,
    [PieceType.Rook]: 2,
    [PieceType.Bishop]: 2,
    [PieceType.Knight]: 2,
    [PieceType.Queen]: WILD,
    [PieceType.King]: WILD,
  },
};

let nextId = 1;

/**
 * 駒を1個作る。rank は区分表から引いて埋め込む。
 * age は盤面に居続けたターン数。ポーンの昇格（プロモーション）に使う。
 */
export function createPiece(type, color, rankTable = RANK_TABLES.threeTier) {
  return { id: nextId++, type, color, rank: rankTable[type], age: 0 };
}

/** 駒のランク（ワイルドなら WILD） */
export function rankOf(piece) {
  return piece.rank;
}

/** クイーンかキングか */
export function isWild(piece) {
  return piece.rank === WILD;
}

/** 盤面に表示するランクの文字 */
export function rankLabel(piece) {
  return isWild(piece) ? 'W' : String(piece.rank);
}

// 表示用のチェス記号。
// 白抜きの記号(♙♖…)は環境によって見え方の差が大きいので、
// 塗りつぶしの記号だけを使い、白黒は CSS の文字色で塗り分ける。
//
// 末尾の U+FE0E は「絵文字ではなく文字として描け」という指定（異体字セレクタ）。
// これが無いと iOS では ♟ (U+265F) だけが絵文字として描画され、
// CSS の色も縁取りも効かず、白ポーンが黒ポーンの絵柄のまま出てしまう。
// チェスの駒でこの扱いになるのは U+265F だけだが、他も揃えて付けておく。
const TEXT_PRESENTATION = '\uFE0E';

export const GLYPH = {
  [PieceType.Pawn]: '\u265F' + TEXT_PRESENTATION,
  [PieceType.Rook]: '\u265C' + TEXT_PRESENTATION,
  [PieceType.Knight]: '\u265E' + TEXT_PRESENTATION,
  [PieceType.Bishop]: '\u265D' + TEXT_PRESENTATION,
  [PieceType.Queen]: '\u265B' + TEXT_PRESENTATION,
  [PieceType.King]: '\u265A' + TEXT_PRESENTATION,
};
