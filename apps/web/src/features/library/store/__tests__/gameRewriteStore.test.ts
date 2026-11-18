import { describe, it, expect, beforeEach } from 'vitest'
import { useGameRewriteStore } from '../gameRewriteStore'
import { clearGameLayout, loadGameLayouts, saveGameLayout } from '../gameLayoutStore'

beforeEach(() => {
  localStorage.clear()
  useGameRewriteStore.setState({ rewrites: {} })
})

describe('gameRewriteStore (S3)', () => {
  it('keeps the new commentary per book, chapter and game with the layout chosen before, and gives it back on restore', () => {
    const s = useGameRewriteStore.getState()
    s.save(7, 2, 1, { text: '1. e4 e5', layout: 'braces' })
    s.save(7, 3, 0, { text: '1. d4' })
    expect(useGameRewriteStore.getState().rewrites['7:2']).toEqual({ 1: { text: '1. e4 e5', layout: 'braces' } })
    expect(JSON.parse(localStorage.getItem('chessreader-game-rewrites-v1')!)['7:3']).toEqual({ 0: { text: '1. d4' } })
    expect(useGameRewriteStore.getState().clear(7, 2, 1)).toEqual({ text: '1. e4 e5', layout: 'braces' })
    expect(useGameRewriteStore.getState().rewrites['7:2']).toEqual({})
    expect(useGameRewriteStore.getState().rewrites['7:3']).toEqual({ 0: { text: '1. d4' } })
  })
})

describe('clearGameLayout', () => {
  it('forgets the layout chosen for one game only', () => {
    saveGameLayout(7, 1, 0, 'braces')
    saveGameLayout(7, 1, 1, 'paragraphs')
    clearGameLayout(7, 1, 0)
    expect(loadGameLayouts(7, 1)).toEqual({ 1: 'paragraphs' })
  })
})
