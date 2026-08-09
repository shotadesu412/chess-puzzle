import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createGame } from '../src/game.js';
import { DEFAULT_RULES, VARIANTS, targetForRound } from '../src/rules.js';
import { movableSquares } from '../src/moves.js';
import { Color, PieceType } from '../src/pieces.js';
import { SIZE, makeBoard, put, seededRng } from './helpers.js';

test('ノルマはラウンドごとに上がる', () => {
  const rules = { ...DEFAULT_RULES, quotaBase: 300, quotaGrowth: 1.2 };
  assert.equal(targetForRound(rules, 1), 300);
  assert.equal(targetForRound(rules, 2), 360);
  assert.equal(targetForRound(rules, 3), 432);
});

test('ゲーム開始時は1ラウンド目', () => {
  const game = createGame(seededRng(1));
  assert.equal(game.round, 1);
  assert.equal(game.turnsLeft, game.rules.quotaInterval);
  assert.equal(game.target, targetForRound(game.rules, 1));
  assert.equal(game.over, false);
});

/** 適当に指せる手を1つ返す */
function anyMove(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const [to] = movableSquares(board, { r, c });
      if (to) return { from: { r, c }, to };
    }
  }
  return null;
}

test('ノルマに届かなければゲームオーバー', () => {
  // 1ターンで到底届かないノルマを設定する
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 999999, clearingMovesOnly: false });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(result.check.passed, false);
  assert.equal(game.over, true);
});

test('ゲームオーバー後は動かせない', () => {
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 999999, clearingMovesOnly: false });
  const move = anyMove(game.board);
  applyMove(game, move.from, move.to);

  const next = anyMove(game.board);
  assert.equal(applyMove(game, next.from, next.to), null);
});

test('ノルマを超えたら次のラウンドへ進む', () => {
  // ノルマ0なら必ず突破する
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(result.check.passed, true);
  assert.equal(game.over, false);
  assert.equal(game.round, 2);
  assert.equal(game.turnsLeft, 1);
});

test('区切りのターン以外は判定しない', () => {
  const game = createGame(seededRng(5), { quotaInterval: 5, clearingMovesOnly: false });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(result.check, null);
  assert.equal(game.turnsLeft, 4);
});

test('繰り越しありなら超過分が次のラウンドに残る', () => {
  const game = createGame(seededRng(5), {
    quotaInterval: 1,
    quotaBase: 0,
    quotaGrowth: 1,
    clearingMovesOnly: false,
    quotaCarryOver: true,
  });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(game.roundScore, result.gained, '超過分がそのまま残る');
});

test('繰り越しなしならラウンドスコアは0に戻る', () => {
  const game = createGame(seededRng(5), {
    quotaInterval: 1,
    quotaBase: 0,
    quotaGrowth: 1,
    clearingMovesOnly: false,
    quotaCarryOver: false,
  });
  const move = anyMove(game.board);
  applyMove(game, move.from, move.to);

  assert.equal(game.roundScore, 0);
});

test('ノルマには上限を設けられる', () => {
  const rules = { ...DEFAULT_RULES, quotaBase: 450, quotaGrowth: 1.15, quotaMax: 1000 };
  assert.equal(targetForRound(rules, 1), 450);
  assert.equal(targetForRound(rules, 10), 1000, '上限で頭打ちになる');
  assert.equal(targetForRound(rules, 50), 1000);
});

test('上限0なら青天井（既定）', () => {
  const rules = { ...DEFAULT_RULES, quotaBase: 450, quotaGrowth: 1.15, quotaMax: 0 };
  assert.ok(targetForRound(rules, 20) > 5000);
});

test('混合ロイヤルはラウンドを半分まで巻き戻す', () => {
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });
  game.round = 12;
  game.target = targetForRound(game.rules, 12);
  const before = game.target;

  // 内部関数は直接呼べないので、レア役を含むフェーズを作って確かめる代わりに
  // 設定値だけ確認する（巻き戻しの実挙動は下の統合テストで見る）
  // 巻き戻しも「狙ったときの作りやすさ」の順になっている
  assert.ok(game.rules.royalRewind.royal < game.rules.royalRewind.queens);
  assert.ok(game.rules.royalRewind.queens < game.rules.royalRewind.kings);
  assert.ok(before > targetForRound(game.rules, 6));
});

/** 1手でワイルドだけの並びが完成する盤面 */
function gameAboutToRoyal(pieceType) {
  const game = createGame(seededRng(7), { clearingMovesOnly: false });
  const board = makeBoard([]);
  put(board, 0, 0, pieceType, Color.White);
  put(board, 0, 1, pieceType, Color.White);
  put(board, 0, 2, PieceType.Pawn, Color.Black); // 移動先
  put(board, 4, 2, pieceType, Color.White);      // 同じ列から飛んでくる
  game.board = board;
  return game;
}

test('クイーンロイヤルはラウンドを巻き戻す（混合より大きく戻る）', () => {
  const game = gameAboutToRoyal(PieceType.Queen);
  game.round = 10;
  game.target = targetForRound(game.rules, 10);

  const result = applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.equal(clear.royalKind, 'queens');
  // 0.35 なので 10ラウンド目からは3ラウンド戻る
  assert.deepEqual({ from: clear.rewind.from, to: clear.rewind.to }, { from: 10, to: 7 });
  assert.equal(game.round, 7);
  assert.equal(game.target, targetForRound(game.rules, 7));
});

test('混合ロイヤルはラウンドを一部だけ巻き戻す', () => {
  const game = createGame(seededRng(7), { clearingMovesOnly: false });
  const board = makeBoard([]);
  put(board, 0, 0, PieceType.Queen, Color.White);
  put(board, 0, 1, PieceType.King, Color.White); // 混ぜる
  put(board, 0, 2, PieceType.Pawn, Color.Black);
  put(board, 4, 2, PieceType.Queen, Color.White);
  game.board = board;
  game.round = 12;
  game.target = targetForRound(game.rules, 12);

  const result = applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.equal(clear.royalKind, 'royal');
  assert.equal(game.round, 11, '12 -> 11（0.15なので1ラウンド）');
});

test('1ラウンド目では巻き戻らない', () => {
  const game = gameAboutToRoyal(PieceType.Queen);
  const result = applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.equal(clear.rewind, null);
  assert.equal(game.round, 1);
});
