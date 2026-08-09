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
      click() {},
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
