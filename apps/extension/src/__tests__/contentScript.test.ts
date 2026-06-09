import { describe, it, expect, beforeEach } from 'vitest'
import { detectDiagrams, detectGames, applyMode } from '../content/contentScript'

function makeDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = bodyHtml
  return doc
}

describe('detectDiagrams', () => {
  it('returns chess diagram imgs by src keyword', () => {
    const doc = makeDoc(`
      <img src="/images/chess-diagram.png" alt="position">
      <img src="/logo.png" alt="logo">
    `)
    const result = detectDiagrams(doc)
    expect(result).toHaveLength(1)
    expect(result[0].src).toContain('chess-diagram')
  })

  it('detects diagrams by alt text "diagram"', () => {
    const doc = makeDoc(`<img src="/pos.png" alt="chess diagram showing the opening">`)
    const result = detectDiagrams(doc)
    expect(result).toHaveLength(1)
  })

  it('returns empty array when no chess images present', () => {
    const doc = makeDoc(`<img src="/cat.jpg" alt="a cat photo">`)
    const result = detectDiagrams(doc)
    expect(result).toHaveLength(0)
  })
})

describe('detectGames', () => {
  it('recognizes a game from page text content', () => {
    const doc = makeDoc(`<p>Here is a classic game: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6</p>`)
    // jsdom textContent works; innerText may not be available in jsdom
    const result = detectGames(doc)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].tree).toBeDefined()
    expect(result[0].tree.nodes.size).toBeGreaterThan(0)
  })

  it('returns empty array when no moves in page', () => {
    const doc = makeDoc(`<p>No chess here, just prose text about nothing.</p>`)
    const result = detectGames(doc)
    expect(result).toHaveLength(0)
  })
})

describe('applyMode', () => {
  let doc: Document

  beforeEach(() => {
    doc = makeDoc(`
      <div>
        <img id="diag1" src="/chess-diagram.png" alt="chess board position">
        <p>1. e4 e5 2. Nf3 Nc6</p>
      </div>
    `)
  })

  it('substitution: replaces chess diagram img with interactive board element', () => {
    applyMode('substitution', doc)
    const img = doc.getElementById('diag1') as HTMLImageElement
    // img should be hidden (display:none), board element injected
    expect(img.style.display).toBe('none')
    const board = doc.querySelector('[data-chess-board="true"]')
    expect(board).not.toBeNull()
  })

  it('normal: restores original img (removes injected board)', () => {
    applyMode('substitution', doc)
    applyMode('normal', doc)
    const img = doc.getElementById('diag1') as HTMLImageElement
    expect(img.style.display).not.toBe('none')
    const board = doc.querySelector('[data-chess-board="true"]')
    expect(board).toBeNull()
  })

  it('substitution is idempotent — applying twice does not double-inject', () => {
    applyMode('substitution', doc)
    applyMode('substitution', doc)
    const boards = doc.querySelectorAll('[data-chess-board="true"]')
    expect(boards.length).toBe(1)
  })
})
