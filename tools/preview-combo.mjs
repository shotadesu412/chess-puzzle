// コンボ音を WAV に書き出して、実際に耳で確認できるようにする。
//
//   npm run preview-combo [出力先]
//
// ブラウザの Web Audio と同じ設定（src/audio.js の COMBO_* ）を使って、
// のこぎり波 → ローパス → エンベロープ を Node 側で組み直している。
// 完全に同じ波形にはならないが、音色と音程の並びは確認できる。

import { writeFileSync } from 'node:fs';
import {
  COMBO_VOICE,
  comboFrequency,
  comboGain,
} from '../src/audio.js';

const OUT = process.argv[2] ?? 'combo-preview.wav';
const RATE = 44100;
const CHAINS = 8;        // 1〜8連鎖を順に鳴らす
const INTERVAL = 0.85;   // 音の間隔(秒)

/** ローパス（RBJ のバイクアッド）。Web Audio の lowpass と同じ式 */
function makeLowpass(freq, q) {
  const w0 = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = (1 - cos) / 2, b1 = 1 - cos, b2 = (1 - cos) / 2;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** のこぎり波。位相を進めながら -1..1 を返す */
function saw(phase) {
  return 2 * (phase - Math.floor(phase + 0.5));
}

function renderNote(out, startSample, chain) {
  const v = COMBO_VOICE;
  const freq = comboFrequency(chain);
  const level = comboGain(chain);
  const total = Math.floor(RATE * (v.release + 0.05));

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let phaseA = 0, phaseB = 0;
  const stepA = freq / RATE;
  const stepB = (freq * 2 ** (v.detune / 1200)) / RATE;

  for (let i = 0; i < total; i++) {
    const t = i / RATE;

    // 振幅エンベロープ（立ち上がり → 指数で減衰）
    let amp;
    if (t < v.attack) amp = level * (t / v.attack);
    else amp = level * Math.exp(-(t - v.attack) * (5 / v.release));

    // フィルタのカットオフも時間で閉じていく
    const sweep = Math.min(1, t / v.filterSweep);
    const cutoff = v.filterFrom * (v.filterTo / v.filterFrom) ** sweep;
    const [b0, b1, b2, a1, a2] = makeLowpass(Math.max(60, cutoff), v.q);

    const raw = (saw(phaseA) + saw(phaseB)) * 0.5;
    phaseA += stepA;
    phaseB += stepB;

    const y = b0 * raw + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = raw; y2 = y1; y1 = y;

    const index = startSample + i;
    if (index < out.length) out[index] += y * amp;
  }

  // 指が弦に当たる音
  const pluck = Math.floor(RATE * 0.03);
  for (let i = 0; i < pluck; i++) {
    const index = startSample + i;
    if (index < out.length) {
      out[index] += (Math.random() * 2 - 1) * (1 - i / pluck) ** 3 * 0.12;
    }
  }
}

const totalSamples = Math.floor(RATE * (CHAINS * INTERVAL + 1));
const out = new Float32Array(totalSamples);
for (let chain = 1; chain <= CHAINS; chain++) {
  renderNote(out, Math.floor(RATE * (chain - 1) * INTERVAL), chain);
}

// 16bit PCM の WAV にする
const pcm = Buffer.alloc(out.length * 2);
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

console.log(`${OUT} に書き出しました（${CHAINS}連鎖ぶん / ${(totalSamples / RATE).toFixed(1)}秒）`);
console.log('連鎖ごとの音の高さ:');
for (let chain = 1; chain <= CHAINS; chain++) {
  console.log(`  ${chain}連鎖: ${comboFrequency(chain).toFixed(1)} Hz`);
}
