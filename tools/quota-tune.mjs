// ノルマ（quotaBase / quotaGrowth / quotaInterval）を、
// 「1ゲームを何分にしたいか」から逆算する。
//
//   npm run quota-tune [ゲーム数] [記録するターン数]
//
// **記録して再生する方式**にしてある。
// ノルマはゲームの終わりを決めるだけで、1ターンの稼ぎ方には影響しない。
// なので「ノルマ無しで長く回した記録」を1度だけ取り、
// あとはその記録に対してノルマ設定を当てて「何ターン目で落ちるか」を数えればよい。
// これで1回のシミュレーションから何百通りでも試せる。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { cloneBoard } from '../src/board.js';
import { applyMove, createGame } from '../src/game.js';
import { findMatches, groupMatches, isPartOfMatch } from '../src/match.js';
import { playableSquares } from '../src/moves.js';
import { isWild } from '../src/pieces.js';
import { DEFAULT_RULES, VARIANTS, targetForRound } from '../src/rules.js';
import { GROUP_KIND, classifyGroup, scoreForGroup } from '../src/score.js';

const GAMES = Number(process.argv[2] ?? 120);
const CAP = Number(process.argv[3] ?? 150); // 記録するターン数の上限
const variant = VARIANTS.compact;

/** 1ターンの目安の秒数。55ターン=4分・70ターン=5分 の実測から */
const SECONDS_PER_TURN = 4.3;
const minutes = (turns) => (turns * SECONDS_PER_TURN) / 60;

// ---- 立ち回り ---------------------------------------------------------

/** 同じ色で隣り合うワイルドの組の数＝ロイヤルの揃えやすさ */
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

/** その手の結果。points は実際の得点式で出す（連鎖ぶんは読めないので1連鎖目として） */
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
  // 稼ぎながらロイヤルも狙う。
  // 評価は「その手で実際に入る点数」を土台にする。
  // 下ごしらえだけを追うと序盤に稼げずノルマで落ちるので、点数と釣り合わせる。
  '上手い': (board) => {
    const moves = scanMoves(board);
    if (!moves.length) return null;
    const before = alignment(board);
    let best = null, bestScore = -Infinity;
    for (const move of moves) {
      const result = evaluate(board, move);
      if (!result) continue;
      // 重み60は実測で決めた。これ以上寄せに寄せると「最悪の5ターン」が痩せ、
      // ノルマは最悪の5ターンで落とすので、かえって寿命が縮む
      const score = result.points
        + (result.completes ? 5000 : 0)
        + (alignment(result.board) - before) * 60
        - result.consumed * 45;
      if (score > bestScore) { bestScore = score; best = move; }
    }
    return best;
  },
  // 一番多く消せる手を選ぶ
  '普通': (board) => {
    const moves = scanMoves(board);
    if (!moves.length) return null;
    const scored = [];
    for (const move of moves) {
      const result = evaluate(board, move);
      if (result) scored.push({ move, cleared: result.cleared });
    }
    if (!scored.length) return null;
    const best = Math.max(...scored.map((s) => s.cleared));
    return pick(scored.filter((s) => s.cleared === best)).move;
  },
  // 消せる手からランダム
  '初見': (board) => {
    const moves = scanMoves(board);
    return moves.length ? pick(moves) : null;
  },
};

// ---- 記録 -------------------------------------------------------------

/** ノルマ無しで CAP ターン回し、1ターンごとの「稼ぎ」と「出たロイヤル」を記録する */
function record(policy) {
  const games = [];
  for (let g = 0; g < GAMES; g++) {
    const game = createGame(Math.random, { variant, quotaBase: 0, quotaGrowth: 1 });
    const turns = [];
    for (let t = 0; t < CAP; t++) {
      const move = policy(game.board);
      if (!move) break; // 手詰まり
      const result = applyMove(game, move.from, move.to);
      const royals = [];
      for (const phase of result.phases) {
        if (phase.kind === 'clear' && phase.royalKind) royals.push(phase.royalKind);
      }
      turns.push({ gained: result.gained, royals });
    }
    games.push(turns);
  }
  return games;
}

// ---- 再生 -------------------------------------------------------------

