/**
 * InteractiveBoard.ts
 *
 * Framework-light interactive board injected into the page DOM.
 * Uses chess-shared GameTree/GameNode for tree navigation.
 * Renders a minimal SVG/DOM board — no React, safe for content-script injection.
 */

import { type GameTree, type GameNode, mainlineNodes } from '@chess-ebook/chess-shared'

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

/** Parse a FEN string into a rank×file piece map. */
function parseFenBoard(fen: string): Record<string, string> {
  const parts = fen.split(' ')
  const ranks = parts[0].split('/')
  const board: Record<string, string> = {}

  ranks.forEach((rank, rankIdx) => {
    let fileIdx = 0
    for (const ch of rank) {
      if (/\d/.test(ch)) {
        fileIdx += parseInt(ch)
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b'
        const piece = ch.toUpperCase()
        const square = String.fromCharCode(97 + fileIdx) + (8 - rankIdx)
        board[square] = color + piece
        fileIdx++
      }
    }
  })

  return board
}

/** Render a simple 8×8 board element from a FEN string. */
function renderBoard(fen: string): HTMLElement {
  const board = parseFenBoard(fen)
  const container = document.createElement('div')
  container.className = 'chess-ext-board'
  container.style.cssText =
    'display:inline-grid;grid-template-columns:repeat(8,32px);grid-template-rows:repeat(8,32px);border:2px solid #333;font-size:22px;line-height:32px;text-align:center;'

  for (let rank = 8; rank >= 1; rank--) {
    for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
      const file = String.fromCharCode(97 + fileIdx)
      const square = file + rank
      const cell = document.createElement('div')
      const light = (rank + fileIdx) % 2 === 1
      cell.style.cssText = `width:32px;height:32px;background:${light ? '#f0d9b5' : '#b58863'};`
      const piece = board[square]
      if (piece) {
        cell.textContent = PIECE_UNICODE[piece] ?? ''
      }
      container.appendChild(cell)
    }
  }

  return container
}

/**
 * Creates an interactive board element for injection into the page.
 * Shows the starting position (or last mainline position if tree provided).
 * Includes navigation buttons when a GameTree is provided.
 */
export function createInteractiveBoard(tree: GameTree | null): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'chess-ext-interactive-board'
  wrapper.setAttribute('data-chess-board', 'true')
  wrapper.style.cssText = 'display:inline-block;margin:8px;vertical-align:top;'

  const startFen =
    tree?.startFen ??
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  let nodes: GameNode[] = []
  let cursor = -1

  if (tree) {
    nodes = mainlineNodes(tree)
    cursor = nodes.length - 1
  }

  function currentFen(): string {
    if (cursor < 0 || nodes.length === 0) return startFen
    return nodes[cursor]?.fen ?? startFen
  }

  let boardEl = renderBoard(currentFen())
  wrapper.appendChild(boardEl)

  if (tree && nodes.length > 0) {
    const controls = document.createElement('div')
    controls.style.cssText = 'display:flex;gap:4px;margin-top:4px;'

    const prev = document.createElement('button')
    prev.textContent = '◀'
    prev.onclick = () => {
      if (cursor > -1) {
        cursor--
        const newBoard = renderBoard(currentFen())
        wrapper.replaceChild(newBoard, boardEl)
        boardEl = newBoard
      }
    }

    const next = document.createElement('button')
    next.textContent = '▶'
    next.onclick = () => {
      if (cursor < nodes.length - 1) {
        cursor++
        const newBoard = renderBoard(currentFen())
        wrapper.replaceChild(newBoard, boardEl)
        boardEl = newBoard
      }
    }

    controls.appendChild(prev)
    controls.appendChild(next)
    wrapper.appendChild(controls)
  }

  return wrapper
}
