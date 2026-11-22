import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { htmlToProseText } from '../utils/proseText'
import { pgnToChapters } from '../../gamesearch/pgnChapters'
import { prepareChapterHtml } from '../utils/epubContent'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const llm = vi.hoisted(() => ({ available: true, complete: vi.fn() }))
vi.mock('../../../shared/llm/useLlm', () => ({ useLlm: () => ({ available: llm.available, vision: false, config: null, complete: llm.complete }) }))
const api = vi.hoisted(() => ({ saveBookGame: vi.fn(), loadCommentGame: vi.fn() }))
vi.mock('../../comments/commentsApi', () => ({ saveBookGame: api.saveBookGame, loadCommentGame: api.loadCommentGame }))

import { TranslateChapterButton } from './TranslateChapterButton'

const FEN = '7k/8/8/8/8/8/8/R6K w - - 0 1'
const pgn = `[Event "S"]\n[ChapterName "Ex.1"]\n[SetUp "1"]\n[FEN "${FEN}"]\n\n{ In this position the power of the Rook is demonstrated, } 1. Ra7 Kg8 { which confines the King to the last rank. } 2. Kg2 Kf8 3. Kf3 *`
const html = prepareChapterHtml(pgnToChapters(pgn, { fromPosition: true }).chapters[0].html, -1)
const text = htmlToProseText(html)
const games = recognizeGames(text, { algorithm: 2 })

const renderButton = (props: Partial<React.ComponentProps<typeof TranslateChapterButton>> = {}) => {
  const onApplied = vi.fn()
  render(<TranslateChapterButton games={games} text={text} bookTitle="Study" bookLanguage="en" chapter={1} canSave onApplied={onApplied} {...props} />)
  return { onApplied }
}

describe('TranslateChapterButton', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
    useSettingsStore.setState({ language: 'es' })
    llm.available = true
    llm.complete.mockReset()
    llm.complete.mockImplementation(async (req: { messages: { text: string }[] }) => ({
      text: JSON.stringify({ text: req.messages[0].text.includes('power') ? 'El poder de la torre,' : 'que confina al rey.' }), model: 'm',
    }))
    api.saveBookGame.mockReset()
    api.saveBookGame.mockResolvedValue({ gameId: 'b1', sourceId: 1, added: 2, translated: 2 })
  })

  it('is offered when the text is in another language than the interface', () => {
    renderButton()
    expect(screen.getByRole('button', { name: /Translate the comments to Spanish with AI/i })).toBeInTheDocument()
  })

  it('is not offered with the same language, without AI, or when the language is unknown', () => {
    const { unmount } = render(<TranslateChapterButton games={games} text={text} bookTitle="S" bookLanguage="es" chapter={1} canSave onApplied={() => {}} />)
    expect(screen.queryByRole('button', { name: /Translate/i })).toBeNull()
    unmount()
    llm.available = false
    renderButton()
    expect(screen.queryByRole('button', { name: /Translate/i })).toBeNull()
  })

  it('translates each comment, shows the games translated and saves the game with both languages', async () => {
    const { onApplied } = renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Translate the comments/i }))
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    const [index, rewrite] = onApplied.mock.calls[0]
    expect(index).toBe(0)
    expect(rewrite.text).toContain('El poder de la torre,')
    expect(llm.complete).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(api.saveBookGame).toHaveBeenCalledTimes(1))
    const sent = api.saveBookGame.mock.calls[0][0]
    expect(sent.book).toEqual({ title: 'Study', author: null, lang: 'en' })
    expect(sent.game.comments.map((c: { text: string }) => c.text)).toEqual(['In this position the power of the Rook is demonstrated,', 'which confines the King to the last rank.'])
    // the remark before the first move is kept too, told by san "@intro" and ply 0
    expect(sent.game.comments[0]).toMatchObject({ ply: 0, move: 0, san: '@intro' })
    expect(sent.game.translations.es.comments).toEqual(['El poder de la torre,', 'que confina al rey.'])
    expect(sent.game.translations.es.pgn).toContain('{ El poder de la torre, }')
    expect(sent.game.pgn).toContain('{ In this position')
  })

  it('does not save to the database when the user cannot (the translation still shows)', async () => {
    const { onApplied } = renderButton({ canSave: false })
    fireEvent.click(screen.getByRole('button', { name: /Translate the comments/i }))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(api.saveBookGame).not.toHaveBeenCalled()
  })
})

describe('a game kept translated in the database shows translated by itself', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
    useSettingsStore.setState({ language: 'es' })
    llm.available = false
    api.loadCommentGame.mockReset()
  })

  it('asks the database for the game by its id and puts the stored translation in place, with no AI and no click', async () => {
    api.loadCommentGame.mockResolvedValue({ id: 'x', white: null, black: null, pgn: '', translations: { es: `[SetUp "1"]\n[FEN "${FEN}"]\n\n{ El poder de la torre, } 1. Ra7 Kg8 { que confina al rey. } 2. Kg2 Kf8 3. Kf3 *` } })
    const onApplied = vi.fn()
    render(<TranslateChapterButton games={games} text={text} bookTitle="Study" bookLanguage="en" chapter={1} canSave={false} serverSession isRewritten={() => false} onApplied={onApplied} />)
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    expect(api.loadCommentGame.mock.calls[0][0]).toMatch(/^b[0-9a-f]{12}$/)
    expect(onApplied.mock.calls[0][1]).toEqual({ text: 'El poder de la torre,\n1. Ra7 Kg8\nque confina al rey.\n2. Kg2 Kf8 3. Kf3 *', leading: 1 })
  })

  it('leaves a game alone that the reader already shows rewritten, and a game the database does not know', async () => {
    api.loadCommentGame.mockRejectedValue(new Error('404'))
    const onApplied = vi.fn()
    render(<TranslateChapterButton games={games} text={text} bookTitle="Study" bookLanguage="en" chapter={1} canSave={false} serverSession isRewritten={() => false} onApplied={onApplied} />)
    await waitFor(() => expect(api.loadCommentGame).toHaveBeenCalled())
    expect(onApplied).not.toHaveBeenCalled()
    api.loadCommentGame.mockClear()
    render(<TranslateChapterButton games={games} text={text} bookTitle="Study" bookLanguage="en" chapter={1} canSave={false} serverSession isRewritten={() => true} onApplied={onApplied} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(api.loadCommentGame).not.toHaveBeenCalled()
  })
})
