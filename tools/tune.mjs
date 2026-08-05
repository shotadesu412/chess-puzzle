// ノルマ制のパラメータを総当たりで試して、適正値を探す。
//
//   npm run tune          # 既定のパターンを比較
//   npm run tune 300      # 1パターンあたりのゲーム数を指定
//
// 見るべき点:
//   到達ラウンド  … ゲームがどれくらい続くか
//   総ターン数    … プレイ時間の目安（1ターン数秒として）
//   上手い/下手   … 腕の差がゲームの長さに出ているか
//   1R落ち       … 1ラウンド目で終わる割合。高いと理不尽

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { movableSquares } from '../src/moves.js';
import { VARIANTS } from '../src/rules.js';

const GAMES = Number(process.argv[2] ?? 400);
const MAX_TURNS = 400; // 無限に続くパターンを打ち切る保険

function clearedBy(board, move) {
  const b = cloneBoard(board);
  b[move.to.r][move.to.c] = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(b, move.to.r, move.to.c)) return 0;
  return findMatches(b).length;
}

/**
 * プレイヤーの腕前を3段階で模擬する。
 *   skilled … 一番多く消せる手を選ぶ（上手い）
 *   casual  … 消せる手からランダム（ルールは分かっている）
 *   novice  … 合法手からランダム（初見。消せるかどうか見ていない）
 */
function chooseMove(board, policy) {
  let best = 0;
  let picks = [];
  const all = [];

  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of movableSquares(board, { r, c })) {
        const move = { from: { r, c }, to };
        if (policy === 'novice') { all.push(move); continue; }
        const cleared = clearedBy(board, move);
        if (cleared === 0) continue;
        if (policy === 'casual') { picks.push(move); continue; }
        if (cleared > best) { best = cleared; picks = [move]; }
        else if (cleared === best) picks.push(move);
      }
    }
  }

  const pool = policy === 'novice' ? all : picks;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function run(rules, policy) {
  const rounds = [];
  const turnCounts = [];
  let stuck = 0;

  for (let g = 0; g < GAMES; g++) {
    const game = createGame(Math.random, rules);
    let turns = 0;
    while (!game.over && turns < MAX_TURNS) {
      const move = chooseMove(game.board, policy);
      if (!move) { stuck++; break; }
      applyMove(game, move.from, move.to);
      turns++;
    }
    rounds.push(game.round); // 落ちたラウンド
    turnCounts.push(turns);
  }

  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const firstRoundFail = rounds.filter((r) => r === 1).length / rounds.length;
  return {
    round: med(rounds),
    turns: med(turnCounts),
    firstRoundFail,
    stuck,
  };
}

// モードごとにノルマの当たり具合を比べる。
// 6×6 は盤面が狭くマスも少ないので、8×8 と同じ数値では成立しない可能性がある。
const patterns = [];
for (const variant of Object.values(VARIANTS)) {
  // モードごとの既定値を中心に、前後を比べる
  const base = variant.rules.quotaBase;
  for (const quota of [
    { quotaBase: Math.round(base * 0.7), quotaGrowth: 1.15 },
    { quotaBase: base, quotaGrowth: 1.15 },
    { quotaBase: Math.round(base * 1.3), quotaGrowth: 1.15 },
  ]) {
    patterns.push({ variant, quotaInterval: 5, quotaCarryOver: true, ...quota });
  }
}

console.log(`1パターンあたり ${GAMES} ゲーム x 3種類のプレイヤー\n`);
const rows = {};
for (const rules of patterns) {
  const skilled = run(rules, 'skilled');
  const casual = run(rules, 'casual');
  const novice = run(rules, 'novice');
  const label = `${rules.variant.boardSize}x${rules.variant.boardSize} 初期${rules.quotaBase}`;
  rows[label] = {
    '上手い R/ターン': `${skilled.round} / ${skilled.turns}`,
    '普通 R/ターン': `${casual.round} / ${casual.turns}`,
    '初見 R/ターン': `${novice.round} / ${novice.turns}`,
    '腕の差(R)': (skilled.round / Math.max(casual.round, 1)).toFixed(2),
    '初見の1R落ち': `${(novice.firstRoundFail * 100).toFixed(0)}%`,
    '上手いの1R落ち': `${(skilled.firstRoundFail * 100).toFixed(0)}%`,
  };
  process.stderr.write(`  ${label} 完了\n`);
}
console.table(rows);
