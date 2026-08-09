import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createGame } from '../src/game.js';
import { findMatches } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { TUTORIAL_STEPS, TUTORIAL_VARIANT, parseBoard } from '../src/tutorial.js';
import { seededRng } from './helpers.js';

/** そのステップの盤面を作る */
function boardOf(step) {
  return parseBoard(step.board, TUTORIAL_VARIANT.rankTable);
}

test('盤面はモードのサイズと一致する', () => {
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    const board = boardOf(step);
    assert.equal(board.length, TUTORIAL_VARIANT.boardSize, `step${i + 1} の行数`);
    for (const row of board) {
      assert.equal(row.length, TUTORIAL_VARIANT.boardSize, `step${i + 1} の列数`);
    }
  }
});

test('どのステップも、最初から消えている並びが無い', () => {
  // 説明の途中で勝手に消えると混乱するので
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    assert.deepEqual(findMatches(boardOf(step)), [], `step${i + 1}`);
  }
});

test('タップしてほしい駒は必ず動かせる', () => {
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    const board = boardOf(step);
    const moves = movableSquares(board, step.select);
    assert.ok(moves.length > 0, `step${i + 1}: 動かせる駒であること`);
  }
});

test('動かしてほしい先は、その駒の合法手に含まれる', () => {
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    if (!step.move) continue;
    const board = boardOf(step);
    const moves = movableSquares(board, step.select);
    assert.ok(
      moves.some((m) => m.r === step.move.r && m.c === step.move.c),
      `step${i + 1}: (${step.move.r},${step.move.c}) へ動かせること`
    );
  }
});

test('1つ目の手では何も消えない（取る動きだけを見せる）', () => {
  const step = TUTORIAL_STEPS[0];
  const game = createGame(seededRng(1), { variant: TUTORIAL_VARIANT, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  game.board = boardOf(step);

  const result = applyMove(game, step.select, step.move);
  assert.notEqual(result, null);
  assert.equal(result.chain, 0, 'この手ではまだ消えない');
});

test('2つ目の手で、ちょうど3マス消える', () => {
  const step = TUTORIAL_STEPS[1];
  const game = createGame(seededRng(1), { variant: TUTORIAL_VARIANT, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  game.board = boardOf(step);

  const result = applyMove(game, step.select, step.move);
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.ok(clear, '消去が起きること');
  assert.equal(clear.cells.length, 3, 'ちょうど3マス');
  assert.equal(clear.chain, 1, '1連鎖目で説明どおりに消えること');
});

test('全ステップが「選ぶ→動かす」をひと続きで持つ', () => {
  // 選ぶだけで終わるステップは作らない（1手の流れとして見せたいため）
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    assert.ok(step.select, `step${i + 1} に select がある`);
    assert.ok(step.move, `step${i + 1} に move がある`);
  }
});

test('文章を持たない（光らせる場所だけで伝える）', () => {
  for (const [i, step] of TUTORIAL_STEPS.entries()) {
    assert.equal(step.text, undefined, `step${i + 1}`);
    assert.equal(step.title, undefined, `step${i + 1}`);
  }
});

test('「揃う相手」は、消えるマスから移動先を除いたものと一致する', () => {
  const step = TUTORIAL_STEPS.find((s) => s.partners);
  assert.ok(step, '揃う相手を見せるステップがあること');

  const game = createGame(seededRng(1), { variant: TUTORIAL_VARIANT, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  game.board = boardOf(step);
  const result = applyMove(game, step.select, step.move);
  const clear = result.phases.find((p) => p.kind === 'clear');

  const cleared = new Set(clear.cells.map((c) => `${c.r},${c.c}`));
  cleared.delete(`${step.move.r},${step.move.c}`);
  assert.deepEqual(
    cleared,
    new Set(step.partners.map((p) => `${p.r},${p.c}`)),
    '光らせる相手と、実際に一緒に消えるマスが一致すること'
  );
});

test('ワイルドのステップがあり、クイーンかキングを動かす', () => {
  const wildStep = TUTORIAL_STEPS.find((step) => {
    const board = boardOf(step);
    const piece = board[step.select.r][step.select.c];
    return piece.type === 'queen' || piece.type === 'king';
  });
  assert.ok(wildStep, 'ワイルドを動かすステップがあること');

  const game = createGame(seededRng(1), { variant: TUTORIAL_VARIANT, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  game.board = boardOf(wildStep);
  const result = applyMove(game, wildStep.select, wildStep.move);
  const clear = result.phases.find((p) => p.kind === 'clear');

  assert.ok(clear, 'ワイルドが混ざって消えること');
  assert.equal(clear.cells.length, 3, 'ちょうど3マス');
});

test('黒の駒を動かすステップがある（白も黒も動かせると伝えるため）', () => {
  const hasBlack = TUTORIAL_STEPS.some((step) => {
    const board = boardOf(step);
    return board[step.select.r][step.select.c].color === 'black';
  });
  assert.ok(hasBlack);
});
