import { describe, expect, it } from 'vitest'
import { startThinking, switchThinking, thinkingNow } from './thinkTime'

describe('elapsed thinking time of both players (S14.6)', () => {
  it('adds the time since the last move to the side that moved, and keeps counting for the side to move', () => {
    let t = startThinking('white', 1000)
    t = switchThinking(t, 6000) // White thought 5 s
    expect(t).toMatchObject({ white: 5000, black: 0, turn: 'black', since: 6000 })
    t = switchThinking(t, 8000) // Black thought 2 s
    expect(thinkingNow(t, 9500)).toEqual({ white: 6500, black: 2000 })
  })
  it('stops counting once the game is over', () => {
    const t = switchThinking(startThinking('white', 0), 3000, true)
    expect(thinkingNow(t, 10000)).toEqual({ white: 3000, black: 0 })
  })
})
