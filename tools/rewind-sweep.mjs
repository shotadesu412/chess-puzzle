// レア役でノルマを巻き戻す割合を振って、狙い通りの形になるか調べる。
//
//   npm run rewind-sweep [ゲーム数] [1ゲームの上限ターン]
//
// 狙い:
//   - 狙わないプレイヤー（普通に一番多く消す）は、きちんと終わる
//   - 狙うプレイヤー（リーチ表示を見てレア役を取りに行く）は、伸ばし続けられる＝スコア青天井
//   その差が出る割合を探す。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { findRoyalChances } from '../src/hints.js';
import { movableSquares } from '../src/moves.js';
import { VARIANTS } from '../src/rules.js';

const GAMES = Number(process.argv[2] ?? 200);
const MAX_TURNS = Number(process.argv[3] ?? 300);
const variant = VARIANTS.compact;
const QUOTA_MAX = 1600;

function clearedBy(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(b, move.to.r, move.to.c)) return 0;
  return findMatches(b).length;
}

function bestMoves(board) {
  const size = board.length;
  let best = 0;
  let picks = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of movableSquares(board, { r, c })) {
        const move = { from: { r, c }, to };
        const cleared = clearedBy(board, move);
        if (cleared === 0) continue;
        if (cleared > best) { best = cleared; picks = [move]; }
        else if (cleared === best) picks.push(move);
      }
    }
  }
  return picks;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function play(rewind, hunt) {
  const game = createGame(Math.random, {
    variant,
    quotaMax: QUOTA_MAX,
    royalRewind: rewind,
  });
  let turns = 0;

  while (!game.over && turns < MAX_TURNS) {
    let move = null;
    if (hunt) {
      const chances = findRoyalChances(game.board);
      if (chances.length > 0) move = pick(chances);
    }
    if (!move) {
      const picks = bestMoves(game.board);
      if (picks.length === 0) break;
      move = pick(picks);
    }
    applyMove(game, move.from, move.to);
    turns++;
  }
  return { round: game.round, turns, score: game.score, survived: !game.over };
}

const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];

const patterns = [
  { label: '巻き戻しなし', royal: 0, single: 0 },
  { label: '0.10 / 0.20', royal: 0.10, single: 0.20 },
  { label: '0.15 / 0.30', royal: 0.15, single: 0.30 },
  { label: '0.20 / 0.40', royal: 0.20, single: 0.40 },
  { label: '0.25 / 0.50', royal: 0.25, single: 0.50 },
  { label: '0.35 / 0.70', royal: 0.35, single: 0.70 },
  { label: '0.50 / 1.00 (現行)', royal: 0.50, single: 1.00 },
];

console.log(`6×6 / ノルマ上限${QUOTA_MAX} / 各${GAMES}ゲーム / 1ゲーム最大${MAX_TURNS}ターン\n`);
console.log('割合(混合/単一)        狙わない: ターン 生存率 スコア      狙う: ターン 生存率 スコア');

for (const p of patterns) {
  const rewind = { royal: p.royal, queens: p.single, kings: p.single };
  const rows = [];
  for (const hunt of [false, true]) {
    const results = [];
    for (let g = 0; g < GAMES; g++) results.push(play(rewind, hunt));
    rows.push({
      turns: median(results.map((r) => r.turns)),
      survive: results.filter((r) => r.survived).length / results.length,
      score: median(results.map((r) => r.score)),
    });
  }
  const fmt = (r) => `${String(r.turns).padStart(5)} ${`${(r.survive * 100).toFixed(0)}%`.padStart(6)} ${r.score.toLocaleString().padStart(10)}`;
  console.log(`${p.label.padEnd(22)} ${fmt(rows[0])}   ${fmt(rows[1])}`);
  process.stderr.write(`  ${p.label} 完了\n`);
}

console.log('\n生存率 = 上限ターンに達しても終わらなかった割合（狙う側で高いほど「青天井」）');
