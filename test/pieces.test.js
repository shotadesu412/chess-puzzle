import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Color,
  PieceType,
  RANK_TABLES,
  WILD,
  createPiece,
  isWild,
  rankLabel,
} from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';

/** モードのランクごとの出現率（%）を集計する */
function weightByRank(variant) {
  const total = variant.spawn.reduce((sum, e) => sum + e.weight, 0);
  const byRank = {};
  for (const { type, weight } of variant.spawn) {
    const rank = variant.rankTable[type];
    byRank[rank] = (byRank[rank] ?? 0) + (weight / total) * 100;
  }
  return byRank;
}

test('どのモードでもランクの出現率は揃えてある', () => {
  // どれかに偏ると、そのランクが3つ揃う確率が上がって消えやすくなりすぎる
  for (const variant of Object.values(VARIANTS)) {
    const byRank = weightByRank(variant);
    const normalRanks = Object.keys(byRank).filter((r) => r !== WILD);
    const first = byRank[normalRanks[0]];
    for (const rank of normalRanks) {
      assert.equal(byRank[rank], first, `${variant.id} のランク${rank}`);
    }
  }
});

test('どのモードでもワイルドは他のランクより出にくい', () => {
  for (const variant of Object.values(VARIANTS)) {
    const byRank = weightByRank(variant);
    assert.ok(byRank[WILD] < byRank[1], `${variant.id}: ワイルド ${byRank[WILD]}%`);
  }
});

test('全ての駒に出現率が設定されている', () => {
  for (const variant of Object.values(VARIANTS)) {
    const types = variant.spawn.map((e) => e.type);
    for (const type of Object.values(PieceType)) {
      assert.ok(types.includes(type), `${variant.id} に ${type} がない`);
    }
  }
});

test('8×8モードはランク3段階、6×6モードは2段階', () => {
  const ranksOf = (variant) =>
    new Set(Object.values(variant.rankTable).filter((r) => r !== WILD));

  assert.deepEqual(ranksOf(VARIANTS.standard), new Set([1, 2, 3]));
  assert.deepEqual(ranksOf(VARIANTS.compact), new Set([1, 2]));
  assert.equal(VARIANTS.standard.boardSize, 8);
  assert.equal(VARIANTS.compact.boardSize, 6);
});

test('クイーンとキングだけがワイルド', () => {
  for (const table of Object.values(RANK_TABLES)) {
    for (const type of Object.values(PieceType)) {
      const wild = isWild(createPiece(type, Color.White, table));
      const expected = type === PieceType.Queen || type === PieceType.King;
      assert.equal(wild, expected, `${type}`);
    }
  }
});

test('ワイルドの表示は W、それ以外はランクの数字', () => {
  const three = RANK_TABLES.threeTier;
  assert.equal(rankLabel(createPiece(PieceType.Queen, Color.White, three)), 'W');
  assert.equal(rankLabel(createPiece(PieceType.Pawn, Color.White, three)), '1');
  assert.equal(rankLabel(createPiece(PieceType.Bishop, Color.White, three)), '2');
  assert.equal(rankLabel(createPiece(PieceType.Rook, Color.White, three)), '3');

  // 2段階モードではルークもランク2になる
  const two = RANK_TABLES.twoTier;
  assert.equal(rankLabel(createPiece(PieceType.Rook, Color.White, two)), '2');
});
