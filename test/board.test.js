import test from 'node:test';
import assert from 'node:assert/strict';

import { applyGravity, createInitialBoard } from '../src/board.js';
import { findMatches } from '../src/match.js';
import { SIZE, makeBoard, seededRng } from './helpers.js';

test('重力で駒が下に落ち、上は新しい駒で補充される', () => {
  const board = makeBoard([]);
  const bottom = board[7][0];
  board[3][0] = null;
  board[5][0] = null;

  const changed = applyGravity(board, seededRng(42));

  assert.equal(changed, true);
  assert.equal(board[7][0], bottom, '一番下の駒は動かない');
  for (let r = 0; r < SIZE; r++) {
    assert.notEqual(board[r][0], null, '空きマスは残らない');
  }
});

test('空きマスが無ければ盤面は変わらない', () => {
  const board = makeBoard([]);
  assert.equal(applyGravity(board, seededRng(1)), false);
});

test('初期盤面には消える組み合わせが無い', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const board = createInitialBoard(seededRng(seed));
    assert.deepEqual(findMatches(board), [], `seed=${seed}`);
  }
});

test('補充された駒は、置いた瞬間には消えない', () => {
  // 全マスが空の盤面に重力をかける＝全マスが補充される。
  // 補充だけで消える並びが出来るなら、ここで検出できる。
  for (let seed = 1; seed <= 20; seed++) {
    const board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
    applyGravity(board, seededRng(seed));
    assert.deepEqual(findMatches(board), [], `seed=${seed}`);
  }
});

test('一部だけ空いた盤面でも、補充した駒で消える並びは出来ない', () => {
  const board = makeBoard([]);
  // 上4行をまるごと空にしてから補充する
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < SIZE; c++) board[r][c] = null;
  }
  applyGravity(board, seededRng(11));

  // 落下してきた既存の駒どうしが揃う可能性はあるが、
  // 補充されたマス（上4行）を含む消えは無いはず
  const matched = findMatches(board).filter(({ r }) => r < 4);
  assert.deepEqual(matched, []);
});
