import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/game.js';
import { Color, PieceType, RANK_TABLES, createPiece } from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';
import { LOG_KEY, MAX_GAMES, createLog } from '../src/telemetry.js';
import { seededRng } from './helpers.js';

/** localStorage のかわり */
function fakeStorage(overrides = {}) {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
    ...overrides,
  };
}

const piece = () => createPiece(PieceType.Rook, Color.White, RANK_TABLES.twoTier);

/** applyMove が返すものの最小の形 */
const fakeResult = (over = {}) => ({
  chain: 1,
  gained: 45,
  phases: [{ kind: 'clear', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], royalKind: null }],
  ...over,
});

function playOne(log, game) {
  log.recordMove({
    from: { r: 1, c: 1 }, to: { r: 0, c: 0 }, piece: piece(),
    result: fakeResult(), options: 14, best: 5,
  });
  log.endGame({ game, why: 'quota' });
}

test('1ゲームぶんが記録される', () => {
  const storage = fakeStorage();
  const log = createLog(storage, () => 1000);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  playOne(log, game);

  const [record] = log.games();
  assert.equal(record.mode, 'compact');
  assert.equal(record.turns.length, 1);
  assert.deepEqual(record.turns[0].f, [1, 1]);
  assert.equal(record.turns[0].p, PieceType.Rook);
  assert.equal(record.turns[0].n, 3, '消えたマス数');
  assert.equal(record.turns[0].o, 14, '指せた手の数');
  assert.equal(record.turns[0].b, 5, '一番多く消せた数');
  assert.equal(record.end.why, 'quota');
});

test('設定も一緒に残す（違う設定のログを混ぜて比べられなくなるため）', () => {
  const log = createLog(fakeStorage());
  const game = createGame(seededRng(1), { variant: VARIANTS.compactLong });

  log.startGame({ variant: VARIANTS.compactLong, rules: game.rules });
  playOne(log, game);

  const [record] = log.games();
  assert.equal(record.cfg.base, game.rules.quotaBase);
  assert.equal(record.cfg.growth, game.rules.quotaGrowth);
  assert.equal(record.cfg.promote, game.rules.promoteAfter);
});

test('考えた時間が入る', () => {
  let t = 0;
  const log = createLog(fakeStorage(), () => t);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  t = 3000;
  playOne(log, game);

  assert.equal(log.games()[0].turns[0].ms, 3000);
});

test('放置した時間は上限で切る', () => {
  let t = 0;
  const log = createLog(fakeStorage(), () => t);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  t = 10 * 60 * 1000; // 10分放置
  playOne(log, game);

  assert.equal(log.games()[0].turns[0].ms, 120000);
});

test('レア役の種類が残る', () => {
  const log = createLog(fakeStorage());
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  log.recordMove({
    from: { r: 1, c: 1 }, to: { r: 0, c: 0 }, piece: piece(),
    result: fakeResult({
      phases: [{ kind: 'clear', cells: [{ r: 0, c: 0 }], royalKind: 'queens' }],
    }),
    options: 10, best: 3,
  });
  log.endGame({ game, why: 'quota' });

  assert.equal(log.games()[0].turns[0].k, 'queens');
});

test('1手も指していないゲームは残さない', () => {
  const log = createLog(fakeStorage());
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  log.endGame({ game, why: 'quit' });

  assert.deepEqual(log.games(), []);
});

test('古いゲームから捨てて MAX_GAMES を超えない', () => {
  const storage = fakeStorage();
  const log = createLog(storage);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  for (let i = 0; i < MAX_GAMES + 20; i++) {
    log.startGame({ variant: VARIANTS.compact, rules: game.rules });
    playOne(log, game);
  }

  assert.equal(log.games().length, MAX_GAMES);
});

test('保存できない環境でも例外を投げない（遊べる方が大事）', () => {
  const storage = fakeStorage({
    setItem: () => { throw new Error('QuotaExceededError'); },
  });
  const log = createLog(storage);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  assert.doesNotThrow(() => {
    log.startGame({ variant: VARIANTS.compact, rules: game.rules });
    playOne(log, game);
  });
  assert.deepEqual(log.games(), []);
});

test('保存先が無くても例外を投げない', () => {
  const log = createLog(null);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  assert.doesNotThrow(() => {
    log.startGame({ variant: VARIANTS.compact, rules: game.rules });
    playOne(log, game);
    log.clear();
  });
  assert.deepEqual(log.games(), []);
});

test('壊れた中身が入っていても落ちない', () => {
  const storage = fakeStorage();
  storage.setItem(LOG_KEY, '{壊れている');
  const log = createLog(storage);

  assert.deepEqual(log.games(), []);
});

test('書き出しと消去', () => {
  const log = createLog(fakeStorage(), () => 5000);
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  playOne(log, game);

  const dump = JSON.parse(log.toJSON());
  assert.equal(dump.games.length, 1);
  assert.equal(dump.exportedAt, 5000);

  log.clear();
  assert.deepEqual(log.games(), []);
});

test('要約が出る', () => {
  const log = createLog(fakeStorage());
  const game = createGame(seededRng(1), { variant: VARIANTS.compact });
  game.score = 1234;

  log.startGame({ variant: VARIANTS.compact, rules: game.rules });
  playOne(log, game);

  assert.deepEqual(log.summary(), { games: 1, turns: 1, best: 1234 });
});
