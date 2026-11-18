import { beforeEach, describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from './studyBoardStore'
import { loadBoardMemory, saveBoardMemory } from './boardMemory'
import { useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

const [game] = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6', { algorithm: 2 })
const tree = game.tree
const [n1, , n3, , n5] = tree.mainline

beforeEach(() => { useStudyBoardStore.getState().reset(); localStorage.clear() })

describe('hover preview on the main board (S8)', () => {
  it('shows the position while hovering and goes back to the move that was there', () => {
    const s = useStudyBoardStore.getState()
    s.loadPosition(tree, n3, false)
    s.previewPosition(tree, n5, false, { square: 'b5', piece: 'b' })
    expect(useStudyBoardStore.getState().currentNodeId).toBe(n5)
    expect(useStudyBoardStore.getState().isolatedHighlight).toEqual({ square: 'b5', piece: 'b' })
    useStudyBoardStore.getState().endPreview()
    expect(useStudyBoardStore.getState().currentNodeId).toBe(n3)
    expect(useStudyBoardStore.getState().isolatedHighlight).toBeNull()
  })

  it('a click keeps the previewed position', () => {
    const s = useStudyBoardStore.getState()
    s.loadPosition(tree, n1, false)
    s.previewPosition(tree, n5, false, null)
    useStudyBoardStore.getState().commitPreview()
    useStudyBoardStore.getState().endPreview()
    expect(useStudyBoardStore.getState().currentNodeId).toBe(n5)
  })
})

describe('arrows in colours (S9)', () => {
  it('the arrow colour is chosen in the toolbar', () => {
    useStudyBoardStore.getState().setArrowColor('#ef4444')
    expect(useStudyBoardStore.getState().arrowColor).toBe('#ef4444')
  })
})

describe('what survives a refresh (S11)', () => {
  it('the board remembers the book, chapter, game, move and its arrows and marks', () => {
    saveBoardMemory(7, { chapter: 3, gameIndex: 1, nodeId: 'node-5', annotations: { 'node-5': { arrows: [{ startSquare: 'e2', endSquare: 'e4', color: '#22c55e' }], highlights: { e4: '#ef4444' }, pen: null } } })
    expect(loadBoardMemory(7)).toEqual({ chapter: 3, gameIndex: 1, nodeId: 'node-5', annotations: { 'node-5': { arrows: [{ startSquare: 'e2', endSquare: 'e4', color: '#22c55e' }], highlights: { e4: '#ef4444' }, pen: null } } })
    expect(loadBoardMemory(8)).toBeNull()
  })

  it('a book opened from outside (pasted text, Lichess, annotated game) is kept in the browser', () => {
    useExternalBookStore.getState().open('Pasted', [{ title: 'Game', html: '<p>1. e4 e5</p>', toc: [{ order: 1, title: 'Game' }] }])
    const saved = JSON.parse(localStorage.getItem('chessreader-external-book') ?? '{}')
    expect(saved.state.title).toBe('Pasted')
    expect(saved.state.chapters[0].html).toBe('<p>1. e4 e5</p>')
  })
})
