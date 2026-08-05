// 連鎖倍率（等比の比率）を何パターンか試して、適正値を探す。
//
//   npm run chain-growth
//
// 連鎖の実測分布は「1つ伸びるごとに約0.29倍」で減っていく。
// 倍率 g を掛けると、スコアの期待値は Σ(0.29 g)^n、分散は Σ(0.29 g²)^n で決まる。
//   - 期待値が発散しない条件: g < 1/0.29 = 3.4
//   - 分散が発散しない条件  : g < sqrt(1/0.29) = 1.86
// 分散が発散すると「たまたま出た大連鎖」だけでスコアが決まる運ゲーになるので、
// 1.86 より十分下を選びたい。ここではそれを実測で確かめる。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { movableSquares } from '../src/moves.js';

const GAMES = Number(process.argv[2] ?? 150);
const TURNS = 40;
const GROWTHS = [1, 1.2, 1.5, 1.8, 2, 2.5];

function clearedBy(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(b, move.to.r, move.to.c)) return 0;
  return findMatches(b).length;
}

function chooseMove(board, skilled) {
  let best = 0;
  let picks = [];
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of movableSquares(board, { r, c })) {
        const move = { from: { r, c }, to };
        const cleared = clearedBy(board, move);
        if (cleared === 0) continue;
        if (!skilled) { picks.push(move); continue; }
        if (cleared > best) { best = cleared; picks = [move]; }
        else if (cleared === best) picks.push(move);
      }
    }
  }
  return picks.length ? picks[Math.floor(Math.random() * picks.length)] : null;
}

function play(growth, skilled) {
  const perTurn = [];
  const gameScores = [];
  let chainPoints = 0;
  let total = 0;

  for (let g = 0; g < GAMES; g++) {
    const game = createGame(Math.random, { chainGrowth: growth, quotaBase: 0, quotaGrowth: 1 });
    for (let t = 0; t < TURNS; t++) {
      const move = chooseMove(game.board, skilled);
      if (!move) break;
      const before = game.score;
      const result = applyMove(game, move.from, move.to);
      perTurn.push(game.score - before);
      for (const phase of result.phases) {
        if (phase.kind !== 'clear') continue;
        total += phase.points;
        if (phase.chain >= 2) chainPoints += phase.points;
      }
    }
    gameScores.push(game.score);
  }

  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return {
    turnMedian: med(perTurn),
    gameMedian: med(gameScores),
    gameMean: Math.round(mean(gameScores)),
    maxTurn: Math.max(...perTurn),
    chainShare: chainPoints / total,
  };
}

const rows = {};
for (const growth of GROWTHS) {
  const skilled = play(growth, true);
  const casual = play(growth, false);
  rows[`x${growth}`] = {
    '倍率の例(1-5連鎖)': [1, 2, 3, 4, 5].map((n) => Math.round(growth ** (n - 1) * 10) / 10).join(' '),
    '上手い 1ゲーム中央': skilled.gameMedian,
    '下手 1ゲーム中央': casual.gameMedian,
    '腕の差': (skilled.gameMedian / casual.gameMedian).toFixed(2),
    '平均/中央値': (skilled.gameMean / skilled.gameMedian).toFixed(2),
    '最大1ターン': skilled.maxTurn,
    '連鎖ぶんの割合': `${(skilled.chainShare * 100).toFixed(0)}%`,
  };
  process.stderr.write(`  x${growth} 完了\n`);
}

console.log(`${GAMES}ゲーム x ${TURNS}ターン / パターン\n`);
console.log('「平均/中央値」が1に近いほど分布が素直。大きいと一部の大当たりで平均が吊り上がっている。');
console.table(rows);
