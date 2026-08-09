import test from 'node:test';
import assert from 'node:assert/strict';

import { hasAnyMove, movableSquares, playableSquares, wouldClear } from '../src/moves.js';
import { Color, PieceType } from '../src/pieces.js';
import { makeBoard, put, toKeySet } from './helpers.js';

// makeBoard([]) は市松模様のポーン盤（(r+c) が偶数なら白、奇数なら黒）。
// 全マスが埋まっているので「駒越えできるか」の確認にちょうどよい。
function checkerBoard() {
  return makeBoard([]);
}

test('ルークは間の駒を飛び越えて、同じ行と列の異色の駒すべてに移動できる', () => {
  const board = checkerBoard();
  put(board, 3, 3, PieceType.Rook, Color.White);

  const squares = toKeySet(movableSquares(board, { r: 3, c: 3 }));
  assert.deepEqual(
    squares,
    new Set(['3,0', '3,2', '3,4', '3,6', '0,3', '2,3', '4,3', '6,3'])
  );
});

test('同じ色の駒のマスには移動できない', () => {
  const board = checkerBoard();
  put(board, 3, 3, PieceType.Rook, Color.White);

  for (const key of toKeySet(movableSquares(board, { r: 3, c: 3 }))) {
    const [r, c] = key.split(',').map(Number);
    assert.equal(board[r][c].color, Color.Black);
  }
});

test('ポーンは斜めの異色の駒だけを取れる（前後どちらも可・前進はしない）', () => {
  const board = checkerBoard();
  put(board, 4, 4, PieceType.Pawn, Color.White);
  put(board, 3, 3, PieceType.Pawn, Color.Black); // 斜め前
  put(board, 5, 5, PieceType.Pawn, Color.Black); // 斜め後ろ
  // (3,5) (5,3) は白のまま → 移動できない。(3,4) (5,4) は真正面なので候補にすら入らない。

  assert.deepEqual(toKeySet(movableSquares(board, { r: 4, c: 4 })), new Set(['3,3', '5,5']));
});

test('ポーンの移動方向は色によらない', () => {
  // 以前は白が上・黒が下だったが、重力も下向きなので黒ポーンが最下段に溜まって
  // 二度と動けなくなっていた（実測でポーンの41%が動けない状態）
  for (const color of [Color.White, Color.Black]) {
    const board = checkerBoard();
    const opposite = color === Color.White ? Color.Black : Color.White;
    put(board, 4, 4, PieceType.Pawn, color);
    for (const [r, c] of [[3, 3], [3, 5], [5, 3], [5, 5]]) {
      put(board, r, c, PieceType.Pawn, opposite);
    }

    assert.deepEqual(
      toKeySet(movableSquares(board, { r: 4, c: 4 })),
      new Set(['3,3', '3,5', '5,3', '5,5']),
      color
    );
  }
});

test('盤の端のポーンでも斜めが空いていれば動ける', () => {
  // 最下段の黒ポーン。以前は下向きにしか取れず、ここで完全に詰んでいた
  const board = checkerBoard();
  const last = board.length - 1;
  put(board, last, 3, PieceType.Pawn, Color.Black);
  put(board, last - 1, 2, PieceType.Pawn, Color.White);
  put(board, last - 1, 4, PieceType.Pawn, Color.White);

  assert.deepEqual(
    toKeySet(movableSquares(board, { r: last, c: 3 })),
    new Set([`${last - 1},2`, `${last - 1},4`])
  );
});

test('ナイトはL字の8マスすべてに行ける（異色なので）', () => {
  const board = checkerBoard();
  put(board, 4, 4, PieceType.Knight, Color.White);

  assert.equal(movableSquares(board, { r: 4, c: 4 }).length, 8);
});

test('キングは隣接8マスのうち異色のマスだけ', () => {
  const board = checkerBoard();
  put(board, 4, 4, PieceType.King, Color.White);

  // 市松模様なので、斜めは同色・上下左右は異色になる
  assert.deepEqual(
    toKeySet(movableSquares(board, { r: 4, c: 4 })),
    new Set(['3,4', '5,4', '4,3', '4,5'])
  );
});

test('ビショップは斜めの異色の駒に、駒越えで届く', () => {
  const board = checkerBoard();
  put(board, 4, 4, PieceType.Bishop, Color.White);
  put(board, 0, 0, PieceType.Pawn, Color.Black); // 4マス先。間は全部埋まっている
  put(board, 6, 6, PieceType.Pawn, Color.Black);

  assert.deepEqual(toKeySet(movableSquares(board, { r: 4, c: 4 })), new Set(['0,0', '6,6']));
});

test('クイーンは縦横斜めすべて', () => {
  const board = checkerBoard();
  put(board, 4, 4, PieceType.Queen, Color.White);
  put(board, 2, 2, PieceType.Pawn, Color.Black); // 斜め

  assert.deepEqual(
    toKeySet(movableSquares(board, { r: 4, c: 4 })),
    new Set(['4,1', '4,3', '4,5', '4,7', '1,4', '3,4', '5,4', '7,4', '2,2'])
  );
});

test('空きマスからは動かせない', () => {
  const board = checkerBoard();
  board[4][4] = null;
  assert.deepEqual(movableSquares(board, { r: 4, c: 4 }), []);
});

test('ポーンだけの市松模様は手詰まりになる（ポーンは斜めにしか動けないため）', () => {
  // 斜めのマスは市松模様だと必ず同じ色になるので、全員が動けない。
  // 実際の盤面は色がランダムなので普通は起きないが、
  // 「ポーンは詰まりやすい」ことを確認しておく。
  assert.equal(hasAnyMove(checkerBoard()), false);
});

test('ルークが1個あれば手詰まりにならない', () => {
  const board = checkerBoard();
  put(board, 3, 3, PieceType.Rook, Color.White);
  assert.equal(hasAnyMove(board), true);
});

test('空振り禁止のときは、消せる手だけが返る', () => {
  const board = checkerBoard();
  put(board, 3, 3, PieceType.Rook, Color.White);

  const all = movableSquares(board, { r: 3, c: 3 });
  const playable = playableSquares(board, { r: 3, c: 3 }, true);

  assert.ok(playable.length <= all.length);
  for (const to of playable) {
    assert.ok(wouldClear(board, { r: 3, c: 3 }, to), '返ってくるのは全部「消える手」');
  }
  for (const to of all) {
    if (wouldClear(board, { r: 3, c: 3 }, to)) {
      assert.ok(
        playable.some((p) => p.r === to.r && p.c === to.c),
        '消える手は漏れなく含まれる'
      );
    }
  }
});

test('空振り禁止を切れば、今までどおり全部の合法手が返る', () => {
  const board = checkerBoard();
  put(board, 3, 3, PieceType.Rook, Color.White);
  assert.deepEqual(
    toKeySet(playableSquares(board, { r: 3, c: 3 }, false)),
    toKeySet(movableSquares(board, { r: 3, c: 3 }))
  );
});
