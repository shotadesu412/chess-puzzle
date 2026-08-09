import test from 'node:test';
import assert from 'node:assert/strict';

import { CHART_PIECES, CHART_SIZE, movementSquares } from '../src/movement-chart.js';
import { GLYPH, PieceType, RANK_TABLES } from '../src/pieces.js';

const center = (CHART_SIZE - 1) / 2;
const keys = (type) => new Set(movementSquares(type).map((s) => `${s.r},${s.c}`));

test('全ての駒が表に載っている', () => {
  const listed = CHART_PIECES.map((p) => p.type);
  for (const type of Object.values(PieceType)) {
    assert.ok(listed.includes(type), `${type} が表にない`);
  }
});

test('ナイトが収まる大きさになっている', () => {
  // ナイトは2マス動くので、中央から2マス取れる大きさが要る
  assert.ok(CHART_SIZE >= 5);
  assert.equal(CHART_SIZE % 2, 1, '中央に駒を置くので奇数');
});

test('ポーンは斜め4方向だけ', () => {
  assert.deepEqual(
    keys(PieceType.Pawn),
    new Set([`${center - 1},${center - 1}`, `${center - 1},${center + 1}`,
             `${center + 1},${center - 1}`, `${center + 1},${center + 1}`])
  );
});

test('ナイトはL字8マス', () => {
  assert.equal(keys(PieceType.Knight).size, 8);
});

test('キングは隣接8マス', () => {
  assert.equal(keys(PieceType.King).size, 8);
});

test('ルークは縦横、ビショップは斜め、クイーンはその両方', () => {
  const rook = keys(PieceType.Rook);
  const bishop = keys(PieceType.Bishop);
  const queen = keys(PieceType.Queen);

  // 5x5 なので、それぞれ4方向 x 2マス = 8マス
  assert.equal(rook.size, 8);
  assert.equal(bishop.size, 8);
  assert.equal(queen.size, 16);

  for (const k of rook) assert.ok(queen.has(k), 'クイーンはルークの動きを含む');
  for (const k of bishop) assert.ok(queen.has(k), 'クイーンはビショップの動きを含む');
  for (const k of rook) assert.ok(!bishop.has(k), 'ルークとビショップは重ならない');
});

test('駒越えできることが表に出る（間のマスを飛ばさない）', () => {
  // ルークの2マス先が入っていること＝間に駒があっても届くという意味
  const rook = keys(PieceType.Rook);
  assert.ok(rook.has(`${center},${center + 2}`), '2マス先まで動ける');
  assert.ok(rook.has(`${center},${center - 2}`));
});

test('モードが違っても動きは変わらない', () => {
  // ランクの区分は消去の判定にしか使わない
  for (const type of Object.values(PieceType)) {
    const two = movementSquares(type, RANK_TABLES.twoTier).length;
    const three = movementSquares(type, RANK_TABLES.threeTier).length;
    assert.equal(two, three, type);
  }
});

test('切り替え用に、全ての駒がマークを持っている', () => {
  // 表のタブは名前ではなく駒のマークで出すので、全種類にマークが要る
  for (const { type } of CHART_PIECES) {
    assert.ok(GLYPH[type], `${type} のマークがない`);
  }
});

test('駒ごとに動きが違う（切り替える意味がある）', () => {
  const patterns = CHART_PIECES.map(({ type }) =>
    [...keys(type)].sort().join(' ')
  );
  // ビショップ以外に同じ形が無いこと（キングとナイトは数は同じでも形が違う）
  assert.equal(new Set(patterns).size, patterns.length, '全ての駒で動きが異なること');
});
