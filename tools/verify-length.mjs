// 2つのモードを「ノルマ有りの本物のゲーム」で通しプレイして、尺を確かめる。
//
//   npm run verify-length [ゲーム数]
//
// quota-tune は「ノルマ無しの記録に設定を当て直す」近似なので、
// 本物のゲームループ（ノルマで途中終了する）で答え合わせをする。

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, groupMatches, isPartOfMatch } from '../src/match.js';
import { playableSquares } from '../src/moves.js';
import { isWild } from '../src/pieces.js';
import { VARIANTS } from '../src/rules.js';
import { GROUP_KIND, classifyGroup, scoreForGroup } from '../src/score.js';

const GAMES = Number(process.argv[2] ?? 200);
const CAP = 200; // 無限に続く場合の打ち切り
const SECONDS_PER_TURN = 4.3;

function alignment(board) {
  let pairs = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const piece = board[r][c];
      if (!piece || !isWild(piece)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const next = board[r + dr]?.[c + dc];
        if (next && isWild(next) && next.color === piece.color) pairs++;
      }
    }
  }
  return pairs;
}

function evaluate(board, move) {
  const next = cloneBoard(board);
  next[move.to.r][move.to.c] = next[move.from.r][move.from.c];
  next[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(next, move.to.r, move.to.c)) return null;

  const matches = findMatches(next);
  let completes = false;
  let consumed = 0;
  let points = 0;
  for (const group of groupMatches(matches)) {
    const kind = classifyGroup(next, group);
    points += scoreForGroup(group.length, 1, kind);
    if (kind !== GROUP_KIND.Normal) completes = true;
    else for (const { r, c } of group) if (isWild(next[r][c])) consumed++;
  }
  return { cleared: matches.length, points, completes, consumed, board: next };
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

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

const POLICIES = {
  '上手い': (board) => {
    const moves = scanMoves(board);
    if (!moves.length) return null;
    const before = alignment(board);
    let best = null, bestScore = -Infinity;
    for (const move of moves) {
      const result = evaluate(board, move);
      if (!result) continue;
      const score = result.points + (result.completes ? 5000 : 0)
        + (alignment(result.board) - before) * 60 - result.consumed * 45;
      if (score > bestScore) { bestScore = score; best = move; }
    }
    return best;
  },
  '普通': (board) => {
    const moves = scanMoves(board);
    if (!moves.length) return null;
    const scored = [];
    for (const move of moves) {
      const result = evaluate(board, move);
      if (result) scored.push({ move, cleared: result.cleared });
    }
    const best = Math.max(...scored.map((s) => s.cleared));
    return pick(scored.filter((s) => s.cleared === best)).move;
  },
  '初見': (board) => {
    const moves = scanMoves(board);
    return moves.length ? pick(moves) : null;
  },
};

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function play(variant, policy) {
  const turns = [], rounds = [], scores = [];
  let firstRound = 0, unfinished = 0, stuck = 0;

  for (let g = 0; g < GAMES; g++) {
    const game = createGame(Math.random, { variant });
    let t = 0;
    for (; t < CAP && !game.over; t++) {
      const move = policy(game.board);
      if (!move) { stuck++; break; }
      applyMove(game, move.from, move.to);
    }
    if (!game.over) unfinished++;
    if (game.over && game.round === 1) firstRound++;
    turns.push(t); rounds.push(game.round); scores.push(game.score);
  }

  return {
    'ターン': median(turns),
    '分': `${((median(turns) * SECONDS_PER_TURN) / 60).toFixed(1)}分`,
    '到達R': median(rounds),
    'スコア中央': median(scores).toLocaleString(),
    '1R落ち': `${((firstRound / GAMES) * 100).toFixed(0)}%`,
    '終わらず': `${((unfinished / GAMES) * 100).toFixed(0)}%`,
    '手詰まり': `${((stuck / GAMES) * 100).toFixed(1)}%`,
  };
}

console.log(`本物のゲームループで通しプレイ / 各${GAMES}ゲーム / 打ち切り${CAP}ターン`);
console.log(`（1ターン ${SECONDS_PER_TURN}秒 換算）`);

for (const variant of Object.values(VARIANTS).filter((v) => v.selectable)) {
  const rows = {};
  for (const [label, policy] of Object.entries(POLICIES)) rows[label] = play(variant, policy);
  console.log(`\n■ ${variant.name}（初期${variant.rules.quotaBase} / x${variant.rules.quotaGrowth}）`);
  console.table(rows);
  console.log(`  腕の差（上手い/初見のターン数）: ${(rows['上手い'].ターン / rows['初見'].ターン).toFixed(2)}倍`);
}
