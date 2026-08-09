// 駒の動き確認表。
//
// **実際の移動判定（movableSquares）から作る。**
// 表を手で描くと、ルールを変えたときに古くなって嘘を教えることになる。
//
// 作り方: 中央に調べたい駒、周りを全部「違う色の駒」で埋めた小さな盤を用意して、
// そこで movableSquares を呼ぶ。返ってきたマスがそのまま動ける範囲になる。
//
// 見せ方: 上に駒のマークを並べ、押すと下の盤がその駒の動きに切り替わる。
// 6つ分の盤を並べると場所を取るので、盤は1つだけにしている。

import { Color, GLYPH, PieceType, RANK_TABLES, createPiece } from './pieces.js';
import { movableSquares } from './moves.js';

/** 表示する盤の大きさ。奇数にして中央に駒を置く。ナイトの2マス移動が入る最小が5 */
export const CHART_SIZE = 5;

/** 表に載せる順番。弱い順に並べる */
export const CHART_PIECES = [
  { type: PieceType.Pawn, label: 'ポーン' },
  { type: PieceType.Knight, label: 'ナイト' },
  { type: PieceType.Bishop, label: 'ビショップ' },
  { type: PieceType.Rook, label: 'ルーク' },
  { type: PieceType.Queen, label: 'クイーン' },
  { type: PieceType.King, label: 'キング' },
];

/** その駒が動けるマス（CHART_SIZE の盤の座標） */
export function movementSquares(type, rankTable = RANK_TABLES.twoTier) {
  const center = (CHART_SIZE - 1) / 2;

  // 周りは全部「違う色の駒」。こうすると移動範囲がそのまま出る
  const board = Array.from({ length: CHART_SIZE }, () =>
    Array.from({ length: CHART_SIZE }, () =>
      createPiece(PieceType.Pawn, Color.Black, rankTable)
    )
  );
  board[center][center] = createPiece(type, Color.White, rankTable);

  return movableSquares(board, { r: center, c: center });
}

/** 動き確認表を作って container に入れる */
export function renderMovementChart(container, rankTable = RANK_TABLES.twoTier) {
  container.replaceChildren();

  const tabs = document.createElement('div');
  tabs.className = 'move-tabs';

  const grid = document.createElement('div');
  grid.className = 'move-grid';
  grid.style.setProperty('--n', String(CHART_SIZE));

  const buttons = [];
  const show = (type) => {
    drawGrid(grid, type, rankTable);
    for (const button of buttons) {
      button.classList.toggle('active', button.dataset.type === type);
    }
  };

  for (const { type, label } of CHART_PIECES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-tab';
    button.dataset.type = type;
    button.textContent = GLYPH[type];
    // マークだけだと読み上げで伝わらないので、名前は属性で持たせる
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.addEventListener('click', () => show(type));
    tabs.appendChild(button);
    buttons.push(button);
  }

  container.append(tabs, grid);
  show(CHART_PIECES[0].type);
}

function drawGrid(grid, type, rankTable) {
  const center = (CHART_SIZE - 1) / 2;
  const reachable = new Set(movementSquares(type, rankTable).map((s) => `${s.r},${s.c}`));

  grid.replaceChildren();
  for (let r = 0; r < CHART_SIZE; r++) {
    for (let c = 0; c < CHART_SIZE; c++) {
      const cell = document.createElement('span');
      const isSelf = r === center && c === center;
      cell.className = `move-cell${isSelf ? ' self' : ''}${reachable.has(`${r},${c}`) ? ' can' : ''}`;
      if (isSelf) cell.textContent = GLYPH[type];
      grid.appendChild(cell);
    }
  }
}
