// エントリーポイント。入力 → ゲームロジック → 描画 をつなぐ。

import { isBgmEnabled, isMuted, playCombo, setBgmEnabled, setMuted, unlockAudio } from './audio.js';
import { PieceType } from './pieces.js';
import { applyMove, canMove, createGame } from './game.js';
import { allPlayableMoves, clearedBy, hasAnyMove, playableSquares } from './moves.js';
import { VARIANTS } from './rules.js';
import { createLog } from './telemetry.js';
import { TUTORIAL_STEPS, TUTORIAL_VARIANT, parseBoard } from './tutorial.js';
import { GROUP_KIND, KIND_MULTIPLIER, chainMultiplier, scoreForGroup } from './score.js';
import { renderMovementChart } from './movement-chart.js';
import { createBoardView } from './ui.js';

const CLEAR_DELAY = 320; // 消える駒を光らせている時間(ms)
const FALL_DELAY = 220;  // 落下後に一息つく時間(ms)
const ROYAL_DELAY = 1600;   // レア役は中央の表示を読ませるので長めに止める
const PROMOTE_DELAY = 550;    // 昇格を見せる時間
const TRANSFORM_DELAY = 900;  // 盤面が全部ワイルドに変わったのを見せる時間
const WIPE_DELAY = 700;       // 一掃を見せる時間
const IDLE_HINT_MS = 10000; // 何もしないとヒントを出すまでの時間
const RIPEN_LEAD = 2;       // 昇格まで何ターンを切ったら光らせるか
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
const royalBannerEl = document.getElementById('royal-banner');
const tutorialEl = document.getElementById('tutorial');
const quotaEl = document.getElementById('quota');
const statsEl = document.getElementById('stats');
const tutorialDotsEl = document.getElementById('tutorial-dots');
const tutorialSkipButton = document.getElementById('tutorial-skip');
const tutorialNextButton = document.getElementById('tutorial-next');
const muteButton = document.getElementById('mute');
const moveChartEl = document.getElementById('move-chart');
const tutorialStartButton = document.getElementById('tutorial-start');

/** チュートリアルを見たかどうかの記録 */
const TUTORIAL_SEEN_KEY = 'chess-puzzle.tutorial-seen';
const variantSelect = document.getElementById('variant');
const logSummaryEl = document.getElementById('log-summary');
const menuEl = document.getElementById('menu');
const menuOpenButton = document.getElementById('menu-open');

let variant = VARIANTS.compact;
let game = createGame(Math.random, { variant });

// プレイ履歴。保存できない環境では黙って何もしない
const log = createLog(typeof localStorage === 'undefined' ? null : localStorage);
log.startGame({ variant, rules: game.rules });
let view = createBoardView(boardEl, variant, onCellClick);
let selected = null;      // 選択中のマス {r,c}
let busy = false;         // アニメーション再生中は入力を止める
let tutorialStep = null;  // チュートリアル中なら何ステップ目か（0始まり）
/** 遊べるモード（選択肢に出すもの） */
const selectableVariants = Object.values(VARIANTS).filter((v) => v.selectable);
let awaitingNext = false; // その手が終わって NEXT 待ちか
let idleHint = [];        // 手が止まったときに光らせるマス
let idleTimer = null;

