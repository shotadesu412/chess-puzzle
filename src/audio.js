// 音まわり。コンボ音（ウッドベースのピチカート）とBGM（夜ジャズ）。
//
// 音源ファイルを持たず Web Audio で合成している。理由は2つ:
//   - 読み込み待ちが無い（1手目から鳴る）
//   - 連鎖数に応じて音程を変えられる（ファイルだと音の数だけ用意することになる）
//
// スマホのスピーカーは 200Hz あたりから下がほとんど出ない。
// ベースの基音（70〜150Hz）はそのままでは聞こえないので、
// のこぎり波を使って倍音を残し、「基音が無くても音程は分かる」状態にしている。

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

/** 効果音のあと、BGMを戻すまでの時間(ms)。連鎖の間は下げたままにする */
const DUCK_HOLD_MS = 700;

let duckTimer = null;
let context = null;
let master = null;
let muted = false;

// BGM は別系統（bgm.js の <audio>）。効果音が鳴る間だけ引っ込めてもらう
let duckTarget = null;

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
    }
    if (context.state === 'suspended') context.resume();
  } catch {
    context = null; // 音が出せない環境でも遊べるようにする
  }
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.9;
}

/**
 * 効果音が鳴っている間だけ引っ込めてもらう相手を登録する。
 * BGM は別系統なので、こちらからは「引っ込めて」と頼むだけにしておく。
 */
export function setDuckTarget(target) {
  duckTarget = target;
}

export function isMuted() {
  return muted;
}

/** コンボ音を鳴らす。chain は1から */
export function playCombo(chain) {
  if (muted || !context) return;

  const now = context.currentTime;
  duckTarget?.duck();
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => duckTarget?.unduck(), DUCK_HOLD_MS);
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

