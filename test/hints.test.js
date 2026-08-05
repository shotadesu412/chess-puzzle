import test from 'node:test';
import assert from 'node:assert/strict';

import { findRoyalChances } from '../src/hints.js';
import { Color, PieceType } from '../src/pieces.js';
import { GROUP_KIND } from '../src/score.js';
import { makeBoard, put, toKeySet } from './helpers.js';

test('あと1手でロイヤル役になる手を見つけられる', () => {
  // 市松模様のポーン盤に、白のクイーンを2つ並べて置く。
  // (0,2) に黒の駒を置いておけば、離れた白クイーンがそこへ飛んで3つ揃う。
  const board = makeBoard([]);
  put(board, 0, 0, PieceType.Queen, Color.White);
  put(board, 0, 1, PieceType.Queen, Color.White);
  put(board, 0, 2, PieceType.Pawn, Color.Black); // 移動先（異色なので取れる）
  put(board, 5, 2, PieceType.Queen, Color.White); // 同じ列にいるので (0,2) へ飛べる

  const chances = findRoyalChances(board);
  assert.ok(chances.length > 0, 'チャンスが見つかること');

  const chance = chances.find((c) => c.to.r === 0 && c.to.c === 2);
  assert.ok(chance, '(0,2) へ動かす手が候補に入ること');
  assert.deepEqual(chance.from, { r: 5, c: 2 });
  assert.equal(chance.kind, GROUP_KIND.Queens, 'クイーンだけなので単一種');
  assert.deepEqual(toKeySet(chance.cells), new Set(['0,0', '0,1', '0,2']));
});

test('クイーンとキングが混ざる場合はロイヤル（混在）になる', () => {
  const board = makeBoard([]);
  put(board, 0, 0, PieceType.Queen, Color.White);
  put(board, 0, 1, PieceType.King, Color.White);
  put(board, 0, 2, PieceType.Pawn, Color.Black);
  put(board, 5, 2, PieceType.Queen, Color.White);

  const chance = findRoyalChances(board).find((c) => c.to.r === 0 && c.to.c === 2);
  assert.ok(chance);
  assert.equal(chance.kind, GROUP_KIND.Royal);
});

test('ワイルドが揃わない盤面ではチャンスは無い', () => {
  // ポーンだけの市松模様。ワイルドが1つも無い
  assert.deepEqual(findRoyalChances(makeBoard([])), []);
});

test('色が違うワイルドは揃わない', () => {
  const board = makeBoard([]);
  put(board, 0, 0, PieceType.Queen, Color.White);
  put(board, 0, 1, PieceType.Queen, Color.Black); // 色が違う
  put(board, 0, 2, PieceType.Pawn, Color.Black);
  put(board, 5, 2, PieceType.Queen, Color.White);

  assert.deepEqual(findRoyalChances(board), []);
});

test('ワイルド以外を動かしてもレア役は作れない（探索対象に入らない）', () => {
  const board = makeBoard([]);
  put(board, 0, 0, PieceType.Queen, Color.White);
  put(board, 0, 1, PieceType.Queen, Color.White);
  put(board, 0, 2, PieceType.Pawn, Color.Black);
  put(board, 5, 2, PieceType.Rook, Color.White); // ワイルドではない

  assert.deepEqual(findRoyalChances(board), []);
});
