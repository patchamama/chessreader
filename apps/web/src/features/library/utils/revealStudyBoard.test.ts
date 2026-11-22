import { describe, it, expect, beforeEach } from 'vitest'
import { revealStudyBoard } from './revealStudyBoard'

describe('revealStudyBoard', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('scrolls the study pane back to its top so the board shows', () => {
    document.body.innerHTML = '<aside data-study-pane><div data-study-board></div></aside>'
    const pane = document.querySelector('[data-study-pane]') as HTMLElement
    pane.scrollTop = 480
    revealStudyBoard()
    expect(pane.scrollTop).toBe(0)
  })

  it('does nothing when there is no study pane', () => {
    expect(() => revealStudyBoard()).not.toThrow()
  })
})
