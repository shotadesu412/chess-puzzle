// BGM。ホーム画面とゲーム中で曲を切り替える。
//
// **Web Audio ではなく `<audio>` で鳴らしている。** 1曲11〜13分あるので、
// Web Audio で読むと全部デコードしてメモリに載せることになる（1曲で100MB超）。
// `<audio>` なら流しながら再生できる。
//
// 効果音（audio.js）とは別系統。あちらは合成なので待ち時間ゼロが要る。
// BGMは数秒遅れて始まっても困らない。
//
// 音量の上げ下げだけで場面を切り替える（クロスフェード）。曲が切り替わる瞬間に
// 無音があると「止まった」ように聞こえるため。

/** 場面ごとの曲。ゲーム中は複数あって、始めるたびに選び直す */
export const BGM_TRACKS = {
  home: ['assets/bgm/midnight-in-blue.mp3'],
  game: [
    'assets/bgm/midnight-in-the-quiet-room.mp3',
    'assets/bgm/midnight-in-the-quiet-room-2.mp3',
  ],
};

/** 場面を切り替えるときにかける時間(秒) */
export const CROSSFADE_SECONDS = 1.2;

/** ふだんの音量。効果音より控えめにする */
export const BGM_VOLUME = 0.45;

/** 効果音が鳴っている間に下げる割合 */
export const DUCK_RATIO = 0.4;

/** フェードの刻み(ms) */
const FADE_TICK = 50;

/**
 * その場面で次にかける曲を選ぶ。
 *
 * 候補が複数あるときは、**直前と同じ曲は選ばない**。
 * 続けて同じ曲だと「1曲しか無い」ように聞こえるため。
 */
export function pickTrack(scene, rng = Math.random, previous = null) {
  const tracks = BGM_TRACKS[scene];
  if (!tracks || tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0];

  const others = tracks.filter((t) => t !== previous);
  const pool = others.length > 0 ? others : tracks;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/**
 * BGMを鳴らすもの。
 *
 * @param createAudio 音を作る関数。テストで差し替えられるようにしてある
 * @param rng         曲選びの乱数
 */
export function createBgmPlayer({ createAudio, rng = Math.random } = {}) {
  // `Audio` が無い環境（読み上げ専用ブラウザなど）でも遊べるようにする。
  // 音のために起動できなくなるのが一番まずい
  const make = createAudio ?? ((src) => {
    if (typeof Audio === 'undefined') return null;
    const audio = new Audio(src);
    audio.loop = true;      // 11分あるので普通は最後まで行かないが、念のため
    audio.preload = 'none'; // 開いた瞬間に16MB取りに行かせない
    return audio;
  });

  let current = null;       // { audio, src, scene }
  let enabled = false;
  let scene = null;
  let ducked = false;
  const fades = new Map();  // audio -> タイマー

  /** 音量をなめらかに動かす。到達したら done を呼ぶ */
  function fadeTo(audio, target, seconds, done) {
    const existing = fades.get(audio);
    if (existing) clearInterval(existing);

    const steps = Math.max(1, Math.round((seconds * 1000) / FADE_TICK));
    const from = audio.volume;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / steps);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * ratio));
      if (ratio >= 1) {
        clearInterval(timer);
        fades.delete(audio);
        done?.();
      }
    }, FADE_TICK);

    fades.set(audio, timer);
  }

  /** 目標の音量（効果音で引っ込めているかどうかを込みで） */
  function targetVolume() {
    return ducked ? BGM_VOLUME * DUCK_RATIO : BGM_VOLUME;
  }

  function stopNow(entry) {
    if (!entry) return;
    const timer = fades.get(entry.audio);
    if (timer) {
      clearInterval(timer);
      fades.delete(entry.audio);
    }
    entry.audio.pause();
  }

  return {
    /**
     * 場面を切り替える。同じ場面をもう一度指定したら、曲は変えない。
     * ゲーム中に何度も呼ばれても曲が飛ばないようにするため。
     */
    setScene(next) {
      if (scene === next) return;
      scene = next;
      if (!enabled) return;
      this.restart();
    },

    /** いまの場面の曲をかけ直す（ゲームを始めるたびに曲を選び直す用） */
    restart() {
      if (!enabled || !scene) return;

      const src = pickTrack(scene, rng, current?.src);
      if (!src) return;
      if (current?.src === src && !current.audio.paused) return;

      const audio = make(src);
      if (!audio) return;

      const previous = current;
      audio.volume = 0;
      current = { audio, src, scene };

      // iOS は「ユーザーが触った」あとでないと鳴らせない。
      // 断られても落とさず、次に触られたときに掛け直せばよい
      const started = audio.play?.();
      started?.catch?.(() => {});

      fadeTo(audio, targetVolume(), CROSSFADE_SECONDS);
      if (previous) fadeTo(previous.audio, 0, CROSSFADE_SECONDS, () => stopNow(previous));
    },

    setEnabled(value) {
      enabled = value;
      if (value) {
        this.restart();
      } else if (current) {
        const entry = current;
        current = null;
        fadeTo(entry.audio, 0, 0.4, () => stopNow(entry));
      }
    },

    isEnabled() {
      return enabled;
    },

    /** 効果音の間だけ引っ込める。同じ帯域でぶつかって効果音が埋もれるため */
    duck() {
      if (!current || ducked) return;
      ducked = true;
      fadeTo(current.audio, targetVolume(), 0.08);
    },

    unduck() {
      if (!ducked) return;
      ducked = false;
      if (current) fadeTo(current.audio, targetVolume(), 0.7);
    },

    /** いま鳴っている曲（テストと動作確認用） */
    currentTrack() {
      return current?.src ?? null;
    },
  };
}
