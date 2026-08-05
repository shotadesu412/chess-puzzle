// 消去判定。
//
// 消去ルール:
//   同じ色の駒が縦か横に3マス以上連続し、ランクが揃っていれば消える。
//   クイーンとキングはワイルドで、どのランクの代わりにもなる。
//   ただしワイルドは1個まで。
//
//   111 ○ / 222 ○ / 333 ○     … ランクが揃っている
//   11W ○ / 1W1 ○ / W11 ○      … ワイルドが1個混じっている
//   WWW ○                     … ワイルドだけの並び
//   112 × / 121 × / 123 ×      … ランクが混ざっている
//   1WW × / 2WW ×              … ワイルドが2個ある

import { WILD, rankOf } from './pieces.js';

/** 1つの並びに混ぜられるワイルドの数 */
export const MAX_WILDS = 1;

/**
 * 連続したマスの並び（駒の配列）が消せる条件を満たすか。
 * 長さ1〜2でも条件を満たせば true を返す（判定を伸ばしていくための土台）。
 */
export function isClearableSegment(cells) {
  if (cells.length === 0) return false;
  if (cells.some((cell) => cell === null)) return false;

  const color = cells[0].color;
  if (!cells.every((cell) => cell.color === color)) return false;

  const ranks = cells.map(rankOf);
  const normal = ranks.filter((rank) => rank !== WILD);

  // クイーン・キングだけが並んだ場合（WWW）は消える
  if (normal.length === 0) return true;

  if (ranks.length - normal.length > MAX_WILDS) return false;
  return normal.every((rank) => rank === normal[0]);
}

/**
 * 盤面全体から消えるマスを探す。
 * 戻り値は {r, c} の配列（重複なし）。
 */
export function findMatches(board) {
  const size = board.length;
  const marked = new Set();

  for (let r = 0; r < size; r++) {
    scanLine(marked, size, (i) => [r, i], (i) => board[r][i]); // 横
  }
  for (let c = 0; c < size; c++) {
    scanLine(marked, size, (i) => [i, c], (i) => board[i][c]); // 縦
  }

  return [...marked].map((key) => {
    const [r, c] = key.split(',').map(Number);
    return { r, c };
  });
}

const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * 消えるマスを、隣接しているものどうしでまとめる。
 * 縦と横が交差してL字・十字に消える場合は1つのカタマリとして扱いたいため
 * （1手で大きく消したことを得点に反映する）。
 */
export function groupMatches(cells) {
  const pool = new Map(cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const groups = [];

  for (const cell of cells) {
    if (!pool.delete(`${cell.r},${cell.c}`)) continue;

    const group = [];
    const stack = [cell];
    while (stack.length > 0) {
      const current = stack.pop();
      group.push(current);
      for (const [dr, dc] of NEIGHBORS) {
        const key = `${current.r + dr},${current.c + dc}`;
        const next = pool.get(key);
        if (next) {
          pool.delete(key);
          stack.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * そのマスを含んで「同じランクが3つ以上連続する並び」があるか。色は問わない。
 *
 * 初期盤面で使う。ランクはオーラの色で表示しているので、
 * 色違いで消えない並びが最初から見えていると「揃っているのに消えない」と誤解される。
 */
export function hasSameRankRun(board, r, c, minRun = 3) {
  const size = board.length;
  const piece = board[r][c];
  if (!piece) return false;

  const countTowards = (dr, dc) => {
    let n = 0;
    for (let i = 1; ; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
      const next = board[rr][cc];
      if (!next || next.rank !== piece.rank) break;
      n++;
    }
    return n;
  };

  const horizontal = 1 + countTowards(0, -1) + countTowards(0, 1);
  const vertical = 1 + countTowards(-1, 0) + countTowards(1, 0);
  return horizontal >= minRun || vertical >= minRun;
}

/** 盤面のどこかに「同じランクが3つ以上連続する並び」があるか */
export function hasAnySameRankRun(board) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (hasSameRankRun(board, r, c)) return true;
    }
  }
  return false;
}

/**
 * そのマスが消える並びに含まれているか。
 * 新しく補充する駒を選ぶときに使う（盤面全体を調べるより速い）。
 */
export function isPartOfMatch(board, r, c) {
  const size = board.length;
  const marked = new Set();
  scanLine(marked, size, (i) => [r, i], (i) => board[r][i]);
  scanLine(marked, size, (i) => [i, c], (i) => board[i][c]);
  return marked.has(`${r},${c}`);
}

/**
 * 1本のライン（横1行 or 縦1列）を走査する。
 * 各開始位置から「消せる条件を満たす限り」伸ばし、3マス以上になったらマークする。
 *
 * 条件を満たさなくなる理由（色が違う／ランクが揃わない／ワイルドが多すぎる）は
 * どれも駒を足して解消することがない。つまり一度ダメになったら復活しない。
 * だから while で伸ばすだけで最長の並びが求まる。
 */
function scanLine(marked, size, posAt, cellAt) {
  for (let start = 0; start <= size - 3; start++) {
    const segment = [cellAt(start)];
    if (segment[0] === null) continue;

    let end = start;
    while (end + 1 < size) {
      segment.push(cellAt(end + 1));
      if (!isClearableSegment(segment)) {
        segment.pop();
        break;
      }
      end++;
    }

    if (end - start + 1 >= 3) {
      for (let i = start; i <= end; i++) marked.add(posAt(i).join(','));
    }
  }
}
