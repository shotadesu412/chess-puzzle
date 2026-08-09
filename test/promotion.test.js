import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createGame } from '../src/game.js';
import { findMatches } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { Color, PieceType, createPiece, isWild } from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';
import { seededRng } from './helpers.js';

/** 適当に指せる手を1つ返す */
function anyMove(board) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const [to] = movableSquares(board, { r, c });
      if (to) return { from: { r, c }, to };
    }
  }
  return null;
}

function countPawns(board) {
  return board.flat().filter((p) => p && p.type === PieceType.Pawn).length;
}

function countWilds(board) {
  return board.flat().filter((p) => p && isWild(p)).length;
}

test('駒は1手ごとに歳を取る', () => {
  const game = createGame(seededRng(3), { variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  const before = game.board.flat().map((p) => p.age);
  assert.ok(before.every((age) => age === 0), '最初は全部0');

  const move = anyMove(game.board);
  applyMove(game, move.from, move.to);

  // 生き残っている駒は1以上になっている
  assert.ok(game.board.flat().some((p) => p.age >= 1));
});

test('規定ターン残ったポーンはワイルドに昇格する', () => {
  const game = createGame(seededRng(11), {
    variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false, promoteAfter: 3,
  });

  let promotedSomewhere = false;
  for (let t = 0; t < 12 && !promotedSomewhere; t++) {
    const move = anyMove(game.board);
    if (!move) break;
    const result = applyMove(game, move.from, move.to);
    promotedSomewhere = result.phases.some((p) => p.kind === 'promote');
  }
  assert.ok(promotedSomewhere, '数手のうちに昇格が起きること');
});

test('昇格すると、そのマスの駒がポーンからワイルドに変わる', () => {
  const game = createGame(seededRng(5), {
    variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false, promoteAfter: 2,
  });

  for (let t = 0; t < 10; t++) {
    const move = anyMove(game.board);
    if (!move) break;
    const result = applyMove(game, move.from, move.to);
    const phase = result.phases.find((p) => p.kind === 'promote');
    if (!phase) continue;

    for (const { r, c } of phase.cells) {
      assert.ok(isWild(phase.board[r][c]), '昇格後はワイルドになっている');
    }
    return;
  }
  assert.fail('昇格が起きなかった');
});

test('promoteAfter が 0 なら昇格しない', () => {
  const game = createGame(seededRng(7), {
    variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false, promoteAfter: 0,
  });

  for (let t = 0; t < 20; t++) {
    const move = anyMove(game.board);
    if (!move) break;
    const result = applyMove(game, move.from, move.to);
    assert.ok(!result.phases.some((p) => p.kind === 'promote'), '昇格は起きない');
  }
});

test('昇格が短いほどワイルドが増える', () => {
  // 統計的な検証なので乱数は固定する。Math.random だとまれに落ちる
  const wildsAfter = (promoteAfter) => {
    let total = 0;
    for (let g = 0; g < 12; g++) {
      const game = createGame(seededRng(100 + g), {
        variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1,
        clearingMovesOnly: false, promoteAfter,
      });
      for (let t = 0; t < 25; t++) {
        const move = anyMove(game.board);
        if (!move) break;
        applyMove(game, move.from, move.to);
      }
      total += countWilds(game.board);
    }
    return total;
  };

  assert.ok(wildsAfter(3) > wildsAfter(15), '3ターン昇格の方がワイルドが多い');
});

test('昇格しても盤面は埋まったまま', () => {
  const game = createGame(seededRng(9), {
    variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false, promoteAfter: 2,
  });
  for (let t = 0; t < 15; t++) {
    const move = anyMove(game.board);
    if (!move) break;
    applyMove(game, move.from, move.to);
    for (const row of game.board) {
      for (const cell of row) assert.notEqual(cell, null);
    }
  }
});

/**
 * 色が1マスおきに交互のポーン盤。同じ色が3つ並ばないので絶対に消えない。
 * ここに調べたい駒だけ置く。
 */
function quietBoard() {
  const rankTable = VARIANTS.compact.rankTable;
  const size = VARIANTS.compact.boardSize;
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) =>
      createPiece(PieceType.Pawn, (r + c) % 2 === 0 ? Color.Black : Color.White, rankTable)
    )
  );
}

/** ワイルドが1手で3つ並ぶ盤面を用意する */
function gameAboutToRoyal(wildType, options = {}) {
  const game = createGame(seededRng(4), {
    variant: VARIANTS.compact, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false, promoteAfter: 0, ...options,
  });
  const rankTable = VARIANTS.compact.rankTable;
  game.board = quietBoard();
  game.board[0][0] = createPiece(wildType, Color.White, rankTable);
  game.board[0][1] = createPiece(wildType, Color.White, rankTable);
  // (0,2) は黒のポーンのまま＝移動先。
  // キングは1マスしか動けないので、移動元は真下の隣接マスにする
  game.board[1][2] = createPiece(wildType, Color.White, rankTable);
  return game;
}

/** gameAboutToRoyal で動かす手 */
const ROYAL_MOVE = { from: { r: 1, c: 2 }, to: { r: 0, c: 2 } };

test('準備した盤面は、動かす前は何も消えない', () => {
  const game = gameAboutToRoyal(PieceType.Queen);
  assert.deepEqual(findMatches(game.board), []);
});

test('レア役が出ると盤面が全部ワイルドに変わって一掃される', () => {
  const game = gameAboutToRoyal(PieceType.Queen);
  const result = applyMove(game, ROYAL_MOVE.from, ROYAL_MOVE.to);

  const transform = result.phases.find((p) => p.kind === 'transform');
  const wipe = result.phases.find((p) => p.kind === 'wipe');
  assert.ok(transform, '盤面がワイルドに変わること');
  assert.ok(wipe, '一掃されること');

  for (const row of transform.board) {
    for (const cell of row) {
      if (cell) assert.ok(isWild(cell), '残っている駒は全部ワイルド');
    }
  }
  for (const row of wipe.board) {
    for (const cell of row) assert.equal(cell, null, '一掃後は空');
  }
  for (const row of game.board) {
    for (const cell of row) assert.notEqual(cell, null, '最終的には埋まっている');
  }
  assert.ok(wipe.points > 0, '一掃で点が入る');
});

test('単一ロイヤルならその駒だけになる', () => {
  const game = gameAboutToRoyal(PieceType.King);
  const result = applyMove(game, ROYAL_MOVE.from, ROYAL_MOVE.to);
  const transform = result.phases.find((p) => p.kind === 'transform');

  assert.ok(transform);
  for (const row of transform.board) {
    for (const cell of row) {
      if (cell) assert.equal(cell.type, PieceType.King, 'キングロイヤルなら全部キング');
    }
  }
});

test('royalWipe を切れば盤面は変わらない', () => {
  const game = gameAboutToRoyal(PieceType.Queen, { royalWipe: false });
  const result = applyMove(game, ROYAL_MOVE.from, ROYAL_MOVE.to);
  assert.ok(!result.phases.some((p) => p.kind === 'transform'));
});

test('一掃してもノルマの巻き戻しは効く（盤面とノルマの両方がリセットされる）', () => {
  // キングロイヤルは一番作りにくいので、一番大きく戻る（0.5）
  const game = gameAboutToRoyal(PieceType.King);
  game.round = 9;
  game.target = 9999;

  applyMove(game, ROYAL_MOVE.from, ROYAL_MOVE.to);
  assert.equal(game.round, 5, 'キングロイヤルは9ラウンド目から4ラウンド戻す');
});
