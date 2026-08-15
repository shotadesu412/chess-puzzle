// 音まわり。コンボ音（ウッドベースのピチカート）とBGM（夜ジャズ）。
//
// 音源ファイルを持たず Web Audio で合成している。理由は2つ:
//   - 読み込み待ちが無い（1手目から鳴る）
//   - 連鎖数に応じて音程を変えられる（ファイルだと音の数だけ用意することになる）
//
// スマホのスピーカーは 200Hz あたりから下がほとんど出ない。
// ベースの基音（70〜150Hz）はそのままでは聞こえないので、
// のこぎり波を使って倍音を残し、「基音が無くても音程は分かる」状態にしている。

import {
  BEATS_PER_BAR,
  BGM_VOICE,
  beatSeconds,
  beatToSeconds,
  planBar,
  toHz,
} from './bgm.js';

/** 基準の音（D2）。ここから音階を上がっていく */
export const COMBO_ROOT_HZ = 73.42;

/**
 * 連鎖ごとに上がっていく音階（半音）。
 * マイナーペンタトニックに♭5を足したブルーノート。ジャズのベースらしい響きになる。
 */
export const COMBO_SCALE = [0, 3, 5, 6, 7, 10, 12, 15, 17, 18, 19, 22, 24];

/** 音作りの設定。プレビュー（tools/preview-combo.mjs）と共有する */
export const COMBO_VOICE = {
  attack: 0.012,      // 立ち上がり(秒)。指ではじく感じ
  release: 0.75,      // 減衰しきるまで(秒)
  filterFrom: 2200,   // フィルタの開き始め(Hz)
  filterTo: 320,      // 減衰後(Hz)
  filterSweep: 0.35,  // フィルタが閉じるまで(秒)
  q: 6,
  detune: 7,          // 2つ目の発振器のずれ(cent)。太さを出す
};

/** n連鎖目の音の高さ */
export function comboFrequency(chain) {
  const step = Math.max(0, chain - 1);
  const semitone = step < COMBO_SCALE.length
    ? COMBO_SCALE[step]
    // 音階を超えたらオクターブずつ上げ続ける（大連鎖はどこまでも上がる）
    : COMBO_SCALE.at(-1) + (step - COMBO_SCALE.length + 1) * 12;
  return COMBO_ROOT_HZ * 2 ** (semitone / 12);
}

/** n連鎖目の音量。連鎖するほど少しだけ強くする */
export function comboGain(chain) {
  return Math.min(0.55, 0.3 + (chain - 1) * 0.05);
}

/** BGMの音量。伴奏なので、盤面から気をそらさない程度に小さく */
const BGM_LEVEL = 0.5;

/** 何秒先まで音を予約しておくか。これより短いと途切れる */
const BGM_LOOKAHEAD = 0.4;

/** 予約を見に行く間隔(ms) */
const BGM_TICK = 120;

let context = null;
let master = null;
let muted = false;

// BGM。盤面に集中させたいので、既定では鳴らさない
let bgmGain = null;
let bgmEnabled = false;
let bgmTimer = null;
let bgmBar = 0;        // 次に組み立てる小節
let bgmNextTime = 0;   // その小節が始まる時刻（AudioContext の時計）

/**
 * 音を出せる状態にする。
 * iOS は「ユーザーが触った」あとでないと音を出せないので、最初のタップで呼ぶ。
 */
export function unlockAudio() {
  if (muted) return;
  try {
    if (!context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.9;
      master.connect(context.destination);

      bgmGain = context.createGain();
      bgmGain.gain.value = BGM_LEVEL;
      bgmGain.connect(master);
    }
    if (context.state === 'suspended') context.resume();
    if (bgmEnabled) startBgm();
  } catch {
    context = null; // 音が出せない環境でも遊べるようにする
  }
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.9;
}

/** BGMを鳴らすか。切り替えは即座に効く */
export function setBgmEnabled(value) {
  bgmEnabled = value;
  if (value) {
    unlockAudio(); // まだ触られていないなら、ここでは何も起きない
    startBgm();
  } else {
    stopBgm();
  }
}

export function isBgmEnabled() {
  return bgmEnabled;
}

export function isMuted() {
  return muted;
}

