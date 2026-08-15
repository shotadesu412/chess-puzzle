// BGM を WAV に書き出して、実際に耳で確認できるようにする。
//
//   npm run preview-bgm [出力先] [秒数]
//
// ブラウザで鳴らしているのと同じ音の並び（src/bgm.js の planBar）を使い、
// のこぎり波 / 三角波 / ノイズ → フィルタ → エンベロープ を Node 側で組み直す。
// 完全に同じ波形にはならないが、雰囲気・テンポ・音量のバランスは確認できる。
//
// 音の中身は src/bgm.js が持っているので、こちらを直しても曲は変わらない。
// 曲を変えたいときは src/bgm.js の PROGRESSION / planBar を触ること。

import { writeFileSync } from 'node:fs';
import {
  BEATS_PER_BAR,
  BGM_TEMPO,
  BGM_VOICE,
  beatSeconds,
  beatToSeconds,
  chordAt,
  planBar,
  toHz,
} from '../src/bgm.js';

const OUT = process.argv[2] ?? 'bgm-preview.wav';
const SECONDS = Number(process.argv[3] ?? 60);
const RATE = 44100;

/** ローパス（RBJ のバイクアッド）。Web Audio の lowpass と同じ式 */
function makeLowpass(freq, q) {
  const w0 = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = (1 - cos) / 2, b1 = 1 - cos, b2 = (1 - cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** バンドパス。ブラシ用 */
function makeBandpass(freq, q) {
  const w0 = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));
/** 三角波。のこぎりを折り返す */
const triangle = (phase) => 2 * Math.abs(saw(phase)) - 1;

function add(out, index, value) {
  if (index >= 0 && index < out.length) out[index] += value;
}

/** ウォーキングベース（audio.js の playBass と同じ作り） */
function renderBass(out, start, note) {
  const v = BGM_VOICE.bass;
  const level = v.gain * note.gain;
  const freq = toHz(note.semitone);
  const total = Math.floor(RATE * (v.release + 0.05));

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let phaseA = 0, phaseB = 0;
  const stepA = freq / RATE;
  const stepB = (freq * 2 ** (v.detune / 1200)) / RATE;

  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const amp = t < v.attack
      ? level * (t / v.attack)
      : level * Math.exp(-(t - v.attack) * (5 / v.release));

    const sweep = Math.min(1, t / v.filterSweep);
    const cutoff = v.filterFrom * (v.filterTo / v.filterFrom) ** sweep;
    const [b0, b1, b2, a1, a2] = makeLowpass(Math.max(60, cutoff), v.q);

    const raw = (saw(phaseA) + saw(phaseB)) * 0.5;
    phaseA += stepA;
    phaseB += stepB;

    const y = b0 * raw + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = raw; y2 = y1; y1 = y;

    add(out, start + i, y * amp);
  }
}

/** 伴奏。三角波を重ねる */
function renderComp(out, start, note) {
  const v = BGM_VOICE.comp;
  const level = (v.gain * note.gain) / note.voicing.length;
  const total = Math.floor(RATE * (v.release + 0.05));
  const [b0, b1, b2, a1, a2] = makeLowpass(v.filter, v.q);

  for (const semitone of note.voicing) {
    const freq = toHz(semitone);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let phaseA = 0, phaseB = 0;
    const stepA = freq / RATE;
    const stepB = (freq * 2 ** (v.detune / 1200)) / RATE;

    for (let i = 0; i < total; i++) {
      const t = i / RATE;
      const amp = t < v.attack
        ? level * (t / v.attack)
        : level * Math.exp(-(t - v.attack) * (5 / v.release));

      const raw = (triangle(phaseA) + triangle(phaseB)) * 0.5;
      phaseA += stepA;
      phaseB += stepB;

      const y = b0 * raw + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = raw; y2 = y1; y1 = y;

      add(out, start + i, y * amp);
    }
  }
}

/** ブラシ。ノイズを撫でる */
function renderBrush(out, start, note) {
  const v = BGM_VOICE.brush;
  const total = Math.floor(RATE * v.length);
  const level = v.gain * note.gain;
  const [b0, b1, b2, a1, a2] = makeBandpass(v.filter, v.q);

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < total; i++) {
    const t = i / total;
    const raw = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 2;
    const y = b0 * raw + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = raw; y2 = y1; y1 = y;
    add(out, start + i, y * level);
  }
}

// --- 書き出し -----------------------------------------------------------

const barLength = beatSeconds() * BEATS_PER_BAR;
const bars = Math.ceil(SECONDS / barLength);
const out = new Float32Array(Math.floor(RATE * (bars * barLength + 2)));

for (let bar = 0; bar < bars; bar++) {
  const barStart = bar * barLength;
  for (const note of planBar(bar)) {
    const start = Math.floor(RATE * (barStart + beatToSeconds(note.beat)));
    if (note.kind === 'bass') renderBass(out, start, note);
    else if (note.kind === 'comp') renderComp(out, start, note);
    else renderBrush(out, start, note);
  }
}

// 16bit PCM の WAV にする
const pcm = Buffer.alloc(out.length * 2);
let peak = 0;
for (const sample of out) peak = Math.max(peak, Math.abs(sample));
for (let i = 0; i < out.length; i++) {
  const clamped = Math.max(-1, Math.min(1, out[i]));
  pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

writeFileSync(OUT, Buffer.concat([header, pcm]));

const names = { m9: 'm9', m7b5: 'm7♭5', dom7b9: '7♭9' };
const degree = ['D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B', 'C', 'C♯'];
console.log(`${OUT} に書き出しました（${(out.length / RATE).toFixed(1)}秒 / ${bars}小節 / ${BGM_TEMPO} BPM）`);
console.log(`ピーク: ${(peak * 100).toFixed(0)}%${peak > 0.95 ? '  ← 割れているので音量を下げること' : ''}`);
console.log('\n8小節の回り方（Dマイナー）:');
console.log('  ' + Array.from({ length: 8 }, (_, i) => {
  const c = chordAt(i);
  return degree[c.root % 12] + names[c.shape];
}).join(' | '));