/** 記録に設定を当てて「何ターン目で落ちたか」を返す */
function replay(turns, rules) {
  const rewind = rules.royalRewind;
  let round = 1;
  let target = targetForRound(rules, 1);
  let roundScore = 0;
  let turnsLeft = rules.quotaInterval;

  for (let t = 0; t < turns.length; t++) {
    // ロイヤルの巻き戻しは、そのターンの判定より先に効く
    for (const kind of turns[t].royals) {
      const ratio = rewind[kind] ?? 0;
      if (ratio <= 0 || round <= 1) continue;
      const to = Math.max(1, round - Math.floor(round * ratio + 1e-9));
      if (to < round) { round = to; target = targetForRound(rules, to); }
    }

    roundScore += turns[t].gained;
    if (--turnsLeft > 0) continue;

    if (roundScore < target) return { turns: t + 1, round, cleared: false };
    roundScore = rules.quotaCarryOver ? roundScore - target : 0;
    round++;
    target = targetForRound(rules, round);
    turnsLeft = rules.quotaInterval;
  }
  // 記録を使い切った＝手詰まり、または CAP に達した
  return { turns: turns.length, round, cleared: turns.length >= CAP };
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

function assess(recordings, config) {
  const rules = { ...DEFAULT_RULES, ...config };
  const out = {};
  for (const [label, games] of Object.entries(recordings)) {
    const results = games.map((turns) => replay(turns, rules));
    out[label] = {
      turns: median(results.map((r) => r.turns)),
      round: median(results.map((r) => r.round)),
      // CAP まで落ちなかった割合。高いと「終わらないゲーム」
      survived: results.filter((r) => r.cleared).length / results.length,
      firstRound: results.filter((r) => r.round === 1 && !r.cleared).length / results.length,
    };
  }
  return out;
}

// ---- 実行 -------------------------------------------------------------

console.log(`6×6 / 空振り禁止あり / 昇格${DEFAULT_RULES.promoteAfter}ターン`);
console.log(`各${GAMES}ゲームを${CAP}ターンまで記録して、ノルマ設定を当て直す`);
console.log(`（1ターン ${SECONDS_PER_TURN}秒 換算）\n`);

// 記録は重いのでキャッシュする。ルールを変えたら CACHE を消すこと
const CACHE = `.cache/quota-${GAMES}x${CAP}-p${DEFAULT_RULES.promoteAfter}.json`;
let recordings;
if (existsSync(CACHE)) {
  recordings = JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log(`（記録は ${CACHE} を再利用）\n`);
} else {
  recordings = {};
  for (const [label, policy] of Object.entries(POLICIES)) {
    recordings[label] = record(policy);
    process.stderr.write(`  ${label} 記録完了\n`);
  }
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(recordings));
}

const TARGETS = [
  { label: '3分', turns: Math.round((3 * 60) / SECONDS_PER_TURN) },
  { label: '5分', turns: Math.round((5 * 60) / SECONDS_PER_TURN) },
];

// 探索する軸は3つ:
//   quotaBase   … 1ラウンド目を抜けられるか。実測で「5ターンの下位10%」が約490なので
//                 400を超えると初回から落ち始める
//   quotaGrowth … 寿命を刻む主役
//   rewindScale … ロイヤルの巻き戻しの強さ。上手いプレイヤーはロイヤルを何度も出すので、
//                 ここが強いとラウンドが進まず**ゲームが終わらなくなる**
// 環境変数で絞り込める（記録はキャッシュされるので再解析は一瞬）:
//   BASES=350 GROWTHS=1.35,1.7 SCALES=0.5 RAW=1 npm run quota-tune
const nums = (env, fallback) =>
  (process.env[env] ? process.env[env].split(',').map(Number) : fallback);

const BASES = nums('BASES', [250, 350, 450]);
const GROWTHS = nums('GROWTHS', [1.15, 1.25, 1.35, 1.5, 1.7, 1.9]);
const REWIND_SCALES = nums('SCALES', [0, 0.25, 0.5, 0.75, 1]);
const INTERVALS = nums('INTERVALS', [5]);

const BASE_REWIND = DEFAULT_RULES.royalRewind;
const candidates = [];
for (const quotaInterval of INTERVALS) {
  for (const quotaBase of BASES) {
    for (const quotaGrowth of GROWTHS) {
      for (const scale of REWIND_SCALES) {
        const royalRewind = Object.fromEntries(
          Object.entries(BASE_REWIND).map(([k, v]) => [k, v * scale])
        );
        const config = { quotaBase, quotaGrowth, quotaInterval, royalRewind, scale };
        candidates.push({ config, result: assess(recordings, config) });
      }
    }
  }
}