function onCellClick(pos) {
  unlockAudio(); // iOS は最初にユーザーが触るまで音を出せない
  noteActivity();
  if (busy || game.over) return;
  if (tutorialStep !== null && !isTutorialTap(pos)) return; // 決められた手だけ受け付ける

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

/** チュートリアル中に押してよいマスか */
function isTutorialTap(pos) {
  const step = TUTORIAL_STEPS[tutorialStep];
  const target = selected ? step.move : step.select;
  return Boolean(target) && target.r === pos.r && target.c === pos.c;
}

/** チュートリアルで次に押してほしいマス */
function tutorialGuide() {
  if (tutorialStep === null || awaitingNext) return [];
  const step = TUTORIAL_STEPS[tutorialStep];
  const target = selected ? step.move : step.select;
  return target ? [target] : [];
}

/** そこへ入れば揃う相手。動かす前に見せて「3つ並ぶ」と分からせる */
function tutorialPartners() {
  // 消えたあとも光らせ続けると、補充された別の駒を指しているように見える
  if (tutorialStep === null || awaitingNext) return [];
  return TUTORIAL_STEPS[tutorialStep].partners ?? [];
}

/** 進み具合を点で示す（文章は使わない） */
function drawTutorialDots() {
  tutorialDotsEl.replaceChildren();
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const dot = document.createElement('span');
    if (i < tutorialStep) dot.className = 'done';
    else if (i === tutorialStep) dot.className = 'current';
    tutorialDotsEl.appendChild(dot);
  }
}

/**
 * チュートリアル中は通常の操作ボタンを隠す。
 * 出したままだと「はじめから」で普通のゲームが始まってしまい、
 * チュートリアルの手だけ受け付ける状態が残って操作不能になる。
 */
function setTutorialUI(active) {
  tutorialEl.hidden = !active;
  quotaEl.hidden = active;   // チュートリアル中はスコアもノルマも意味が無い
  statsEl.hidden = active;
  resetButton.hidden = active;
  tutorialStartButton.hidden = active;
  variantSelect.hidden = active || selectableVariants.length < 2;
  // チュートリアル中はメニューを開かせない（とばす／NEXT だけに集中させる）
  if (menuOpenButton) menuOpenButton.hidden = active;
  if (active) closeMenu();
  if (!active) tutorialNextButton.hidden = true;
}

function startTutorial() {
  clearIdleHint();
  tutorialStep = 0;
  awaitingNext = false;
  variant = TUTORIAL_VARIANT;
  variantSelect.value = variant.id;
  view = createBoardView(boardEl, variant, onCellClick);
  setTutorialUI(true);
  loadTutorialStep();
}

/** 今のステップの盤面を用意する（前のステップの結果を引きずらない） */
function loadTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  // ノルマで途中終了しないようにする
  game = createGame(Math.random, { variant, quotaBase: 0, quotaGrowth: 1, clearingMovesOnly: false });
  game.board = parseBoard(step.board, variant.rankTable);
  selected = null;
  setMessage('');
  awaitingNext = false;
  tutorialNextButton.hidden = true;
  drawTutorialDots();
  draw();
}

/** ステップの1手が終わったら、NEXT を出して待つ（結果を見る時間を作る） */
function waitForNext() {
  awaitingNext = true;
  tutorialNextButton.hidden = false;
}

function advanceTutorial() {
  awaitingNext = false;
  tutorialNextButton.hidden = true;
  tutorialStep++;
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    endTutorial();
    return;
  }
  loadTutorialStep();
}

function endTutorial() {
  tutorialStep = null;
  awaitingNext = false;
  setTutorialUI(false);
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // プライベートモードなどで保存できなくても、遊べれば問題ない
  }
  startNewGame();
  setMessage('あそび方はここまで。あとは同じ要領で点を稼ごう');
}