/** コンボ音を鳴らす。chain は1から */
export function playCombo(chain) {
  if (muted || !context) return;

  const now = context.currentTime;
  duckBgm(now);
  const frequency = comboFrequency(chain);
  const level = comboGain(chain);
  const v = COMBO_VOICE;

  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(level, now + v.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + v.release);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = v.q;
  filter.frequency.setValueAtTime(v.filterFrom, now);
  filter.frequency.exponentialRampToValueAtTime(v.filterTo, now + v.filterSweep);

  filter.connect(amp);
  amp.connect(master);

  // 2つ重ねて少しずらすと、弦の太さが出る
  for (const detune of [0, v.detune]) {
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + v.release + 0.05);
  }

  playPluck(now);
}

/** 指が弦に当たる「コッ」という音。これが無いと合成っぽくなる */
function playPluck(when) {
  const length = Math.floor(context.sampleRate * 0.03);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 1.2;

  const gain = context.createGain();
  gain.gain.value = 0.12;

  source.connect(band).connect(gain).connect(master);
  source.start(when);
}


// --- BGM ----------------------------------------------------------------
//
// Web Audio の時計に対して「少し先まで」音を予約しておき、
// setInterval では予約の面倒だけを見る。JavaScript のタイマーは精度が甘いので、
// タイマーで直接鳴らすとテンポがよれる。

function startBgm() {
  if (!context || !bgmEnabled || bgmTimer !== null) return;
  bgmBar = 0;
  bgmNextTime = context.currentTime + 0.15;
  if (bgmGain) {
    // いきなり鳴り出すと驚くので、少しかけて上げる
    bgmGain.gain.cancelScheduledValues(context.currentTime);
    bgmGain.gain.setValueAtTime(0.0001, context.currentTime);
    bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL, context.currentTime + 1.5);
  }
  bgmTimer = setInterval(scheduleBgm, BGM_TICK);
  scheduleBgm();
}

function stopBgm() {
  if (bgmTimer !== null) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
  if (bgmGain && context) {
    const now = context.currentTime;
    bgmGain.gain.cancelScheduledValues(now);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, now);
    bgmGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
  }
}

/** 予約が切れそうなら、次の小節を組み立てて置く */
function scheduleBgm() {
  if (!context || !bgmEnabled) return;
  const barLength = beatSeconds() * BEATS_PER_BAR;

  while (bgmNextTime < context.currentTime + BGM_LOOKAHEAD) {
    for (const note of planBar(bgmBar)) {
      const at = bgmNextTime + beatToSeconds(note.beat);
      if (note.kind === 'bass') playBass(at, note);
      else if (note.kind === 'comp') playComp(at, note);
      else playBrush(at, note);
    }
    bgmBar++;
    bgmNextTime += barLength;
  }
}

/** ウォーキングベース。コンボ音と同じ作り方（のこぎり波＋閉じるフィルタ） */
function playBass(when, note) {
  const v = BGM_VOICE.bass;
  const level = v.gain * note.gain;

  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(level, when + v.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + v.release);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = v.q;
  filter.frequency.setValueAtTime(v.filterFrom, when);
  filter.frequency.exponentialRampToValueAtTime(v.filterTo, when + v.filterSweep);

  filter.connect(amp);
  amp.connect(bgmGain);

  for (const detune of [0, v.detune]) {
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = toHz(note.semitone);
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + v.release + 0.05);
  }
}

/** 伴奏。三角波を重ねて、エレピに近い柔らかさにする */
function playComp(when, note) {
  const v = BGM_VOICE.comp;

  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(v.gain * note.gain, when + v.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + v.release);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = v.filter;
  filter.Q.value = v.q;

  filter.connect(amp);
  amp.connect(bgmGain);

  for (const semitone of note.voicing) {
    for (const detune of [0, v.detune]) {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = toHz(semitone);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(when);
      osc.stop(when + v.release + 0.05);
    }
  }
}

/** ブラシ。ノイズを撫でるように鳴らす */
function playBrush(when, note) {
  const v = BGM_VOICE.brush;
  const length = Math.floor(context.sampleRate * v.length);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    // 立ち上がりをなだらかにすると「シャッ」ではなく「サーッ」になる
    data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 2;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = v.filter;
  band.Q.value = v.q;

  const gain = context.createGain();
  gain.gain.value = v.gain * note.gain;

  source.connect(band).connect(gain).connect(bgmGain);
  source.start(when);
}

/**
 * コンボが鳴っている間だけBGMを引っ込める。
 * 同じ帯域（ベース）でぶつかるので、これが無いとコンボが埋もれる。
 */
function duckBgm(now) {
  if (!bgmGain || !bgmEnabled) return;
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, now);
  bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL * 0.35, now + 0.05);
  bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL, now + 0.9);
}
