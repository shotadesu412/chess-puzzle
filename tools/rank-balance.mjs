// ランク1（ポーン）とランク2（ルーク・ビショップ・ナイト）で、
// 揃えやすさに差があるかを測る。
//
//   npm run rank-balance [ゲーム数] [1ターンのターン数]
//
// 出現率は揃えてある（各45%）ので、消えた回数に差が出るなら
// それは「揃えやすさ」の差＝駒の機動力の差ということになる。
// 差があるなら、点数をランクで変える根拠になる。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, groupMatches, isPartOfMatch } from '../src/match.js';
import { playableSquares } from '../src/moves.js';
import { isWild } from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';
import { GROUP_KIND, classifyGroup } from '../src/score.js';

const GAMES = Number(process.argv[2] ?? 300);
const TURNS = Number(process.argv[3] ?? 60);
const variant = VARIANTS.compact;

/** 普通のカタマリのランク（ワイルドは数えない。混ざっていたら null） */
function groupRank(board, cells) {
  const ranks = new Set();
  for (const { r, c } of cells) {
    const piece = board[r][c];
    if (piece && !isWild(piece)) ranks.add(piece.rank);
  }
  return ranks.size === 1 ? [...ranks][0] : null;
}

/** その手で消えるカタマリを調べる */
function outcome(board, move) {
  const next = cloneBoard(board);
  next[move.to.r][move.to.c] = next[move.from.r][move.from.c];
  next[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(next, move.to.r, move.to.c)) return null;

  const matches = findMatches(next);
  const ranks = new Set();
  let cells = 0;
  for (const group of groupMatches(matches)) {
    if (classifyGroup(next, group) !== GROUP_KIND.Normal) continue;
    const rank = groupRank(next, group);
    if (rank) ranks.add(rank);
    cells += group.length;
  }
  return { ranks, cells: matches.length };
}

function scanMoves(board) {
  const moves = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      for (const to of playableSquares(board, { r, c }, true)) {
        moves.push({ from: { r, c }, to });
      }
    }
  }
  return moves;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 盤面に居る割合（＝供給量）
const onBoard = { 1: 0, 2: 0, wild: 0 };
// 実際に消えたマス数
const cleared = { 1: 0, 2: 0 };
// 「その手を指せば消せた」選択肢の数（＝作りやすさ）
const offered = { 1: 0, 2: 0 };
let turns = 0;

for (let g = 0; g < GAMES; g++) {
  const game = createGame(Math.random, { variant, quotaBase: 0, quotaGrowth: 1 });

  for (let t = 0; t < TURNS; t++) {
    const moves = scanMoves(game.board);
    if (moves.length === 0) break;
    turns++;

    for (const piece of game.board.flat().filter(Boolean)) {
      if (isWild(piece)) onBoard.wild++;
      else onBoard[piece.rank]++;
    }

    // このターンに「ランクNを消せる手」が何通りあったか
    const scored = [];
    for (const move of moves) {
      const result = outcome(game.board, move);
      if (!result) continue;
      for (const rank of result.ranks) offered[rank]++;
      scored.push({ move, cells: result.cells });
    }

    const best = Math.max(...scored.map((s) => s.cells));
    const chosen = pick(scored.filter((s) => s.cells === best)).move;

    const result = applyMove(game, chosen.from, chosen.to);
    for (const phase of result.phases) {
      if (phase.kind !== 'clear') continue;
      for (const group of phase.groups) {
        if (group.kind !== GROUP_KIND.Normal) continue;
        const rank = groupRank(phase.board, group.cells);
        if (rank) cleared[rank] += group.cells.length;
      }
    }
  }
}

const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;
const boardTotal = onBoard[1] + onBoard[2] + onBoard.wild;
const clearTotal = cleared[1] + cleared[2];
const offerTotal = offered[1] + offered[2];

console.log(`6×6 / 空振り禁止あり / ${GAMES}ゲーム x ${TURNS}ターン（実測 ${turns} ターン）\n`);
console.table({
  'ランク1（ポーン）': {
    '盤面に居る割合': pct(onBoard[1], boardTotal),
    '消えたマスの割合': pct(cleared[1], clearTotal),
    '消せる手の割合': pct(offered[1], offerTotal),
    '消えやすさ（消/居）': (cleared[1] / clearTotal / (onBoard[1] / boardTotal)).toFixed(2),
  },
  'ランク2（ルーク等）': {
    '盤面に居る割合': pct(onBoard[2], boardTotal),
    '消えたマスの割合': pct(cleared[2], clearTotal),
    '消せる手の割合': pct(offered[2], offerTotal),
    '消えやすさ（消/居）': (cleared[2] / clearTotal / (onBoard[2] / boardTotal)).toFixed(2),
  },
});
console.log(`（ワイルドが盤面に占める割合: ${pct(onBoard.wild, boardTotal)}）`);
console.log('\n「消えやすさ」が1より大きいほど、盤面に居る数のわりによく消えている＝揃えやすい。');
console.log('1ターンあたり「ランクNを消せる手」:',
  `ランク1 ${(offered[1] / turns).toFixed(1)}手 / ランク2 ${(offered[2] / turns).toFixed(1)}手`);
