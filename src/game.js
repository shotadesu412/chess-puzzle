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
import { playableSquares } from './moves.js';
import { Color, PieceType, createPiece } from './pieces.js';
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
  return playableSquares(game.board, from, game.rules.clearingMovesOnly)
    .some((s) => s.r === to.r && s.c === to.c);
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
  let aged = false; // 歳を取らせるのは1手につき1回だけ
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
        // レア役はノルマの難易度そのものを巻き戻す
        rewind: royalKind ? rewindRound(game, royalKind) : null,
        board: cloneBoard(board),
      });
      for (const { r, c } of matches) board[r][c] = null;

      // レア役が出たら盤面を全部ワイルドに変えて、そのまま一掃する。
      // 演出であると同時に、盤面のリセットも兼ねている。
      if (royalKind && game.rules.royalWipe) {
        const transformed = transformToWild(game, board, royalKind);
        if (transformed.length > 0) {
          phases.push({
            kind: 'transform',
            royalKind,
            cells: transformed,
            board: cloneBoard(board),
          });

          const wiped = wipeBoard(board);
          const wipePoints = Math.round(
            scoreForGroup(wiped.length, chain, GROUP_KIND.Normal, game.rules.chainGrowth)
            * game.rules.royalWipeMultiplier
          );
          gained += wipePoints;
          game.score += wipePoints;
          phases.push({ kind: 'wipe', cells: wiped, points: wipePoints, board: cloneBoard(board) });
        }
      }
    }

    if (applyGravity(board, game.rng, game.rules.variant)) {
      phases.push({ kind: 'fall', board: cloneBoard(board) });
    }

    matches = findMatches(board);

    // 盤面が落ち着いたら、1ターン分だけ駒に歳を取らせて昇格を判定する。
    // 昇格でまた揃うことがあるので、その場合はこのループを続ける。
    if (matches.length === 0 && !aged) {
      aged = true;
      const promoted = agePieces(game, board);
      if (promoted.length > 0) {
        phases.push({ kind: 'promote', cells: promoted, board: cloneBoard(board) });
        matches = findMatches(board);
      }
    }

    if (matches.length === 0) break;
  }

  game.moves++;
  game.maxChain = Math.max(game.maxChain, chain);

  return { phases, chain, gained, check: advanceRound(game, gained) };
}

/**
 * 盤面に残っている駒を全部ワイルドに変える。
 * 混合ロイヤルならクイーンとキングが混ざり、単一ロイヤルならその駒だけになる。
 */
function transformToWild(game, board, royalKind) {
  const rankTable = game.rules.variant.rankTable;
  const cells = [];

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      let type;
      if (royalKind === GROUP_KIND.Queens) type = PieceType.Queen;
      else if (royalKind === GROUP_KIND.Kings) type = PieceType.King;
      else type = game.rng() < 0.5 ? PieceType.Queen : PieceType.King;

      board[r][c] = createPiece(type, piece.color, rankTable);
      cells.push({ r, c });
    }
  }
  return cells;
}

/** 盤面を空にする。消えたマスの一覧を返す */
function wipeBoard(board) {
  const cells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      if (!board[r][c]) continue;
      board[r][c] = null;
      cells.push({ r, c });
    }
  }
  return cells;
}

/**
 * 盤面の駒を1ターン分歳を取らせ、条件を満たしたポーンをワイルドに昇格させる。
 * 昇格したマスの一覧を返す。
 *
 * チェスのプロモーションに相当する。ワイルドを「降ってくるもの」ではなく
 * 「消さずに守って作るもの」にするための仕組み。
 */
function agePieces(game, board) {
  const after = game.rules.promoteAfter;
  const promoted = [];

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      piece.age++;

      if (after > 0 && piece.type === PieceType.Pawn && piece.age >= after) {
        // クイーンとキングは同じワイルド。どちらになるかは半々
        const type = game.rng() < 0.5 ? PieceType.Queen : PieceType.King;
        board[r][c] = createPiece(type, piece.color, game.rules.variant.rankTable);
        promoted.push({ r, c });
      }
    }
  }
  return promoted;
}

/**
 * レア役の恩恵としてラウンドを巻き戻す。ノルマもその水準に戻る。
 * 巻き戻らなかったら null を返す。
 */
function rewindRound(game, kind) {
  const ratio = game.rules.royalRewind?.[kind] ?? 0;
  if (ratio <= 0 || game.round <= 1) return null;

  const from = game.round;
  // 「戻すラウンド数」から引く。1 - ratio を先に計算すると
  // 1 - 0.7 = 0.30000000000000004 になり、10ラウンド目が3ではなく4になる。
  // 掛け算のあとの誤差も切り捨てで消えないよう、わずかに足してから丸める。
  const back = Math.floor(from * ratio + 1e-9);
  const to = Math.max(1, from - back);
  if (to >= from) return null;

  game.round = to;
  game.target = targetForRound(game.rules, to);
  return { from, to, kind };
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
