import { beforeEach, describe, expect, it } from 'vitest'
import { activeChipsAt, chipAction, clearGuideChips, markActiveChips, renderGuideChips, wordRange } from './guideChips'

const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const TEXT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'
let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  root.innerHTML = `<p id="a">Despejando la <b>diagonal</b> de nuestro alfil de casillas blancas y preparando el avance f5!</p><p id="b">Otro párrafo.</p>`
})
const p = (id: string) => root.querySelector(`#${id}`)!

describe('guide chips in the text (ai-narration-guides S1)', () => {
  it('puts one monospace chip per action in a line under the paragraph, kept out of the recognition', () => {
    renderGuideChips(root, [{ anchor: p('a'), textElement: p('a'), actions: '0Diagonal:c8-h3, 13Arrow:f7-f5', fen: FEN }])
    const line = p('a').nextElementSibling as HTMLElement
    expect(line.hasAttribute('data-guide-chips')).toBe(true)
    expect(line.hasAttribute('data-no-recognition')).toBe(true)
    expect([...line.querySelectorAll('button.guide-chip')].map((c) => c.textContent)).toEqual(['0Diagonal:c8-h3', '13Arrow:f7-f5'])
    expect(p('b').previousElementSibling).toBe(line)
  })

  it('renders nothing for an empty or unreadable list, and rendering again does not duplicate', () => {
    renderGuideChips(root, [{ anchor: p('a'), textElement: p('a'), actions: '', fen: FEN }, { anchor: p('b'), textElement: p('b'), actions: 'nonsense', fen: FEN }])
    expect(root.querySelectorAll('[data-guide-chips]')).toHaveLength(0)
    const target = { anchor: p('a'), textElement: p('a'), actions: '0Clear', fen: FEN }
    renderGuideChips(root, [target])
    renderGuideChips(root, [target])
    expect(root.querySelectorAll('[data-guide-chips]')).toHaveLength(1)
    clearGuideChips(root)
    expect(root.querySelectorAll('[data-guide-chips]')).toHaveLength(0)
  })

  it('reads a chip back as its action, position and paragraph', () => {
    renderGuideChips(root, [{ anchor: p('a'), textElement: p('a'), actions: '0Diagonal:c8-h3, 13Arrow:f7-f5', fen: FEN }])
    const chip = root.querySelectorAll('.guide-chip')[1]
    const hit = chipAction(chip)!
    expect(hit.action).toMatchObject({ at: 13, kind: 'Arrow', from: 'f7', to: 'f5' })
    expect(hit.group.fen).toBe(FEN)
    expect(hit.group.textElement).toBe(p('a'))
    expect(chipAction(p('b'))).toBeNull()
  })
})

describe('the word an action is anchored to (S2)', () => {
  it('finds word N of the narrated text, across inline tags and without counting the chips', () => {
    renderGuideChips(root, [{ anchor: p('a'), textElement: p('a'), actions: '0Clear', fen: FEN }])
    expect(wordRange(p('a'), 0)!.toString()).toBe('Despejando')
    expect(wordRange(p('a'), 2)!.toString()).toBe('diagonal')
    expect(wordRange(p('a'), 13)!.toString()).toBe('f5!')
    expect(wordRange(p('a'), 14)).toBeNull()
  })
})

describe('the chip of the action being performed (S2)', () => {
  it('is the last action at or before the word reached, with every action sharing its word', () => {
    const acts = '0Square:e5, 5Arrow:f1-b5, 5Piece:f1, 9Clear'
    renderGuideChips(root, [{ anchor: p('a'), textElement: p('a'), actions: acts, fen: FEN }])
    const group = chipAction(root.querySelector('.guide-chip')!)!.group
    expect(activeChipsAt(group.actions, 4)).toEqual([0])
    expect(activeChipsAt(group.actions, 5)).toEqual([1, 2])
    expect(activeChipsAt(group.actions, 8)).toEqual([1, 2])
    expect(activeChipsAt(group.actions, 12)).toEqual([3])
    expect(activeChipsAt(group.actions.slice(1), 0)).toEqual([])
    markActiveChips(root, TEXT, 5)
    expect([...root.querySelectorAll('.guide-chip')].map((c) => c.classList.contains('guide-chip-active'))).toEqual([false, true, true, false])
    markActiveChips(root, null, 0)
    expect(root.querySelectorAll('.guide-chip-active')).toHaveLength(0)
  })
})
