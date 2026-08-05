// 画面まわり。盤面の描画とクリックの受け取りだけを担当する。

import { GLYPH, isWild, rankLabel } from './pieces.js';

/** 得点の表示が消えるまでの時間(ms)。CSS の pop-up アニメーションと合わせる */
const POP_DURATION = 900;

/**
 * 盤面のマスを作る。盤面サイズはモードによって変わるので、
 * モードを切り替えるときは作り直す。
 */
export function createBoardView(container, variant, onCellClick) {
  const size = variant.boardSize;
  const cells = [];

  container.replaceChildren();
  container.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  // マスの大きさに合わせて駒の文字サイズを決める（CSS 側で使う）
  container.style.setProperty('--size', String(size));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.addEventListener('click', () => onCellClick({ r, c }));
      container.appendChild(cell);
      cells.push(cell);
    }
  }

  /**
   * 盤面を描き直す。
   * highlight: { selected, movable, clearing, royal, royalTarget }
   * いずれも {r,c} または その配列
   */
  function render(board, highlight = {}) {
    const movable = keySet(highlight.movable);
    const clearing = keySet(highlight.clearing);
    const royal = keySet(highlight.royal);
    const royalTarget = keySet(highlight.royalTarget);
    const selected = highlight.selected ? key(highlight.selected) : null;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = cells[r * size + c];
        const piece = board[r][c];
        const k = `${r},${c}`;

        cell.classList.toggle('selected', selected === k);
        cell.classList.toggle('movable', movable.has(k));
        cell.classList.toggle('clearing', clearing.has(k));
        cell.classList.toggle('royal', royal.has(k));
        cell.classList.toggle('royal-target', royalTarget.has(k));
        cell.classList.toggle('empty', piece === null);

        if (!piece) {
          cell.innerHTML = '';
          delete cell.dataset.pieceId;
          continue;
        }
        // 同じ駒なら描き直さない（アニメーションが途切れないように）
        if (cell.dataset.pieceId === String(piece.id)) continue;
        cell.dataset.pieceId = String(piece.id);

        // ランクごとに違う色のオーラを付ける。数字を出さずにランクが分かるようにするため。
        const aura = isWild(piece) ? 'wild' : `rank-${piece.rank}`;
        cell.innerHTML = `<span class="piece ${piece.color} ${aura}">${GLYPH[piece.type]}</span>`;
        cell.setAttribute('aria-label', `${piece.color === 'white' ? '白' : '黒'} ${piece.type} ランク${rankLabel(piece)}`);
      }
    }
  }

  /**
   * 消えたカタマリの上に得点を浮かび上がらせる。
   * カタマリの中心（マスの範囲の真ん中）に置いて、少し上へ流しながら消す。
   */
  function popPoints(cells, text, highlight = false) {
    const rows = cells.map((cell) => cell.r);
    const cols = cells.map((cell) => cell.c);
    const centerRow = (Math.min(...rows) + Math.max(...rows)) / 2;
    const centerCol = (Math.min(...cols) + Math.max(...cols)) / 2;

    const pop = document.createElement('span');
    pop.className = highlight ? 'pop royal' : 'pop';
    pop.textContent = text;
    pop.style.left = `${((centerCol + 0.5) / size) * 100}%`;
    pop.style.top = `${((centerRow + 0.5) / size) * 100}%`;
    container.appendChild(pop);
    setTimeout(() => pop.remove(), POP_DURATION);
  }

  return { render, popPoints };
}

function key(pos) {
  return `${pos.r},${pos.c}`;
}

function keySet(list) {
  return new Set((list ?? []).map(key));
}
