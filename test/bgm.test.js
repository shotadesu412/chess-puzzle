import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBO_ROOT_HZ } from '../src/audio.js';
import {
  BEATS_PER_BAR,
  BGM_ROOT_HZ,
  BGM_SWING,
  CHORD_SHAPES,
  PROGRESSION,
  beatSeconds,
  beatToSeconds,
  chordAt,
  chordTones,
  planBar,
  toHz,
} from '../src/bgm.js';
import { seededRng } from './helpers.js';

test('BGMとコンボ音は同じ調（違うとベースがぶつかって濁る）', () => {
  assert.equal(BGM_ROOT_HZ, COMBO_ROOT_HZ);
});

test('コード進行は8小節でひと回りする', () => {
  assert.equal(PROGRESSION.length, 8);
  assert.deepEqual(chordAt(0), chordAt(8));
  assert.deepEqual(chordAt(3), chordAt(11));
});

test('進行の最後はドミナントで、頭のマイナーへ戻る', () => {
  assert.equal(chordAt(PROGRESSION.length - 1).shape, 'dom7b9');
  assert.equal(chordAt(0).shape, 'm9');
});

test('どのコードも定義された形を使っている', () => {
  for (const chord of PROGRESSION) {
    assert.ok(CHORD_SHAPES[chord.shape], `${chord.shape} が定義されていること`);
  }
});

test('1小節にはベースが4拍ぶん入る', () => {
  const notes = planBar(0, seededRng(1));
  const bass = notes.filter((n) => n.kind === 'bass');
  assert.equal(bass.length, BEATS_PER_BAR);
  assert.deepEqual(bass.map((n) => n.beat), [0, 1, 2, 3]);
});

test('ベースの1拍目はコードのルート', () => {
  for (let bar = 0; bar < PROGRESSION.length; bar++) {
    const first = planBar(bar, seededRng(bar + 1)).find((n) => n.kind === 'bass');
    assert.equal(first.semitone, chordAt(bar).root, `小節${bar}`);
  }
});

test('ベースは音域に収まる（低すぎ・高すぎで聞こえなくならない）', () => {
  const rng = seededRng(7);
  for (let bar = 0; bar < 200; bar++) {
    for (const note of planBar(bar, rng)) {
      if (note.kind !== 'bass') continue;
      assert.ok(note.semitone >= -4 && note.semitone <= 12,
        `小節${bar} の ${note.semitone} が音域外`);
      const hz = toHz(note.semitone);
      assert.ok(hz > 50 && hz < 160, `${hz.toFixed(1)}Hz は低音の範囲外`);
    }
  }
});

test('ブラシは2拍目と4拍目に入る', () => {
  const brush = planBar(0, seededRng(1)).filter((n) => n.kind === 'brush');
  assert.deepEqual(brush.map((n) => n.beat), [1, 3]);
});

test('伴奏はコードの構成音だけを使う', () => {
  const rng = seededRng(3);
  for (let bar = 0; bar < 200; bar++) {
    const tones = chordTones(chordAt(bar));
    for (const note of planBar(bar, rng)) {
      if (note.kind !== 'comp') continue;
      for (const semitone of note.voicing) {
        // 2オクターブ上に置いてあるので戻して比べる
        const base = semitone - 24;
        assert.ok(tones.includes(base) || tones.includes(base - 12),
          `小節${bar}: ${semitone} はコード外の音`);
      }
    }
  }
});

test('伴奏は裏拍に置く（表に置くとベースとぶつかって忙しくなる）', () => {
  const rng = seededRng(5);
  for (let bar = 0; bar < 100; bar++) {
    for (const note of planBar(bar, rng)) {
      if (note.kind !== 'comp') continue;
      assert.equal(note.beat % 1, 0.5, `小節${bar}: 拍${note.beat} は裏拍でない`);
    }
  }
});

test('伴奏は毎小節は入らない（休むから控えめに聞こえる）', () => {
  const rng = seededRng(9);
  let bars = 0;
  let withComp = 0;
  for (let bar = 0; bar < 200; bar++) {
    bars++;
    if (planBar(bar, rng).some((n) => n.kind === 'comp')) withComp++;
  }
  const ratio = withComp / bars;
  assert.ok(ratio > 0.5 && ratio < 0.95, `伴奏の入る割合が ${ratio.toFixed(2)}`);
});

test('同じ小節でも毎回すこし違う（2周目で気づかれないように）', () => {
  const a = JSON.stringify(planBar(0, seededRng(1)));
  const b = JSON.stringify(planBar(0, seededRng(999)));
  assert.notEqual(a, b);
});

test('スウィングで裏拍が後ろにずれる', () => {
  const spb = beatSeconds();
  assert.equal(beatToSeconds(0), 0);
  assert.equal(beatToSeconds(1), spb);
  // 裏拍だけ後ろへ
  assert.ok(beatToSeconds(1.5) > 1.5 * spb, '裏拍が後ろにずれること');
  assert.equal(beatToSeconds(1.5), (1 + BGM_SWING) * spb);
});

test('音は小節をはみ出さない', () => {
  const rng = seededRng(11);
  for (let bar = 0; bar < 100; bar++) {
    for (const note of planBar(bar, rng)) {
      assert.ok(note.beat >= 0 && note.beat < BEATS_PER_BAR,
        `拍${note.beat} が小節の外`);
    }
  }
});