async function playMove(from, to) {
  busy = true;

  // 記録は「指す前の盤面」で測る。あとから「もっと消せる手があったか」を見たいため。
  // 実測で1ターン0.42ms（6×6）なので、毎ターン測っても体感には出ない
  const piece = game.board[from.r][from.c];
  const options = tutorialStep === null
    ? allPlayableMoves(game.board, game.rules.clearingMovesOnly)
    : [];
  const best = options.reduce((max, m) => Math.max(max, clearedBy(game.board, m.from, m.to)), 0);

  const result = applyMove(game, from, to);
  if (!result) {
    busy = false;
    return;
  }

  // チュートリアルは決められた手しか指せないので、傾向の分析には混ぜない
  if (tutorialStep === null) {
    log.recordMove({ from, to, piece, result, options: options.length, best });
  }

  for (const phase of result.phases) {
    if (phase.kind === 'clear') {
      playCombo(phase.chain);
      view.render(phase.board, { clearing: phase.cells });
      // 消えた場所そのものに点数を出す
      for (const group of phase.groups) {
        view.popPoints(group.cells, `+${group.points}`, group.kind !== GROUP_KIND.Normal);
      }
      setMessage(clearMessage(phase), phase.royalKind !== null);
      if (phase.royalKind) showRoyalBanner(phase.royalKind);
      await sleep(phase.royalKind ? ROYAL_DELAY : CLEAR_DELAY);
    } else if (phase.kind === 'transform') {
      // 盤面が一面クイーン／キングに変わる。ここは黙って見せる
      view.render(phase.board, { promoted: phase.cells });
      await sleep(TRANSFORM_DELAY);
    } else if (phase.kind === 'wipe') {
      playCombo(Math.max(phase.chain ?? 1, 4)); // 一掃は高めの音で
      view.render(phase.board, { clearing: phase.cells });
      view.popPoints(phase.cells, `+${phase.points}`, true);
      setMessage(`盤面リセット +${phase.points}`, true);
      await sleep(WIPE_DELAY);
    } else if (phase.kind === 'promote') {
      view.render(phase.board, { promoted: phase.cells });
      await sleep(PROMOTE_DELAY);
    } else {
      view.render(phase.board);
      if (phase.kind === 'fall') await sleep(FALL_DELAY);
    }
    updateStats();
  }

  if (result.chain === 0) setMessage('');
  if (result.check) await showQuotaResult(result.check);
  let stuck = false;
  if (!game.over && !hasAnyMove(game.board, game.rules.clearingMovesOnly)) {
    game.over = true;
    stuck = true;
    setMessage('動かせる駒がありません。ゲーム終了');
  }
  if (game.over && tutorialStep === null) {
    log.endGame({ game, why: stuck ? 'stuck' : 'quota' });
    updateLogSummary();
  }

  busy = false;
  if (tutorialStep !== null) {
    waitForNext();
    draw();
    return;
  }
  draw();
  scheduleIdleHint();
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

/**
 * しばらく手が止まったら、消せる手をひとつ選んで「動かす駒」だけを光らせる。
 * 行き先まで見せると答えそのものになるので、駒だけに留めている。
 */
function scheduleIdleHint() {
  clearIdleHint();
  if (game.over || tutorialStep !== null) return;
  idleTimer = setTimeout(showIdleHint, IDLE_HINT_MS);
}

/**
 * 操作があったことを記録する。
 * ヒントが出ているあいだは消さない。一度出したらそのターンは出しっぱなしにする
 * （触るたびに消えると、光った駒を確かめようとした瞬間に消えてしまう）。
 */
function noteActivity() {
  if (idleHint.length > 0) return;
  scheduleIdleHint();
}

function clearIdleHint() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (idleHint.length > 0) {
    idleHint = [];
    draw();
  }
}

function showIdleHint() {
  const size = game.board.length;
  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const to of playableSquares(game.board, { r, c }, game.rules.clearingMovesOnly)) {
        moves.push({ from: { r, c }, to });
      }
    }
  }
  if (moves.length === 0) return;

  idleHint = [moves[Math.floor(Math.random() * moves.length)].from];
  draw();
}

/**
 * もうすぐ昇格するポーンを探す。
 * 昇格が見えていないと「守った結果」ではなく「勝手に起きたこと」に見えてしまう。
 */
function ripeningPawns() {
  const after = game.rules.promoteAfter;
  if (after <= 0 || game.over) return [];

  const cells = [];
  for (let r = 0; r < game.board.length; r++) {
    for (let c = 0; c < game.board.length; c++) {
      const piece = game.board[r][c];
      if (!piece || piece.type !== PieceType.Pawn) continue;
      if (after - piece.age <= RIPEN_LEAD) cells.push({ r, c });
    }
  }
  return cells;
}

