// プレイ履歴の記録。
//
// 目的は2つ:
//   1. 自分のプレイを後から分析する（どこで死ぬか、最善手をどれくらい選べているか）
//   2. 将来ユーザーの傾向を集めるときの土台にする
//
// **DOMには触らない。** 保存先は呼び出し側から渡す（localStorage を想定）。
// 保存できない環境（プライベートモードなど）では黙って記録をやめる。
// ログのために遊べなくなるのが一番まずい。
//
// 個人を特定する情報は一切入れない。入っているのは盤面の座標と駒と点数だけ。

/** 保存先のキー */
export const LOG_KEY = 'chess-puzzle.log';

/**
 * ログの形式の版。
 * 項目を変えたら上げること。分析する側が混ざったログを見分けられなくなる。
 */
export const LOG_VERSION = 1;

/** 残しておくゲーム数。1ゲーム約3KBなので、300ゲームで1MB弱 */
export const MAX_GAMES = 300;

/**
 * プレイ履歴を記録する。
 *
 * @param storage localStorage 互換のもの（getItem/setItem/removeItem）。無ければ記録しない
 * @param now     現在時刻を返す関数（テストで差し替えるため）
 */
export function createLog(storage, now = () => Date.now()) {
  let current = null;   // 進行中のゲームの記録
  let lastAt = 0;       // 直前の手が終わった時刻（考えた時間を出すため）
  let broken = false;   // 一度でも保存に失敗したら、以後は何もしない

  function read() {
    if (!storage || broken) return [];
    try {
      const raw = storage.getItem(LOG_KEY);
      if (!raw) return [];
      const games = JSON.parse(raw);
      return Array.isArray(games) ? games : [];
    } catch {
      return [];
    }
  }

  function write(games) {
    if (!storage || broken) return;
    try {
      storage.setItem(LOG_KEY, JSON.stringify(games.slice(-MAX_GAMES)));
    } catch {
      // 容量オーバーなら古い分を捨ててもう一度だけ試す
      try {
        storage.setItem(LOG_KEY, JSON.stringify(games.slice(-Math.floor(MAX_GAMES / 4))));
      } catch {
        broken = true;
      }
    }
  }

  return {
    /** 1ゲームの記録を始める。前のゲームが終わっていなければ捨てる */
    startGame({ variant, rules }) {
      current = {
        v: LOG_VERSION,
        at: now(),
        mode: variant.id,
        // 分析するときに「どの設定で遊んだログか」が分からないと比べられない
        cfg: {
          base: rules.quotaBase,
          growth: rules.quotaGrowth,
          promote: rules.promoteAfter,
          chain: rules.chainGrowth,
        },
        turns: [],
        end: null,
      };
      lastAt = now();
    },

    /**
     * 1手を記録する。**指す前の盤面**から出した値を渡すこと。
     *
     * @param options その手番に指せた手の数
     * @param best    その手番で一番多く消せた数（選べたかどうかの物差し）
     */
    recordMove({ from, to, piece, result, options, best }) {
      if (!current) return;
      const at = now();
      current.turns.push({
        t: current.turns.length + 1,
        f: [from.r, from.c],
        to: [to.r, to.c],
        p: piece.type,
        c: piece.color,
        n: result.phases.reduce((sum, ph) => sum + (ph.kind === 'clear' ? ph.cells.length : 0), 0),
        ch: result.chain,
        pts: result.gained,
        k: result.phases.find((ph) => ph.royalKind)?.royalKind ?? null,
        o: options,
        b: best,
        ms: Math.min(at - lastAt, 120000), // 放置した分は上限で切る
      });
      lastAt = at;
    },

    /** ゲームの終わりを記録して保存する。why は 'quota' | 'stuck' | 'quit' */
    endGame({ game, why }) {
      if (!current) return;
      current.end = {
        round: game.round,
        score: game.score,
        turns: current.turns.length,
        maxChain: game.maxChain,
        why,
      };
      // 1手も指していないゲームは残さない（モードを切り替えただけ等）
      if (current.turns.length > 0) write([...read(), current]);
      current = null;
    },

    /** 保存済みのゲーム（進行中のものは含まない） */
    games() {
      return read();
    },

    /** 書き出す用の JSON 文字列 */
    toJSON() {
      return JSON.stringify({ v: LOG_VERSION, exportedAt: now(), games: read() }, null, 2);
    },

    /** ざっくりした要約。画面に出す用 */
    summary() {
      const games = read();
      const finished = games.filter((g) => g.end);
      const turns = finished.reduce((sum, g) => sum + g.end.turns, 0);
      return {
        games: games.length,
        turns,
        best: finished.reduce((max, g) => Math.max(max, g.end.score), 0),
      };
    },

    clear() {
      current = null;
      if (!storage) return;
      try {
        storage.removeItem(LOG_KEY);
      } catch {
        // 消せなくても遊べる
      }
    },
  };
}
