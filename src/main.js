// エントリーポイント。入力 → ゲームロジック → 描画 をつなぐ。

import { applyMove, canMove, createGame } from './game.js';
import { findRoyalChances } from './hints.js';
import { movableSquares, hasAnyMove } from './moves.js';
import { VARIANTS } from './rules.js';
import { GROUP_KIND } from './score.js';
import { createBoardView } from './ui.js';

const CLEAR_DELAY = 320; // 消える駒を光らせている時間(ms)
const FALL_DELAY = 220;  // 落下後に一息つく時間(ms)
const ROYAL_DELAY = 1600; // レア役は中央の表示を読ませるので長めに止める
const QUOTA_DELAY = 800; // ノルマ判定の結果を見せる時間

const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const chainEl = document.getElementById('max-chain');
const messageEl = document.getElementById('message');
const resetButton = document.getElementById('reset');
const roundEl = document.getElementById('round');
const turnsLeftEl = document.getElementById('turns-left');
const roundScoreEl = document.getElementById('round-score');
const targetEl = document.getElementById('target');
const quotaFillEl = document.getElementById('quota-fill');
const hintEl = document.getElementById('hint');
const royalBannerEl = document.getElementById('royal-banner');
const variantSelect = document.getElementById('variant');

let variant = VARIANTS.standard;
let game = createGame(Math.random, { variant });
let view = createBoardView(boardEl, variant, onCellClick);
let selected = null;      // 選択中のマス {r,c}
let busy = false;         // アニメーション再生中は入力を止める
let royalChances = [];    // あと1手でレア役になる手

function onCellClick(pos) {
  if (busy || game.over) return;

  const piece = game.board[pos.r][pos.c];

  // 選択中の駒をもう一度押したら選択解除
  if (selected && selected.r === pos.r && selected.c === pos.c) {
    selected = null;
    draw();
    return;
  }

  // 移動先として有効なら動かす
  if (selected && canMove(game, selected, pos)) {
    const from = selected;
    selected = null;
    playMove(from, pos);
    return;
  }

  // それ以外は選択の切り替え
  selected = piece ? pos : null;
  draw();
}

async function playMove(from, to) {
  busy = true;
  const result = applyMove(game, from, to);
  if (!result) {
    busy = false;
    return;
  }

  for (const phase of result.phases) {
    if (phase.kind === 'clear') {
      view.render(phase.board, { clearing: phase.cells });
      // 消えた場所そのものに点数を出す
      for (const group of phase.groups) {
        view.popPoints(group.cells, `+${group.points}`, group.kind !== GROUP_KIND.Normal);
      }
      setMessage(clearMessage(phase), phase.royalKind !== null);
      if (phase.royalKind) showRoyalBanner(phase.royalKind);
      await sleep(phase.royalKind ? ROYAL_DELAY : CLEAR_DELAY);
    } else {
      view.render(phase.board);
      if (phase.kind === 'fall') await sleep(FALL_DELAY);
    }
    updateStats();
  }

  if (result.chain === 0) setMessage('');
  if (result.check) await showQuotaResult(result.check);
  if (!game.over && !hasAnyMove(game.board)) {
    game.over = true;
    setMessage('動かせる駒がありません。ゲーム終了');
  }

  busy = false;
  refreshHints();
  draw();
}

/** ラウンドの区切りでノルマの判定結果を見せる */
async function showQuotaResult(check) {
  if (check.passed) {
    setMessage(`ラウンド${check.round} 突破！ (${check.roundScore} / ${check.target})`);
  } else {
    setMessage(`ノルマ未達 (${check.roundScore} / ${check.target}) — ゲーム終了`, true);
  }
  await sleep(QUOTA_DELAY);
}

const ROYAL_LABEL = {
  [GROUP_KIND.Royal]: '♛♚ ロイヤル',
  [GROUP_KIND.Queens]: '♛ クイーンロイヤル',
  [GROUP_KIND.Kings]: '♚ キングロイヤル',
};

// 点数は盤面に、レア役は画面中央に出すので、上のメッセージは連鎖数だけを伝える
function clearMessage(phase) {
  if (phase.chain >= 2) return `${phase.chain} 連鎖！`;
  return '';
}

/** レア役の名前を画面中央に大きく出す */
function showRoyalBanner(kind) {
  royalBannerEl.firstElementChild.textContent = ROYAL_LABEL[kind];
  royalBannerEl.classList.remove('show');
  void royalBannerEl.offsetWidth; // アニメーションを頭から再生させる
  royalBannerEl.classList.add('show');
}

function draw() {
  // 選択中の駒からレア役が決まるなら、その移動先を特別に光らせる
  const royalTarget = selected
    ? royalChances.filter((c) => c.from.r === selected.r && c.from.c === selected.c).map((c) => c.to)
    : [];

  view.render(game.board, {
    selected,
    movable: selected ? movableSquares(game.board, selected) : [],
    // レア役を作れる駒の予告は、駒を選んでいないときだけ出す。
    // 選択中に出すと「移動できるマス」のハイライトと紛らわしいため。
    royal: selected || game.over ? [] : royalChances.map((c) => c.from),
    royalTarget,
  });
  updateStats();
  boardEl.classList.toggle('over', game.over);
}

/** 「あと1手でレア役」の状態を調べ直す。盤面が変わったときだけ呼ぶ */
function refreshHints() {
  royalChances = game.over ? [] : findRoyalChances(game.board);

  if (royalChances.length === 0) {
    hintEl.textContent = '';
    hintEl.classList.remove('visible');
    return;
  }
  hintEl.textContent = royalChances.some((c) => c.kind !== GROUP_KIND.Royal)
    ? '♛♛♛ 単一ロイヤルのチャンス！光っている駒を動かせます'
    : '♛♚ ロイヤルチャンス！光っている駒を動かせます';
  hintEl.classList.add('visible');
}

function updateStats() {
  scoreEl.textContent = String(game.score);
  movesEl.textContent = String(game.moves);
  chainEl.textContent = String(game.maxChain);
  roundEl.textContent = String(game.round);
  turnsLeftEl.textContent = String(game.turnsLeft);
  roundScoreEl.textContent = String(game.roundScore);
  targetEl.textContent = String(game.target);

  const ratio = game.target === 0 ? 1 : Math.min(1, game.roundScore / game.target);
  quotaFillEl.style.width = `${ratio * 100}%`;
  quotaFillEl.classList.toggle('reached', ratio >= 1);
}

function setMessage(text, highlight = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('royal', highlight);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startNewGame() {
  game = createGame(Math.random, { variant });
  selected = null;
  setMessage('');
  refreshHints();
  draw();
}

resetButton.addEventListener('click', () => {
  if (busy) return;
  startNewGame();
});

// モードの選択肢を作る
for (const v of Object.values(VARIANTS)) {
  const option = document.createElement('option');
  option.value = v.id;
  option.textContent = v.name;
  variantSelect.appendChild(option);
}
variantSelect.value = variant.id;

variantSelect.addEventListener('change', () => {
  if (busy) {
    variantSelect.value = variant.id;
    return;
  }
  variant = VARIANTS[variantSelect.value];
  view = createBoardView(boardEl, variant, onCellClick); // 盤面サイズが変わるので作り直す
  startNewGame();
});

refreshHints();
draw();
