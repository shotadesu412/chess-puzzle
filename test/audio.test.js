import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBO_SCALE, comboFrequency, comboGain } from '../src/audio.js';

test('連鎖が伸びるほど音が高くなる', () => {
  let previous = 0;
  for (let chain = 1; chain <= 20; chain++) {
    const freq = comboFrequency(chain);
    assert.ok(freq > previous, `${chain}連鎖が前より高いこと`);
    previous = freq;
  }
});

test('音階を超えてもオクターブずつ上がり続ける', () => {
  // 大連鎖は上限なく上がってほしい（頭打ちだと盛り上がりが止まる）
  const last = comboFrequency(COMBO_SCALE.length);
  assert.ok(comboFrequency(COMBO_SCALE.length + 1) > last);
  assert.ok(comboFrequency(COMBO_SCALE.length + 12) > comboFrequency(COMBO_SCALE.length + 1));
});

test('スマホでも聞こえる高さに収まっている', () => {
  // 低すぎるとスマホのスピーカーで鳴らない
  assert.ok(comboFrequency(1) >= 60, '1連鎖でも60Hz以上');
  // 高すぎるとベースらしさが無くなる
  assert.ok(comboFrequency(8) < 400, '8連鎖でもベースの音域');
});

test('音量は連鎖で少し上がるが、上限がある', () => {
  assert.ok(comboGain(2) > comboGain(1));
  assert.ok(comboGain(50) <= 0.55, '大連鎖でも割れない範囲');
});
