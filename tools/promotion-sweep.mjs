// ポーンの昇格（プロモーション）の適正ラインを探す。
//
//   npm run promotion-sweep [ゲーム数] [1ゲームのターン数]
//
// 空振り禁止（clearingMovesOnly）が入っている前提で測る。
//
// 見たいこと:
//   - 昇格が何ターン設定なら、ワイルドの供給が「多すぎず少なすぎず」になるか
//   - ロイヤルが種類ごとに何回起きるか（混合／クイーンだけ／キングだけ）
//   - 盤面がワイルドだらけになって消せなくなっていないか
//   - 手詰まり（消せる手が無くなる）が増えていないか

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, isPartOfMatch } from '../src/match.js';
import { playableSquares } from '../src/moves.js';
import { isWild } from '../src/pieces.js';
import { DEFAULT_RULES, VARIANTS } from '../src/rules.js';
import { GROUP_KIND } from '../src/score.js';

const GAMES = Number(process.argv[2] ?? 400);
const TURNS = Number(process.argv[3] ?? 60);
const variant = VARIANTS.compact;

/** その手で何マス消えるか */
function clearedBy(board, move) {
  const next = cloneBoard(board);
  next[move.to.r][move.to.c] = next[move.from.r][move.from.c];
  next[move.from.r][move.from.c] = null;
  if (!isPartOfMatch(next, move.to.r, move.to.c)) return 0;
  return findMatches(next).length;
}

/** 指せる手を全部（空振り禁止なので、返るのは全部「消える手」） */
function scanMoves(board) {
  const moves = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      for (const to of playableSquares(board, { r, c }, true)) {
        const move = { from: { r, c }, to };
        moves.push({ ...move, cleared: clearedBy(board, move) });
      }
    }
  }
  return moves;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

function run(promoteAfter) {
  let promotions = 0;
  let stuck = 0;
  let turns = 0;
  const royals = { [GROUP_KIND.Royal]: 0, [GROUP_KIND.Queens]: 0, [GROUP_KIND.Kings]: 0 };
  const choices = [];
  const wildShare = [];
  const scores = [];

  for (let g = 0; g < GAMES; g++) {
    // ノルマは切って、盤面の性質だけを見る
    const game = createGame(Math.random, {
      variant, promoteAfter, quotaBase: 0, quotaGrowth: 1,
    });

    for (let t = 0; t < TURNS; t++) {
      const moves = scanMoves(game.board);
      if (moves.length === 0) { stuck++; break; }
      choices.push(moves.length);

      const best = Math.max(...moves.map((m) => m.cleared));
      const move = pick(moves.filter((m) => m.cleared === best));
      const result = applyMove(game, move.from, move.to);
      turns++;

      for (const phase of result.phases) {
        if (phase.kind === 'promote') promotions += phase.cells.length;
        if (phase.kind === 'clear' && phase.royalKind) royals[phase.royalKind]++;
      }

      const pieces = game.board.flat().filter(Boolean);
      wildShare.push(pieces.filter(isWild).length / pieces.length);
    }
    scores.push(game.score);
  }

  const per = (n) => (n / GAMES).toFixed(3);
  const every = (n) => (n === 0 ? '—' : `${(GAMES / n).toFixed(0)}ゲームに1回`);
  const singles = royals[GROUP_KIND.Queens] + royals[GROUP_KIND.Kings];

  return {
    '選択肢': median(choices),
    '昇格/ターン': (promotions / turns).toFixed(2),
    'ワイルド率': `${((wildShare.reduce((a, b) => a + b, 0) / wildShare.length) * 100).toFixed(1)}%`,
    '混合': `${per(royals[GROUP_KIND.Royal])} (${every(royals[GROUP_KIND.Royal])})`,
    'クイーン': `${per(royals[GROUP_KIND.Queens])} (${every(royals[GROUP_KIND.Queens])})`,
    'キング': `${per(royals[GROUP_KIND.Kings])} (${every(royals[GROUP_KIND.Kings])})`,
    '単一/混合': royals[GROUP_KIND.Royal] ? (singles / royals[GROUP_KIND.Royal]).toFixed(2) : '—',
    'スコア中央': median(scores).toLocaleString(),
    '手詰まり': `${((stuck / GAMES) * 100).toFixed(1)}%`,
  };
}

console.log(`6×6 / 空振り禁止あり / 各${GAMES}ゲーム x ${TURNS}ターン`);
console.log(`（現行の設定: promoteAfter = ${DEFAULT_RULES.promoteAfter}）\n`);

const rows = {};
for (const promoteAfter of [0, 8, 10, 12, 14, 16]) {
  const label = promoteAfter === 0 ? '昇格なし' : `${promoteAfter}ターン`;
  rows[label] = run(promoteAfter);
  process.stderr.write(`  ${label} 完了\n`);
}
console.table(rows);

console.log('\n「単一/混合」は、混合ロイヤル1回あたり単一ロイヤルが何回起きるかの比。');
console.log('理論値は0.33（ワイルド3つ揃いの25%が単一）。これより大きいほど「狙って作れている」。');
