import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createGame } from '../src/game.js';
import { DEFAULT_RULES, targetForRound } from '../src/rules.js';
import { movableSquares } from '../src/moves.js';
import { SIZE, seededRng } from './helpers.js';

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
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 999999 });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(result.check.passed, false);
  assert.equal(game.over, true);
});

test('ゲームオーバー後は動かせない', () => {
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 999999 });
  const move = anyMove(game.board);
  applyMove(game, move.from, move.to);

  const next = anyMove(game.board);
  assert.equal(applyMove(game, next.from, next.to), null);
});

test('ノルマを超えたら次のラウンドへ進む', () => {
  // ノルマ0なら必ず突破する
  const game = createGame(seededRng(5), { quotaInterval: 1, quotaBase: 0, quotaGrowth: 1 });
  const move = anyMove(game.board);
  const result = applyMove(game, move.from, move.to);

  assert.equal(result.check.passed, true);
  assert.equal(game.over, false);
  assert.equal(game.round, 2);
  assert.equal(game.turnsLeft, 1);
});

test('区切りのターン以外は判定しない', () => {
  const game = createGame(seededRng(5), { quotaInterval: 5 });
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
    quotaCarryOver: false,
  });
  const move = anyMove(game.board);
  applyMove(game, move.from, move.to);

  assert.equal(game.roundScore, 0);
});
