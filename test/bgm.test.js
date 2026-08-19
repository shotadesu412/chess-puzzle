import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BGM_TRACKS,
  BGM_VOLUME,
  DUCK_RATIO,
  createBgmPlayer,
  pickTrack,
} from '../src/bgm.js';
import { seededRng } from './helpers.js';

/** <audio> のかわり。呼ばれたことを覚えておく */
function fakeAudio(src) {
  return {
    src,
    volume: 0,
    paused: true,
    loop: false,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

/** フェードを待たずに済むよう、音量を即座に目標へ入れるプレイヤー */
function makePlayer(rng = seededRng(1)) {
  const created = [];
  const player = createBgmPlayer({
    createAudio: (src) => {
      const audio = fakeAudio(src);
      created.push(audio);
      return audio;
    },
    rng,
  });
  return { player, created };
}

test('場面ごとに曲が決まっている', () => {
  assert.equal(BGM_TRACKS.home.length, 1, 'ホームは1曲');
  assert.equal(BGM_TRACKS.game.length, 2, 'ゲーム中は2曲');
  for (const list of Object.values(BGM_TRACKS)) {
    for (const src of list) assert.match(src, /^assets\/bgm\/.+\.mp3$/);
  }
});

test('ホームとゲームで曲が重ならない', () => {
  const overlap = BGM_TRACKS.home.filter((t) => BGM_TRACKS.game.includes(t));
  assert.deepEqual(overlap, [], 'ホームの曲がゲーム中にも流れると場面が変わった感じがしない');
});

test('候補が1曲ならそれを返す', () => {
  assert.equal(pickTrack('home', seededRng(1)), BGM_TRACKS.home[0]);
});

test('直前と同じ曲は選ばない', () => {
  const rng = seededRng(3);
  for (let i = 0; i < 50; i++) {
    const previous = BGM_TRACKS.game[i % 2];
    assert.notEqual(pickTrack('game', rng, previous), previous);
  }
});

test('候補が全部「直前の曲」でも詰まらない', () => {
  // ホームは1曲しかないので、previous を渡しても選べないと止まってしまう
  assert.equal(pickTrack('home', seededRng(1), BGM_TRACKS.home[0]), BGM_TRACKS.home[0]);
});

test('知らない場面なら null（鳴らさない）', () => {
  assert.equal(pickTrack('nowhere', seededRng(1)), null);
});

test('鳴らす設定にすると、いまの場面の曲が始まる', () => {
  const { player, created } = makePlayer();
  player.setScene('home');
  player.setEnabled(true);

  assert.equal(created.length, 1);
  assert.equal(created[0].src, BGM_TRACKS.home[0]);
  assert.equal(created[0].paused, false);
  assert.equal(player.currentTrack(), BGM_TRACKS.home[0]);
});

test('切っている間は曲を作らない', () => {
  const { player, created } = makePlayer();
  player.setScene('home');
  player.setScene('game');
  assert.equal(created.length, 0);
  assert.equal(player.currentTrack(), null);
});

test('場面が変わると曲も変わる', () => {
  const { player } = makePlayer();
  player.setScene('home');
  player.setEnabled(true);
  const home = player.currentTrack();

  player.setScene('game');
  assert.notEqual(player.currentTrack(), home);
  assert.ok(BGM_TRACKS.game.includes(player.currentTrack()));
});

test('同じ場面をもう一度指定しても曲は変わらない', () => {
  const { player, created } = makePlayer();
  player.setScene('game');
  player.setEnabled(true);
  const first = player.currentTrack();

  player.setScene('game');
  player.setScene('game');
  assert.equal(player.currentTrack(), first, 'ゲーム中に曲が飛ばないこと');
  assert.equal(created.length, 1);
});

test('restart はゲーム中の曲を選び直す', () => {
  const { player } = makePlayer(seededRng(5));
  player.setScene('game');
  player.setEnabled(true);

  const first = player.currentTrack();
  player.restart();
  assert.notEqual(player.currentTrack(), first, '始め直したら別の曲になること');
});

test('切ると鳴っていた曲が止まる', async () => {
  const { player, created } = makePlayer();
  player.setScene('home');
  player.setEnabled(true);
  assert.equal(created[0].paused, false);

  player.setEnabled(false);
  assert.equal(player.currentTrack(), null);

  // フェードしてから止まる
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(created[0].paused, true);
});

test('効果音の間は音量が下がり、あとで戻る', async () => {
  const { player, created } = makePlayer();
  player.setScene('home');
  player.setEnabled(true);
  await new Promise((r) => setTimeout(r, 1400)); // 立ち上がりを待つ

  const normal = created[0].volume;
  assert.ok(Math.abs(normal - BGM_VOLUME) < 0.02, `通常の音量が ${normal}`);

  player.duck();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(created[0].volume < normal, '効果音の間は下がること');
  assert.ok(Math.abs(created[0].volume - BGM_VOLUME * DUCK_RATIO) < 0.02);

  player.unduck();
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(Math.abs(created[0].volume - BGM_VOLUME) < 0.02, '戻ること');

  player.setEnabled(false);
});

test('鳴らせない環境でも落ちない（iOSは触られるまで鳴らせない）', () => {
  const player = createBgmPlayer({
    createAudio: (src) => ({
      src, volume: 0, paused: true,
      play: () => Promise.reject(new Error('NotAllowedError')),
      pause() {},
    }),
    rng: seededRng(1),
  });

  assert.doesNotThrow(() => {
    player.setScene('home');
    player.setEnabled(true);
    player.setEnabled(false);
  });
});
