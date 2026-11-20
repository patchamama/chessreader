import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CommentEntry } from '../comments/commentsApi'

const llm = vi.hoisted(() => ({ available: true, vision: false, config: null as unknown, complete: vi.fn() }))
vi.mock('../../shared/llm', () => ({ useLlm: () => llm }))
const save = vi.hoisted(() => vi.fn())
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: save }))
const del = vi.hoisted(() => vi.fn())
vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<typeof import('../comments/commentsApi')>()), hideComment: del }))

import CommentDetailsModal from './CommentDetailsModal'

const FEN = 'r1bqkb1r/pppp1ppp/1n6/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1'
const c: CommentEntry = {
  id: 7, hash: '0123456789abcdef', fen: FEN, text: 'White keeps c4 after Nb6.', lang: 'en', ply: 24, move: 12, san: 'Nb6', gameId: '1-4', chapter: 3,
  source: { id: 1, title: 'Invented Book', author: 'A. Writer', kind: 'book', lang: 'en', book: 'invented-book' },
  game: { white: 'White Player', black: 'Black Player', label: null }, translations: { es: 'Las blancas mantienen c4.' },
}

const onClose = vi.fn()
const open = (entry = c) => render(<CommentDetailsModal comment={entry} onClose={onClose} />)
const dialog = () => screen.getByRole('dialog', { name: 'Comment 7 details' })

beforeEach(() => {
  cleanup()
  llm.available = true
  llm.complete.mockReset()
  save.mockReset()
  save.mockResolvedValue({ saved: true, where: 'server', path: 'p' })
  onClose.mockReset()
})

describe('Comment details modal (S3)', () => {
  it('shows every field and the diagram', () => {
    open()
    const d = within(dialog())
    expect(d.getByText('0123456789abcdef')).toBeTruthy()
    expect(d.getByText(FEN)).toBeTruthy()
    expect(d.getByText(/Invented Book/)).toBeTruthy()
    expect(d.getByText(/A\. Writer/)).toBeTruthy()
    expect(d.getByText(/White Player – Black Player/)).toBeTruthy()
    expect(d.getByText(/Chapter 3/)).toBeTruthy()
    expect(d.getByText(/12\.\.\.Nb6/)).toBeTruthy()
    expect(d.getByText('White keeps c4 after Nb6.')).toBeTruthy()
    expect((d.getByRole('textbox', { name: 'Spanish' }) as HTMLTextAreaElement).value).toBe('Las blancas mantienen c4.')
    expect((d.getByRole('textbox', { name: 'German' }) as HTMLTextAreaElement).value).toBe('')
    expect((d.getByRole('textbox', { name: 'Universal text' }) as HTMLTextAreaElement).value).toBe('')
    expect(d.getByRole('img', { name: 'Position after 12...Nb6' }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('types a missing field by hand and saves one suggestion per changed field', async () => {
    open()
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'German' }), { target: { value: 'Weiß behält c4.' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).toMatchObject({ kind: 'translation', author: 'user', after: { lang: 'de', text: 'Weiß behält c4.' } })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('generates a missing field with the AI and saves it as an AI suggestion', async () => {
    llm.complete.mockResolvedValue({ text: '{"text":"Weiß behält c4 nach Nb6."}', model: 'm' })
    open()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate German with AI' }))
    await waitFor(() => expect((within(dialog()).getByRole('textbox', { name: 'German' }) as HTMLTextAreaElement).value).toBe('Weiß behält c4 nach Nb6.'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).toMatchObject({ author: 'ai', model: 'm', after: { lang: 'de' } })
  })

  it('generates the universal text with the AI', async () => {
    llm.complete.mockResolvedValue({ text: '{"text":"White keeps c4 after Nb6, universal."}', model: 'm' })
    open()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate universal text with AI' }))
    await waitFor(() => expect((within(dialog()).getByRole('textbox', { name: 'Universal text' }) as HTMLTextAreaElement).value).toContain('universal'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save.mock.calls[0][0]).toMatchObject({ kind: 'comment', after: { action: 'universal', lang: 'en' } }))
  })

  it('has no AI buttons without a model', () => {
    llm.available = false
    open()
    expect(screen.queryByRole('button', { name: /with AI/ })).toBeNull()
  })

  it('shows a generation error and a Save that stores nothing when nothing changed', async () => {
    llm.complete.mockRejectedValue(new Error('model down'))
    open()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate German with AI' }))
    expect((await screen.findByRole('alert')).textContent).toContain('model down')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(save).not.toHaveBeenCalled()
  })

  it('Cancel and Escape close without saving', () => {
    open()
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'German' }), { target: { value: 'x' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('Hiding from the details modal (S17)', () => {
  it('asks to confirm, hides, tells the caller and closes', async () => {
    del.mockReset()
    del.mockResolvedValue(undefined)
    const onHidden = vi.fn()
    render(<CommentDetailsModal comment={c} onClose={onClose} onHidden={onHidden} />)
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hide' }))
    expect(del).not.toHaveBeenCalled()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Yes, hide' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith(7))
    await waitFor(() => expect(onHidden).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })
})
