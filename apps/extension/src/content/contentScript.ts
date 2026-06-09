/**
 * contentScript.ts
 *
 * Runs in the context of any web page.
 * - detectDiagrams: finds chess diagram <img> elements
 * - detectGames: finds chess games in the page text via chess-shared
 * - applyMode: 'normal' | 'substitution' — toggles DOM mutation
 */

import { recognizeGames, type RecognizedGame } from '@chess-ebook/chess-shared'
import { createInteractiveBoard } from '../injected/InteractiveBoard'

// Map of original img elements to their injected replacements for reversibility
const substitutions = new Map<HTMLImageElement, Element>()

/** Heuristic: diagram images are chess-related if they have chess-related src/alt/class. */
function isChessDiagram(img: HTMLImageElement): boolean {
  const text = [img.src, img.alt, img.className, img.id].join(' ').toLowerCase()
  return (
    text.includes('chess') ||
    text.includes('diagram') ||
    text.includes('board') ||
    text.includes('fen') ||
    text.includes('position')
  )
}

/** Returns all <img> elements that look like chess diagrams. */
export function detectDiagrams(doc: Document): HTMLImageElement[] {
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>('img'))
  return imgs.filter(isChessDiagram)
}

/** Returns all recognised chess games found in the page's text content. */
export function detectGames(doc: Document): RecognizedGame[] {
  const text = doc.body?.innerText ?? doc.body?.textContent ?? ''
  return recognizeGames(text)
}

/** Apply display mode to the document. */
export function applyMode(
  mode: 'normal' | 'substitution',
  doc: Document = document
): void {
  if (mode === 'substitution') {
    const diagrams = detectDiagrams(doc)
    const games = detectGames(doc)

    diagrams.forEach((img, index) => {
      if (substitutions.has(img)) return // already replaced

      const game = games[index]
      const board = createInteractiveBoard(game?.tree ?? null)

      img.parentNode?.insertBefore(board, img)
      img.style.display = 'none'
      substitutions.set(img, board)
    })
  } else {
    // Restore originals
    substitutions.forEach((board, img) => {
      img.style.display = ''
      board.parentNode?.removeChild(board)
    })
    substitutions.clear()
  }
}
