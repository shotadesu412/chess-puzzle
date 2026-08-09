import test from 'node:test';
import assert from 'node:assert/strict';

import { groupMatches } from '../src/match.js';
import { Color, PieceType, RANK_TABLES, createPiece as makePiece } from '../src/pieces.js';

const createPiece = (type, color) => makePiece(type, color, RANK_TABLES.threeTier);
import {
  GROUP_KIND,
  KIND_MULTIPLIER,
  chainMultiplier,
  classifyGroup,
  scoreForGroup,
} from '../src/score.js';
import { DEFAULT_RULES } from '../src/rules.js';
import { makeBoard } from './helpers.js';

test('多く消すほど1個あたりの点数が上がる', () => {
  assert.equal(scoreForGroup(3, 1), 45);
  assert.equal(scoreForGroup(4, 1), 80);
  assert.equal(scoreForGroup(5, 1), 125);

  // 3個消しと5個消しの差がはっきり出ること（以前は 30点 と 50点 で1.67倍だった）
  assert.ok(scoreForGroup(5, 1) / scoreForGroup(3, 1) > 2.5);
});

test('連鎖倍率は等比で増える', () => {
  // 大連鎖は滅多に起きない（4連鎖1.7% / 6連鎖0.13%）ので、倍率を等比にして
  // たまに来たときの見返りを大きくしてある
  assert.equal(chainMultiplier(1), 1);
  assert.equal(chainMultiplier(2), 1.5);
  assert.equal(chainMultiplier(3), 2.25);

  // 倍率は差し替えられる（tools/chain-growth.mjs で比較するため）
  assert.equal(chainMultiplier(3, 2), 4);
});

test('連鎖倍率は分散が発散しない範囲に収めてある', () => {
  // 連鎖は1つ伸びるごとに頻度が約0.29倍になるので、
  // 倍率が √(1/0.29) = 1.86 を超えると分散が発散して運ゲーになる
  assert.ok(DEFAULT_RULES.chainGrowth < 1.86);
});

test('クイーン・キングだけの並びは特大ボーナス', () => {
  assert.equal(scoreForGroup(3, 1, GROUP_KIND.Royal), 45 * 50);
  // 普通の消しとは桁が違うこと（バズ要素として成立させたい）
  assert.ok(scoreForGroup(3, 1, GROUP_KIND.Royal) > scoreForGroup(7, 1) * 5);
});

test('単一ロイヤルは、狙ったときの作りにくさに応じた倍率になっている', () => {
  // 実測（狙った立ち回り・1ゲームあたり）: 混合2.93回 / クイーン1.24回 / キング0.96回
  const royal = KIND_MULTIPLIER[GROUP_KIND.Royal];
  const queens = KIND_MULTIPLIER[GROUP_KIND.Queens];
  const kings = KIND_MULTIPLIER[GROUP_KIND.Kings];

  assert.ok(queens > royal, 'クイーンは混合より高い');
  assert.ok(kings > queens, 'キングは一番作りにくいので一番高い');
  assert.equal(scoreForGroup(3, 1, GROUP_KIND.Queens), 45 * 110);
  assert.equal(scoreForGroup(3, 1, GROUP_KIND.Kings), 45 * 150);
});

test('カタマリの種類を判定できる', () => {
  const queen = (color) => createPiece(PieceType.Queen, color);
  const king = (color) => createPiece(PieceType.King, color);

  const board = makeBoard([]);
  const line = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  const place = (pieces) => pieces.forEach((p, i) => (board[0][i] = p));

  place([queen(Color.White), queen(Color.White), queen(Color.White)]);
  assert.equal(classifyGroup(board, line), GROUP_KIND.Queens);

  place([king(Color.White), king(Color.White), king(Color.White)]);
  assert.equal(classifyGroup(board, line), GROUP_KIND.Kings);

  place([queen(Color.White), king(Color.White), queen(Color.White)]);
  assert.equal(classifyGroup(board, line), GROUP_KIND.Royal);

  place([queen(Color.White), king(Color.White), createPiece(PieceType.Pawn, Color.White)]);
  assert.equal(classifyGroup(board, line), GROUP_KIND.Normal);
});

test('隣接していない消去は別のカタマリとして数える', () => {
  const cells = [
    { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
    { r: 5, c: 5 }, { r: 5, c: 6 }, { r: 5, c: 7 },
  ];
  const groups = groupMatches(cells);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.length), [3, 3]);
});

test('縦と横が交差したらひとつの大きなカタマリになる', () => {
  // (2,2) で十字に交差する形
  const cells = [
    { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 },
    { r: 1, c: 2 }, { r: 3, c: 2 },
  ];
  const groups = groupMatches(cells);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 5);
  // 3個消し2回(90点)より、5個の交差(125点)の方が高い
  assert.ok(scoreForGroup(5, 1) > scoreForGroup(3, 1) * 2);
});

test('普通の消しは倍率がかからない', () => {
  const board = makeBoard(['W1 W1 W1 B1 B1 B1 W1 B1']);
  const group = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  assert.equal(classifyGroup(board, group), GROUP_KIND.Normal);
});
