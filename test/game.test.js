import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createGame } from '../src/game.js';
import { findMatches } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { Color, PieceType } from '../src/pieces.js';
import { SIZE, makeBoard, put, seededRng, toKeySet } from './helpers.js';

/**
 * 1手で 113 が完成する盤面を作る。
 *   row0: 白ポーン, 白ポーン, 黒ポーン, ...
 *   (4,2) の白クイーン（ワイルド）が縦に飛んで (0,2) の黒ポーンを取ると W1 W1 W3 が並ぶ。
 */
function gameAboutToMatch() {
  const game = createGame(seededRng(7));
  const board = makeBoard([]);
  put(board, 0, 1, PieceType.Pawn, Color.White);
  put(board, 0, 2, PieceType.Pawn, Color.Black);
  put(board, 4, 2, PieceType.Queen, Color.White);
  game.board = board;
  game.score = 0;
  return game;
}

test('準備した盤面は、動かす前は消える組み合わせが無い', () => {
  assert.deepEqual(findMatches(gameAboutToMatch().board), []);
});

test('移動すると相手の駒を取り、揃った並びが消える', () => {
  const game = gameAboutToMatch();
  const result = applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });

  assert.notEqual(result, null);
  assert.equal(result.phases[0].kind, 'move');
  assert.equal(result.phases[0].board[4][2], null, '動かした駒がいたマスは空く');
  assert.equal(result.phases[0].board[0][2].type, PieceType.Queen, '取ったマスに移動する');

  const firstClear = result.phases.find((p) => p.kind === 'clear');
  assert.deepEqual(toKeySet(firstClear.cells), new Set(['0,0', '0,1', '0,2']));

  assert.ok(result.chain >= 1);
  assert.ok(game.score >= 45, `3個消し(45点)以上は入るはず (${game.score})`);
  assert.equal(game.moves, 1);
});

test('処理が終わった盤面に空きマスと消え残りは無い', () => {
  const game = gameAboutToMatch();
  applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });

  assert.deepEqual(findMatches(game.board), []);
  for (const row of game.board) {
    for (const cell of row) assert.notEqual(cell, null);
  }
});

test('動かせない手は無効（null が返る）', () => {
  const game = gameAboutToMatch();
  // 同じ色の駒のマスへは動けない
  assert.equal(applyMove(game, { r: 4, c: 2 }, { r: 0, c: 0 }), null);
  // クイーンの移動範囲の外（縦横斜めのどれでもない）
  assert.equal(applyMove(game, { r: 4, c: 2 }, { r: 2, c: 3 }), null);
  assert.equal(game.moves, 0);
});

test('消える組み合わせが出来ない手でも、空きマスは補充される', () => {
  const game = createGame(seededRng(3));
  const before = game.board.flat().filter(Boolean).length;

  // 適当に動かせる手を1つ探して指す
  const move = findFirstMove(game.board);
  assert.notEqual(move, null);
  applyMove(game, move.from, move.to);

  assert.equal(game.board.flat().filter(Boolean).length, before);
});

function findFirstMove(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const [to] = movableSquares(board, { r, c });
      if (to) return { from: { r, c }, to };
    }
  }
  return null;
}

test('消去フェーズはカタマリごとの点数を持つ（消えた位置に出す演出で使う）', () => {
  const game = gameAboutToMatch();
  const result = applyMove(game, { r: 4, c: 2 }, { r: 0, c: 2 });
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.ok(clear.groups.length > 0);
  for (const group of clear.groups) {
    assert.ok(Array.isArray(group.cells) && group.cells.length >= 3);
    assert.ok(typeof group.points === 'number' && group.points > 0);
    assert.ok(typeof group.kind === 'string');
  }

  const sum = clear.groups.reduce((total, g) => total + g.points, 0);
  assert.equal(sum, clear.points, 'カタマリの合計がフェーズの点数と一致すること');
});
