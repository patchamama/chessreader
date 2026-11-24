import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'

const dbActions = vi.hoisted(() => vi.fn(async (): Promise<string | undefined> => undefined))
vi.mock('./commentActions', async (orig) => ({ ...(await orig<object>()), databaseActionsFor: dbActions }))

import { useGuideChips } from './useGuideChips'
import { guideKey, useGuideStore } from './guideStore'
import { useNarrationStore } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const P = 'Una clavada sobre el caballo de f3 que no tiene otra defensa mejor que la captura.'
const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const games = recognizeGames(['La partida', '1. e4 e5 2. ♘f3 d6', P].join('\n'), { algorithm: 2 })
let root: HTMLElement

beforeEach(() => {
  useGuideStore.getState().clear()
  useNarrationStore.setState({ cues: [], narrated: null, status: 'idle' })
  useStudyBoardStore.getState().reset()
  dbActions.mockReset()
  dbActions.mockResolvedValue(undefined)
  root = document.createElement('div')
  root.innerHTML = `<p id="p">${P}</p><blockquote class="human-comment" data-no-recognition data-comment-fen="${FEN}"><p>Despejando la diagonal de nuestro alfil de casillas blancas.</p><footer>— A</footer></blockquote>`
  document.body.append(root)
})
const run = (enabled: boolean, extra: Partial<Parameters<typeof useGuideChips>[0]> = {}) =>
  renderHook((props: { enabled: boolean }) => useGuideChips({ rootRef: { current: root }, enabled: props.enabled, bookId: 1, chapter: 1, games, content: 'x', refresh: 0, ...extra }), { initialProps: { enabled } })

describe('the guides shown in the text only when asked (ai-narration-guides S1)', () => {
  it('shows nothing while the preference is off, even with guides stored', () => {
    useGuideStore.getState().set(guideKey(1, 1, P), { text: P, fen: FEN, actions: '0Square:e5' })
    run(false)
    expect(root.querySelectorAll('[data-guide-chips]')).toHaveLength(0)
  })

  it('shows the stored guide of a paragraph under it, and takes it away when switched off', () => {
    useGuideStore.getState().set(guideKey(1, 1, P), { text: P, fen: FEN, actions: '0Square:e5, 3Arrow:f1-b5' })
    const { rerender } = run(true)
    const line = root.querySelector('#p')!.nextElementSibling!
    expect(line.hasAttribute('data-guide-chips')).toBe(true)
    expect(line.textContent).toBe('0Square:e53Arrow:f1-b5')
    rerender({ enabled: false })
    expect(root.querySelectorAll('[data-guide-chips]')).toHaveLength(0)
  })

  it('shows the actions of a database comment under its quote', async () => {
    dbActions.mockResolvedValue('0Diagonal:c8-h3')
    run(true)
    await waitFor(() => expect(root.querySelector('blockquote')!.nextElementSibling?.textContent).toBe('0Diagonal:c8-h3'))
  })
})

describe('reviewing a guide in context (S2)', () => {
  it('previews the action on the board when the chip is hovered and wipes it afterwards', () => {
    useGuideStore.getState().set(guideKey(1, 1, P), { text: P, fen: games[0].tree.nodes.get(games[0].tree.mainline[3])!.fen, actions: '0Square:e5' })
    run(true)
    const chip = root.querySelector('.guide-chip')!
    act(() => { chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    expect(useNarrationStore.getState().cues[0]?.squares[0].square).toBe('e5')
    act(() => { chip.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(useNarrationStore.getState().cues).toEqual([])
  })

  it('keeps the preview when the chip is clicked, until it is clicked again', () => {
    useGuideStore.getState().set(guideKey(1, 1, P), { text: P, fen: FEN, actions: '0Square:e5' })
    run(true)
    const chip = root.querySelector('.guide-chip')!
    act(() => { chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); chip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    act(() => { chip.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(useNarrationStore.getState().cues).toHaveLength(1)
    expect(chip.classList.contains('guide-chip-pinned')).toBe(true)
    act(() => { chip.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useNarrationStore.getState().cues).toEqual([])
  })

  it('highlights the chip being performed while the narrator runs', () => {
    useGuideStore.getState().set(guideKey(1, 1, P), { text: P, fen: FEN, actions: '0Square:e5, 6Piece:f3' })
    run(true)
    act(() => useNarrationStore.setState({ narrated: { text: P, at: 7 } }))
    expect([...root.querySelectorAll('.guide-chip')].map((c) => c.classList.contains('guide-chip-active'))).toEqual([false, true])
    act(() => useNarrationStore.setState({ narrated: null }))
    expect(root.querySelectorAll('.guide-chip-active')).toHaveLength(0)
  })
})
