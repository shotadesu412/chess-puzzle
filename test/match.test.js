import test from 'node:test';
import assert from 'node:assert/strict';

import { findMatches, isClearableSegment } from '../src/match.js';
import { Color, PieceType, RANK_TABLES, createPiece as makePiece } from '../src/pieces.js';

const createPiece = (type, color) => makePiece(type, color, RANK_TABLES.threeTier);
import { makeBoard, piece, toKeySet } from './helpers.js';

/** "11W" のような並びを白の駒に変換する（W = ワイルド） */
function whiteRanks(ranks) {
  return [...ranks].map((n) => piece(`W${n}`));
}

test('ランクが揃っていれば消える', () => {
  for (const ranks of ['111', '222', '333', 'WWW', '1111', '2222']) {
    assert.equal(isClearableSegment(whiteRanks(ranks)), true, `${ranks} は消せるはず`);
  }
});

test('ワイルド（クイーン・キング）は1個まで混ぜられる', () => {
  for (const ranks of ['11W', '1W1', 'W11', '22W', '2W2', 'W22', '33W', '3W3', '111W']) {
    assert.equal(isClearableSegment(whiteRanks(ranks)), true, `${ranks} は消せるはず`);
  }
  for (const ranks of ['1WW', 'W1W', 'WW1', '2WW', '3WW', 'W3W']) {
    assert.equal(isClearableSegment(whiteRanks(ranks)), false, `${ranks} はワイルドが2個なので消せない`);
  }
});

test('違うランクは混ぜられない', () => {
  for (const ranks of ['112', '121', '211', '212', '221', '122', '123', '223', '133', '231', '321']) {
    assert.equal(isClearableSegment(whiteRanks(ranks)), false, `${ranks} は消せないはず`);
  }
});

test('同じランクなら駒の種類が違ってもよい', () => {
  const knight = createPiece(PieceType.Knight, Color.White);
  const bishop = createPiece(PieceType.Bishop, Color.White);
  // ナイトとビショップはどちらもランク2
  assert.equal(isClearableSegment([knight, bishop, knight]), true);

  // ルークはランク3なので、ナイト・ビショップとは揃わない
  const rook = createPiece(PieceType.Rook, Color.White);
  assert.equal(isClearableSegment([rook, bishop, knight]), false);
});

test('クイーンとキングは同じワイルドとして扱う', () => {
  const queen = createPiece(PieceType.Queen, Color.White);
  const king = createPiece(PieceType.King, Color.White);
  assert.equal(isClearableSegment([queen, king, queen]), true);
});

test('色が違うと消せない', () => {
  assert.equal(isClearableSegment([piece('W1'), piece('W1'), piece('B1')]), false);
});

test('空きマスを含むと消せない', () => {
  assert.equal(isClearableSegment([piece('W1'), null, piece('W1')]), false);
});

test('横に3つ並ぶと消える（111）', () => {
  const board = makeBoard(['W1 W1 W1 B1 W1 B1 W1 B1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2']));
});

test('ワイルドが混じった並びも消える（11W）', () => {
  const board = makeBoard(['W1 W1 WW B1 W1 B1 W1 B1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2']));
});

test('ワイルドが先頭でも消える（W11）', () => {
  const board = makeBoard(['WW W1 W1 B1 W1 B1 W1 B1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2']));
});

test('クイーン・キングだけでも3つ並べば消える（WWW）', () => {
  const board = makeBoard(['WW WW WW B1 W1 B1 W1 B1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2']));
});

test('ランクが混ざった並びは消えない（112）', () => {
  const board = makeBoard(['W1 W1 W2 B1 W1 B1 W1 B1']);
  assert.deepEqual(findMatches(board), []);
});

test('ワイルドが2個ある並びは消えない（1WW）', () => {
  const board = makeBoard(['W1 WW WW B1 W1 B1 W1 B1']);
  assert.deepEqual(findMatches(board), []);
});

test('2マスだけでは消えない', () => {
  const board = makeBoard(['W1 W1 B1 W1 B1 W1 B1 W1']);
  assert.deepEqual(findMatches(board), []);
});

test('4マス以上そろえば全部まとめて消える（111W）', () => {
  const board = makeBoard(['W1 W1 W1 WW B1 W1 B1 W1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2', '0,3']));
});

test('4マス目のランクが違えば、条件を満たす3マスだけ消える（1112）', () => {
  const board = makeBoard(['W1 W1 W1 W2 B1 W1 B1 W1']);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '0,1', '0,2']));
});

test('縦にも判定される', () => {
  const board = makeBoard([
    'W1 B1 W1 B1 W1 B1 W1 B1',
    'W1 W1 B1 W1 B1 W1 B1 W1',
    'W1 B1 W1 B1 W1 B1 W1 B1',
  ]);
  assert.deepEqual(toKeySet(findMatches(board)), new Set(['0,0', '1,0', '2,0']));
});
