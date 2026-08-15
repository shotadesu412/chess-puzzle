// BGM（控えめな夜ジャズ）。
//
// **音源ファイルを持たず、その場で組み立てている。** 理由:
//   - 1ゲームが3〜5分なので、既成のループ曲だと必ず継ぎ目が耳につく。
//     組み立てなら終わりが無く、同じ小節も毎回すこし違う
//   - 権利がまったく絡まない（自分たちで書いた音）
//   - アプリが重くならない（MP3なら数MB、これは0バイト）
//   - コンボ音（audio.js）と同じ調で鳴らせる
//
// **調はDマイナー。コンボ音の基準（COMBO_ROOT_HZ = D2）と同じにしてある。**
// 別々の調にすると、消したときのベース音がBGMとぶつかって濁る。
//
// 音の中身（どの拍に何の音を置くか）は `planBar` に純粋関数として出してある。
// ブラウザの再生と、耳で確かめる用のWAV書き出し（tools/preview-bgm.mjs）で
// 同じものを使うため。片方だけ直して食い違うのを防ぐ。

/** 基準の音。D2。コンボ音と同じ */
export const BGM_ROOT_HZ = 73.42;

/** テンポ。夜のジャズくらいのゆっくりさ */
export const BGM_TEMPO = 70;

/**
 * 8分音符の跳ね（スウィング）。
 * 0.5 なら均等、0.62 くらいで「タータ、タータ」になる。
 */
export const BGM_SWING = 0.62;

/** 和音の形。コードのルートから何半音上を重ねるか */
export const CHORD_SHAPES = {
  m9: [0, 3, 7, 10, 14],       // マイナー9th。しっとりした響き
  m7b5: [0, 3, 6, 10],         // ハーフディミニッシュ。次へ進みたくなる
  dom7b9: [0, 4, 7, 10, 13],   // 7th♭9。マイナーへ帰る前の緊張
};

/**
 * 8小節の回り方（Dマイナー）。
 * ジャズの定番の進み方で、8小節でひと回りして頭に戻る。
 * root はDから何半音上か。
 */
export const PROGRESSION = [
  { root: 0, shape: 'm9' },      // Dm9
  { root: 0, shape: 'm9' },      // Dm9
  { root: 5, shape: 'm9' },      // Gm9
  { root: 5, shape: 'm9' },      // Gm9
  { root: 2, shape: 'm7b5' },    // Em7♭5
  { root: 7, shape: 'dom7b9' },  // A7♭9
  { root: 0, shape: 'm9' },      // Dm9
  { root: 7, shape: 'dom7b9' },  // A7♭9（頭に戻る）
];

/** 音色の設定。プレビュー（tools/preview-bgm.mjs）と共有する */
export const BGM_VOICE = {
  bass: {
    gain: 0.20,
    attack: 0.012,
    release: 0.55,
    filterFrom: 1800,
    filterTo: 260,
    filterSweep: 0.3,
    q: 5,
    detune: 6,
  },
  comp: {
    gain: 0.055,      // 伴奏。前に出ると盤面に集中できない
    attack: 0.05,     // やわらかく入る（ハンマーで叩かない感じ）
    release: 1.4,
    filter: 1600,
    q: 0.9,
    detune: 5,
  },
  brush: {
    gain: 0.035,      // ブラシ。あるか無いか分からないくらいで良い
    length: 0.18,
    filter: 5200,
    q: 0.8,
  },
};

/** 1小節の拍数 */
export const BEATS_PER_BAR = 4;

/** 1拍の長さ（秒） */
export const beatSeconds = (tempo = BGM_TEMPO) => 60 / tempo;

/** その小節のコード */
export function chordAt(bar) {
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

/** コードの構成音（Dからの半音） */
export function chordTones(chord) {
  return CHORD_SHAPES[chord.shape].map((interval) => chord.root + interval);
}

/** 半音から周波数へ */
export function toHz(semitone, root = BGM_ROOT_HZ) {
  return root * 2 ** (semitone / 12);
}

/**
 * 1小節ぶんの音を組み立てる。
 *
 * 戻り値の `beat` は小節の頭からの拍数（スウィングは再生側で掛ける）。
 * `semitone` はDからの半音。
 *
 * 同じ小節でも rng 次第で少し変わるようにしてある。
 * まったく同じだと、2周目で「さっきと同じだ」と気づかれる。
 */
export function planBar(bar, rng = Math.random) {
  const chord = chordAt(bar);
  const next = chordAt(bar + 1);
  const tones = chordTones(chord);
  const notes = [];

  // --- ウォーキングベース ---------------------------------------------
  // 4拍を歩く。1拍目はルート、最後は次のコードへ半音で寄せる。
  // 「次にどこへ行くか」が聞こえるので、進行が分かりやすくなる。
  for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
    let semitone;
    if (beat === 0) {
      semitone = chord.root;
    } else if (beat === BEATS_PER_BAR - 1) {
      // 次のルートの半音上か下から入る
      semitone = next.root + (rng() < 0.5 ? 1 : -1);
    } else {
      // 3度・5度・7度あたりを拾う
      semitone = tones[1 + Math.floor(rng() * Math.min(3, tones.length - 1))];
    }
    // 低すぎ・高すぎを畳む（ベースの音域に収める）
    while (semitone > 12) semitone -= 12;
    while (semitone < -4) semitone += 12;

    notes.push({ kind: 'bass', beat, semitone, gain: beat === 0 ? 1 : 0.82 });
  }

  // --- 伴奏（コンピング） ---------------------------------------------
  // 裏拍に短く置く。毎小節入れると忙しいので、たまに休む。
  if (rng() < 0.72) {
    // 2拍目の裏、または3拍目の裏
    const beat = rng() < 0.5 ? 1.5 : 2.5;
    // ガイドトーン（3度と7度）＋色づけ。2オクターブ上に置く
    const voicing = [tones[1], tones[3] ?? tones[2], tones[4] ?? tones[0] + 12]
      .filter((n) => n !== undefined)
      .map((n) => n + 24);
    notes.push({ kind: 'comp', beat, voicing, gain: 1 });
  }
  if (rng() < 0.3) {
    notes.push({
      kind: 'comp',
      beat: 3.5,
      voicing: [tones[1] + 24, tones[3] !== undefined ? tones[3] + 24 : tones[2] + 24],
      gain: 0.7,
    });
  }

  // --- ブラシ ---------------------------------------------------------
  // 2拍目と4拍目。ジャズのブラシはここに来る
  for (const beat of [1, 3]) {
    notes.push({ kind: 'brush', beat, gain: beat === 3 ? 1 : 0.85 });
  }

  return notes;
}

/**
 * 拍の位置を秒に直す。8分の裏拍を後ろにずらして跳ねさせる。
 */
export function beatToSeconds(beat, tempo = BGM_TEMPO, swing = BGM_SWING) {
  const spb = beatSeconds(tempo);
  const whole = Math.floor(beat);
  const fraction = beat - whole;
  // 裏拍（0.5）だけ後ろへ。それ以外はそのまま
  const shifted = fraction === 0.5 ? swing : fraction;
  return (whole + shifted) * spb;
}
