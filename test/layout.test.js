// 画面の作りを固定する。
//
// ゲーム画面には**盤面と状況だけ**を置き、設定・説明・履歴はメニューの中に入れる。
// 遊んでいる最中に目に入る情報が多いほど、盤面を読む邪魔になるため。
//
// HTML を直接読んで確かめる。うっかり <main> の中に説明を戻してしまうのを防ぐ。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** 開始タグから対応する終了タグまでを、入れ子を数えて取り出す */
function extract(source, tag, startPattern) {
  const start = source.indexOf(startPattern);
  assert.notEqual(start, -1, `${startPattern} が見つからない`);

  const open = new RegExp(`<${tag}\\b`, 'g');
  const close = new RegExp(`</${tag}>`, 'g');
  open.lastIndex = start + 1;
  close.lastIndex = start + 1;

  let depth = 1;
  let cursor = start + 1;
  while (depth > 0) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(source);
    const nextClose = close.exec(source);
    assert.ok(nextClose, `${tag} が閉じていない`);
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + 1;
    } else {
      depth--;
      cursor = nextClose.index + 1;
      if (depth === 0) return source.slice(start, nextClose.index + `</${tag}>`.length);
    }
  }
  throw new Error('unreachable');
}

const gameScreen = extract(html, 'main', '<main class="app"');
const menu = extract(html, 'div', '<div id="menu"');
const home = extract(html, 'section', '<section id="home"');

test('ゲーム画面にあるのは、遊ぶのに要るものだけ', () => {
  for (const id of ['stats', 'quota', 'message', 'board', 'royal-banner', 'tutorial', 'menu-open']) {
    assert.ok(gameScreen.includes(`id="${id}"`), `${id} はゲーム画面にあること`);
  }
});

test('設定・説明・履歴はゲーム画面に出さない', () => {
  for (const id of ['reset', 'tutorial-start', 'mute', 'move-chart', 'log-summary']) {
    assert.ok(!gameScreen.includes(`id="${id}"`), `${id} はゲーム画面に出さないこと`);
    assert.ok(menu.includes(`id="${id}"`), `${id} はメニューの中にあること`);
  }
  assert.ok(!gameScreen.includes('class="rules"'), 'ルール説明はゲーム画面に出さないこと');
  assert.ok(menu.includes('class="rules"'), 'ルール説明はメニューの中にあること');
});

test('メニューは閉じた状態で始まる', () => {
  assert.match(html, /<div id="menu" class="menu" hidden>/);
});

test('メニューは読み上げにダイアログとして伝わる', () => {
  assert.ok(menu.includes('role="dialog"'));
  assert.ok(menu.includes('aria-modal="true"'));
  assert.ok(menu.includes('id="menu-close"'), '閉じるボタンがあること');
});


test('開いたら最初はホーム画面が出る', () => {
  // ゲーム画面は隠しておく。押さないうちに盤面が動いていると何が起きたか分からない
  assert.match(html, /<main class="app" id="game-screen" hidden>/);
  assert.ok(!home.includes('hidden'), 'ホームは最初から見えていること');
});

test('ホーム画面には、始めるのに要るものが揃っている', () => {
  for (const id of ['home-start', 'variant', 'home-tutorial', 'home-menu', 'home-best']) {
    assert.ok(home.includes(`id="${id}"`), `${id} がホームにあること`);
  }
});

test('モード選択はホームだけに置く（2か所にあると食い違う）', () => {
  assert.ok(home.includes('id="variant"'));
  assert.ok(!menu.includes('id="variant"'), 'メニューには置かないこと');
  assert.ok(!gameScreen.includes('id="variant"'), 'ゲーム画面にも置かないこと');
  assert.equal(html.split('id="variant"').length - 1, 1, '1か所だけであること');
});

test('ゲーム中はメニューからホームへ戻れる', () => {
  assert.ok(menu.includes('id="to-home"'));
});