function draw() {
  view.render(game.board, {
    selected,
    movable: selected ? playableSquares(game.board, selected, game.rules.clearingMovesOnly) : [],
    ripening: ripeningPawns(),
    guide: [...tutorialGuide(), ...idleHint],
    partner: tutorialPartners(),
  });
  updateStats();
  boardEl.classList.toggle('over', game.over);
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
  // チュートリアルの状態が残っていると、決められた手しか受け付けなくなる
  if (tutorialStep !== null) {
    tutorialStep = null;
    awaitingNext = false;
    setTutorialUI(false);
  }
  // 途中でやめたゲームも「どこでやめたか」として残す
  log.endGame({ game, why: 'quit' });
  game = createGame(Math.random, { variant });
  log.startGame({ variant, rules: game.rules });
  updateLogSummary();
  selected = null;
  setMessage('');
  draw();
  scheduleIdleHint();
}

resetButton.addEventListener('click', () => {
  if (busy) return;
  startNewGame();
  closeMenu(); // 押したら盤面に戻す
});

// 駒の動き確認表。実際の移動判定から作るので、ルールを変えても古くならない
renderMovementChart(moveChartEl, variant.rankTable);

// モードの選択肢を作る（遊べるモードだけ）
for (const v of selectableVariants) {
  const option = document.createElement('option');
  option.value = v.id;
  option.textContent = v.name;
  variantSelect.appendChild(option);
}
variantSelect.value = variant.id;
// 選べるモードが1つしか無いなら、セレクト自体を出さない
variantSelect.hidden = selectableVariants.length < 2;

variantSelect.addEventListener('change', () => {
  if (busy) {
    variantSelect.value = variant.id;
    return;
  }
  variant = VARIANTS[variantSelect.value];
  view = createBoardView(boardEl, variant, onCellClick); // 盤面サイズが変わるので作り直す
  startNewGame();
  fillRuleNumbers(); // モードごとにノルマが違う
  closeMenu();
});

tutorialStartButton.addEventListener('click', () => {
  if (busy) return;
  startTutorial();
});

muteButton.addEventListener('click', () => {
  setMuted(!isMuted());
  updateMuteButton();
});

function updateMuteButton() {
  muteButton.textContent = isMuted() ? '🔇' : '🔊';
  muteButton.setAttribute('aria-label', isMuted() ? '音を出す' : '音を消す');
}
updateMuteButton();

tutorialNextButton.addEventListener('click', () => {
  if (busy) return;
  advanceTutorial();
});

tutorialSkipButton.addEventListener('click', () => {
  if (busy) return;
  endTutorial();
});

let seenTutorial = false;
try {
  seenTutorial = localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
} catch {
  seenTutorial = true; // 記録できない環境では自動再生しない
}

if (seenTutorial) {
  draw();
  scheduleIdleHint();
} else {
  startTutorial();
}

// --- ルール説明の数字は実装から作る -------------------------------------
//
// 手で書くとルールを変えたときに古くなり、プレイヤーに嘘を教えることになる
// （動き確認表と同じ方針）。実際に何度も食い違いが起きた。

function fillRuleNumbers() {
  const rules = game.rules;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set('rule-promote', String(rules.promoteAfter));
  set('rule-interval', String(rules.quotaInterval));
  set('rule-quota-base', rules.quotaBase.toLocaleString());
  set('rule-quota-growth', String(Math.round((rules.quotaGrowth - 1) * 100)));

  set('rule-sizes', [3, 4, 5]
    .map((n) => `${n}マス${scoreForGroup(n, 1, GROUP_KIND.Normal, rules.chainGrowth)}点`)
    .join(' / '));

  set('rule-chain', String(rules.chainGrowth));
  set('rule-chain-examples', [2, 5, 8]
    .map((n) => `${n}連鎖${chainMultiplier(n, rules.chainGrowth).toFixed(1)}倍`)
    .join(' / '));

  set('rule-royal', String(KIND_MULTIPLIER[GROUP_KIND.Royal]));
  set('rule-queens', String(KIND_MULTIPLIER[GROUP_KIND.Queens]));
  set('rule-kings', String(KIND_MULTIPLIER[GROUP_KIND.Kings]));
}

