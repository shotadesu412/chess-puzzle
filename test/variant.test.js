import test from 'node:test';
import assert from 'node:assert/strict';

import { applyGravity, createInitialBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, hasSameRankRun } from '../src/match.js';
import { movableSquares, hasAnyMove } from '../src/moves.js';
import { VARIANTS } from '../src/rules.js';
import { seededRng } from './helpers.js';

test('モードごとに盤面サイズが変わる', () => {
  for (const variant of Object.values(VARIANTS)) {
    const board = createInitialBoard(seededRng(3), variant);
    assert.equal(board.length, variant.boardSize, variant.id);
    for (const row of board) assert.equal(row.length, variant.boardSize);
  }
});

test('どのモードでも初期盤面に消える組み合わせは無い', () => {
  for (const variant of Object.values(VARIANTS)) {
    for (let seed = 1; seed <= 10; seed++) {
      const board = createInitialBoard(seededRng(seed), variant);
      assert.deepEqual(findMatches(board), [], `${variant.id} seed=${seed}`);
    }
  }
});

test('6×6モードの駒はランク1か2かワイルドしかない', () => {
  const variant = VARIANTS.compact;
  const board = createInitialBoard(seededRng(9), variant);
  for (const row of board) {
    for (const piece of row) {
      assert.ok([1, 2, 'wild'].includes(piece.rank), `${piece.type} が ${piece.rank}`);
    }
  }
});

test('6×6モードではルークもランク2になる', () => {
  const variant = VARIANTS.compact;
  assert.equal(variant.rankTable.rook, 2);
  assert.equal(VARIANTS.standard.rankTable.rook, 3);
});

test('6×6モードでも1手指せる', () => {
  const game = createGame(seededRng(4), { variant: VARIANTS.compact });
  assert.equal(game.board.length, 6);
  assert.ok(hasAnyMove(game.board));

  // 適当に指せる手を1つ探して指す
  let played = false;
  for (let r = 0; r < 6 && !played; r++) {
    for (let c = 0; c < 6 && !played; c++) {
      const [to] = movableSquares(game.board, { r, c });
      if (!to) continue;
      assert.notEqual(applyMove(game, { r, c }, to), null);
      played = true;
    }
  }
  assert.ok(played, '指せる手が見つかること');
  assert.equal(game.board.length, 6, '盤面サイズは変わらない');
  for (const row of game.board) {
    for (const cell of row) assert.notEqual(cell, null, '空きマスは残らない');
  }
});

test('6×6モードでもスライド駒は盤の端までしか届かない', () => {
  const variant = VARIANTS.compact;
  const board = createInitialBoard(seededRng(2), variant);
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      for (const to of movableSquares(board, { r, c })) {
        assert.ok(to.r >= 0 && to.r < 6 && to.c >= 0 && to.c < 6, `${to.r},${to.c} が盤外`);
      }
    }
  }
});

test('重力はモードの盤面サイズに追従する', () => {
  const variant = VARIANTS.compact;
  const board = createInitialBoard(seededRng(6), variant);
  board[0][0] = null;
  board[3][2] = null;

  assert.equal(applyGravity(board, seededRng(7), variant), true);
  for (const row of board) {
    assert.equal(row.length, 6);
    for (const cell of row) assert.notEqual(cell, null);
  }
});

test('モードごとのノルマが適用される', () => {
  const standard = createGame(seededRng(1), { variant: VARIANTS.standard });
  const compact = createGame(seededRng(1), { variant: VARIANTS.compact });

  assert.equal(standard.target, 300);
  // 6×6 は揃いやすいのでノルマを上げてある
  assert.equal(compact.target, 450);
});

test('呼び出し側の指定はモードの既定値より優先される', () => {
  const game = createGame(seededRng(1), { variant: VARIANTS.compact, quotaBase: 100 });
  assert.equal(game.target, 100);
});

test('初期盤面には同じランクが3つ以上並ぶ形も無い', () => {
  // ランクはオーラの色で見せているので、色違いで消えない並びが最初から
  // 見えていると「揃っているのに消えない」と誤解される
  for (const variant of Object.values(VARIANTS)) {
    for (let seed = 1; seed <= 20; seed++) {
      const board = createInitialBoard(seededRng(seed), variant);
      const size = board.length;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          assert.equal(
            hasSameRankRun(board, r, c),
            false,
            `${variant.id} seed=${seed} (${r},${c}) ランク${board[r][c].rank}`
          );
        }
      }
    }
  }
});

test('途中の補充では同ランクの並びを許す（落下で出来る分は避けられないため）', () => {
  // 初期盤面だけの制限であることを明示しておく
  const variant = VARIANTS.standard;
  const board = createInitialBoard(seededRng(1), variant);
  board[0][0] = null;
  applyGravity(board, seededRng(2), variant); // options なし
  assert.equal(board[0][0] !== null, true);
});