for (const { label, turns: want } of TARGETS) {
  // 巻き戻しの強さごとに「一番近い設定」を出す。
  // 巻き戻しを強くすると上手いプレイヤーのラウンドが進まず、ゲームが終わらなくなる。
  // どこまで残せるかを見えるようにするため、まとめて潰さない
  console.log(`\n■ ${label}想定（上手いで${want}ターン）: 巻き戻しの強さごとの最良`);
  const byScale = {};
  for (const scale of REWIND_SCALES) {
    const best = candidates
      .filter((c) => c.config.scale === scale && c.result['上手い'].firstRound < 0.10)
      .map((c) => ({ ...c, gap: Math.abs(c.result['上手い'].turns - want) }))
      .sort((a, b) => a.gap - b.gap
        || a.result['上手い'].survived - b.result['上手い'].survived)[0];
    if (!best) continue;
    byScale[`巻戻 x${scale}`] = {
      '設定': `初期${best.config.quotaBase} / x${best.config.quotaGrowth}`,
      '上手い T/R': `${best.result['上手い'].turns} / ${best.result['上手い'].round}R`,
      '普通 T': best.result['普通'].turns,
      '初見 T': best.result['初見'].turns,
      '分': `${minutes(best.result['上手い'].turns).toFixed(1)}分`,
      '腕の差': (best.result['上手い'].turns / best.result['初見'].turns).toFixed(2),
      '初見1R落ち': `${(best.result['初見'].firstRound * 100).toFixed(0)}%`,
      '終わらず': `${(best.result['上手い'].survived * 100).toFixed(0)}%`,
    };
  }
  console.table(byScale);

  const ranked = candidates
    .filter((c) => c.result['上手い'].survived < 0.10)   // 終わらないゲームは除く
    .filter((c) => c.result['上手い'].firstRound < 0.10) // 上手いが1Rで落ちるのも除く
    .map((c) => ({ ...c, gap: Math.abs(c.result['上手い'].turns - want) }))
    // ターン数が近いものの中では、腕の差が大きいものを上に
    .sort((a, b) => a.gap - b.gap
      || (b.result['上手い'].turns / b.result['初見'].turns)
       - (a.result['上手い'].turns / a.result['初見'].turns))
    .slice(0, 6);

  console.log(`■ ${label}想定: 総合の上位`);
  const rows = {};
  for (const { config, result } of ranked) {
    rows[`初期${config.quotaBase} / x${config.quotaGrowth} / 巻戻${config.scale}`] = {
      '上手い T/R': `${result['上手い'].turns} / ${result['上手い'].round}R`,
      '普通 T/R': `${result['普通'].turns} / ${result['普通'].round}R`,
      '初見 T/R': `${result['初見'].turns} / ${result['初見'].round}R`,
      '上手い分': `${minutes(result['上手い'].turns).toFixed(1)}分`,
      '腕の差': (result['上手い'].turns / result['初見'].turns).toFixed(2),
      '初見1R落ち': `${(result['初見'].firstRound * 100).toFixed(0)}%`,
      '終わらず': `${(result['上手い'].survived * 100).toFixed(0)}%`,
    };
  }
  console.table(rows);
}

// 絞り込みで何も残らないとき用に、素の分布も出す
if (process.env.RAW) {
  console.log('\n■ 素の分布（全設定）');
  const rows = {};
  for (const { config, result } of candidates) {
    rows[`${config.quotaBase} / x${config.quotaGrowth} / 巻戻${config.scale}`] = {
      '上手い T/R': `${result['上手い'].turns} / ${result['上手い'].round}R`,
      '普通T': result['普通'].turns,
      '初見T': result['初見'].turns,
      '分': `${minutes(result['上手い'].turns).toFixed(1)}分`,
      '腕の差': (result['上手い'].turns / result['初見'].turns).toFixed(2),
      '初見1R落ち': `${(result['初見'].firstRound * 100).toFixed(0)}%`,
      '終わらず': `${(result['上手い'].survived * 100).toFixed(0)}%`,
    };
  }
  console.table(rows);
}
