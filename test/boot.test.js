// main.js が最後まで走るか（起動できるか）を確かめる。
//
// main.js はDOM前提なので、ここだけ最小限のDOMを用意して読み込む。
// 目的は見た目の検証ではなく、**実機に上げる前に落ちないことを確かめる**こと。
// 起動時に例外が出ると盤面が一切出ないので、実機で気づくのは高くつく。

import test from 'node:test';
import assert from 'node:assert/strict';

/** 最小限の DOM。main.js と ui.js が触るものだけ */
function installDom() {
  const store = new Map();

  const makeEl = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      style: { setProperty() {}, removeProperty() {} },
      classList: {
        list: new Set(),
        add(...c) { for (const x of c) this.list.add(x); },
        remove(...c) { for (const x of c) this.list.delete(x); },
        toggle(c, on) { if (on) this.list.add(c); else this.list.delete(c); },
        contains(c) { return this.list.has(c); },
      },
      textContent: '',
      innerHTML: '',
      hidden: false,
      value: '',
      appendChild(child) { this.children.push(child); return child; },
      append(...kids) { this.children.push(...kids); },
      replaceChildren(...kids) { this.children = kids; },
      removeChild(child) { this.children = this.children.filter((c) => c !== child); },
      remove() {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getAttribute() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { top: 0, left: 0, width: 40, height: 40 }; },
      animate() { return { finished: Promise.resolve(), cancel() {} }; },
      focus() {},
      click() { el.fire('click'); },
      // 押した結果まで確かめたいので、登録されたものを覚えておく
      listeners: new Map(),
      fire(type, event = {}) {
        for (const fn of el.listeners.get(type) ?? []) fn({ type, ...event });
      },
    };
    el.addEventListener = (type, fn) => {
      if (!el.listeners.has(type)) el.listeners.set(type, []);
      el.listeners.get(type).push(fn);
    };
    return el;
  };

  globalThis.document = {
    getElementById(id) {
      if (!store.has(id)) store.set(id, makeEl());
      return store.get(id);
    },
    createElement: makeEl,
    createDocumentFragment: () => makeEl('fragment'),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    addEventListener() {},
    body: makeEl('body'),
    documentElement: makeEl('html'),
  };

  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  // Node 26 の navigator は getter だけなので、上書きには defineProperty が要る
  Object.defineProperty(globalThis, 'navigator', {
    value: { canShare: () => false, clipboard: { writeText: async () => {} } },
    configurable: true,
    writable: true,
  });
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(0), 0);
  globalThis.AudioContext = class { constructor() { this.state = 'suspended'; } };
  globalThis.Audio = class {
    constructor(src) { this.src = src; this.volume = 0; this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };

  return store;
}

// ESM は1回しか評価されないので、起動と、その結果の確認は同じ test にまとめる
test('main.js が例外を出さずに起動し、画面の中身が埋まる', async () => {
  const store = installDom();
  await assert.doesNotReject(() => import('../src/main.js'), '起動で例外が出ないこと');

  assert.ok(store.get('board').children.length > 0, '盤面のマスが作られること');
  assert.ok(store.get('move-chart').children.length > 0, '駒の動き確認表が作られること');
  assert.equal(store.get('variant').children.length, 2, '遊べるモードが2つ並ぶこと');

  // ルール説明の数字は実装から埋める。手で書くと古くなって嘘を教えることになる
  for (const id of ['rule-promote', 'rule-interval', 'rule-quota-base', 'rule-quota-growth',
                    'rule-sizes', 'rule-chain', 'rule-chain-examples',
                    'rule-royal', 'rule-queens', 'rule-kings']) {
    const text = store.get(id).textContent;
    assert.ok(text && text !== '?', `${id} が埋まっていること（実際は "${text}"）`);
  }

  assert.equal(store.get('rule-promote').textContent, '10', '昇格ターンは実装の値');
  assert.equal(store.get('rule-queens').textContent, '110', 'クイーンロイヤルの倍率');
  assert.equal(store.get('rule-kings').textContent, '150', 'キングロイヤルの倍率');
  assert.match(store.get('log-summary').textContent, /記録はありません/, 'ログの要約が出ること');
});

test('メニューは押すと開き、閉じるボタンと背景で閉じる', async () => {
  // 上の test で読み込み済み。同じ store を見る
  const { document } = globalThis;
  const menu = document.getElementById('menu');

  // 起動直後は閉じている（HTML 側の hidden はスタブに無いので、ここでは閉じてから始める）
  document.getElementById('menu-close').fire('click');
  assert.equal(menu.hidden, true, '最初は閉じていること');

  document.getElementById('menu-open').fire('click');
  assert.equal(menu.hidden, false, '押すと開くこと');
  assert.ok(document.body.classList.contains('menu-open'), '後ろのスクロールを止めること');

  document.getElementById('menu-close').fire('click');
  assert.equal(menu.hidden, true, '閉じるボタンで閉じること');
  assert.ok(!document.body.classList.contains('menu-open'), 'スクロールを戻すこと');

  document.getElementById('menu-open').fire('click');
  document.getElementById('menu-backdrop').fire('click');
  assert.equal(menu.hidden, true, '背景を押しても閉じること');
});

test('メニューから「はじめから」を押すと盤面に戻る', () => {
  const { document } = globalThis;
  const menu = document.getElementById('menu');

  document.getElementById('menu-open').fire('click');
  assert.equal(menu.hidden, false);

  document.getElementById('reset').fire('click');
  assert.equal(menu.hidden, true, '押したらメニューは閉じること');
});

test('「はじめる」でゲーム画面へ、「ホームへ」で戻る', () => {
  const { document } = globalThis;
  const home = document.getElementById('home');
  const screen = document.getElementById('game-screen');

  document.getElementById('home-start').fire('click');
  assert.equal(home.hidden, true, 'ホームが隠れること');
  assert.equal(screen.hidden, false, 'ゲーム画面が出ること');

  document.getElementById('to-home').fire('click');
  assert.equal(home.hidden, false, 'ホームに戻ること');
  assert.equal(screen.hidden, true, 'ゲーム画面が隠れること');
});