// --- プレイ履歴 ---------------------------------------------------------

function updateLogSummary() {
  if (!logSummaryEl) return;
  const { games, turns, best } = log.summary();
  logSummaryEl.textContent = games === 0
    ? 'まだ記録はありません'
    : `${games}ゲーム / ${turns}手 / 最高 ${best.toLocaleString()}点`;
}

/**
 * ログを書き出す。
 *
 * iOS の WKWebView では `<a download>` が効かないことがあるので、
 * 共有シート → ダウンロード → クリップボード の順に試す。
 * どれかは必ず通るようにしておかないと、実機で取り出せない。
 */
async function exportLog() {
  const json = log.toJSON();
  const name = `chess-puzzle-log-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'チェスパズルのプレイ履歴' });
      return;
    }
  } catch {
    // 共有をキャンセルした場合もここに来る。次の手段は試さない
    return;
  }

  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  } catch {
    // 最後の手段へ
  }

  try {
    await navigator.clipboard.writeText(json);
    if (logSummaryEl) logSummaryEl.textContent = 'コピーしました';
  } catch {
    if (logSummaryEl) logSummaryEl.textContent = '書き出せませんでした';
  }
}

document.getElementById('log-export')?.addEventListener('click', exportLog);
document.getElementById('log-clear')?.addEventListener('click', () => {
  log.clear();
  log.startGame({ variant, rules: game.rules });
  updateLogSummary();
});

fillRuleNumbers();
updateLogSummary();

// --- メニューの開け閉め ---------------------------------------------------
//
// 設定・説明・履歴はメニューの中だけに置く。
// 遊んでいる最中に目に入る情報が多いほど、盤面を読む邪魔になる。

function openMenu() {
  if (!menuEl) return;
  menuEl.hidden = false;
  document.body.classList.add('menu-open');
  updateLogSummary(); // 開いたときの数字にする
  document.getElementById('menu-close')?.focus();
}

function closeMenu() {
  if (!menuEl || menuEl.hidden) return;
  menuEl.hidden = true;
  document.body.classList.remove('menu-open');
  menuOpenButton?.focus();
}

menuOpenButton?.addEventListener('click', openMenu);
document.getElementById('menu-close')?.addEventListener('click', closeMenu);
document.getElementById('menu-backdrop')?.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

// --- BGM ----------------------------------------------------------------
//
// 既定では鳴らさない。音が出ると困る場面（電車など）で開いてすぐ鳴るのは避けたい。
// 一度選んだら覚えておく。

const BGM_KEY = 'chess-puzzle.bgm';
const bgmButton = document.getElementById('bgm');

function updateBgmButton() {
  if (!bgmButton) return;
  const on = isBgmEnabled();
  bgmButton.textContent = on ? '🎵 BGM' : '🎵 BGM オフ';
  bgmButton.setAttribute('aria-pressed', String(on));
  bgmButton.setAttribute('aria-label', on ? 'BGMを止める' : 'BGMを鳴らす');
}

bgmButton?.addEventListener('click', () => {
  const next = !isBgmEnabled();
  setBgmEnabled(next);
  try {
    localStorage.setItem(BGM_KEY, next ? '1' : '0');
  } catch {
    // 覚えられなくても鳴らせる
  }
  updateBgmButton();
});

try {
  if (localStorage.getItem(BGM_KEY) === '1') setBgmEnabled(true);
} catch {
  // 読めなくても既定（オフ）で動く
}
updateBgmButton();
