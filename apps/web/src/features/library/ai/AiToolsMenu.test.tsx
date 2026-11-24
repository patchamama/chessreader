import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const llm = vi.hoisted(() => ({ available: true, complete: vi.fn(async () => ({ text: '{}', model: 'm' })) }))
vi.mock('../../../shared/llm', () => ({ useLlm: () => llm }))
const generate = vi.hoisted(() => vi.fn())
vi.mock('../narration/guideGeneration', () => ({ generateGuidesForChapter: generate }))

import { AiToolsMenu } from './AiToolsMenu'
import { EXTRA_AI_TOOLS, type AiToolEntry } from './aiTools'

const base = { games: [], text: '', bookId: 1, chapter: 2, isAdmin: false, getQuotes: () => [{ text: 'q', fen: 'f' }] }
const result = { total: 5, generated: 3, empty: 1, failed: 1, skipped: 0, cancelled: false, savedToDatabase: 0 }

beforeEach(() => {
  llm.available = true
  generate.mockReset()
  generate.mockResolvedValue(result)
})

describe('the AI menu of the reader (ai-narration-guides S3)', () => {
  it('is offered only when an AI model is set up', () => {
    llm.available = false
    const { container } = render(<AiToolsMenu {...base} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the guide entries and runs the generation of the chapter, then says how it went', async () => {
    const onDone = vi.fn()
    render(<AiToolsMenu {...base} isAdmin onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI tools' }))
    expect(screen.getByRole('menuitem', { name: /Regenerate all guides/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Generate narration guides for this chapter/ }))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    expect(generate.mock.calls[0][0]).toMatchObject({ bookId: 1, chapter: 2, isAdmin: true, redo: false, quotes: [{ text: 'q', fen: 'f' }], complete: llm.complete })
    expect(await screen.findByRole('status')).toHaveTextContent('3 guides made, 1 without a valid action, 1 failed')
    expect(onDone).toHaveBeenCalled()
  })

  it('regenerates all of them on request', async () => {
    render(<AiToolsMenu {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Regenerate all guides/ }))
    await waitFor(() => expect(generate).toHaveBeenCalled())
    expect(generate.mock.calls[0][0].redo).toBe(true)
  })

  it('has a slot for the entries other tools add (the key moments commentary)', () => {
    expect(Array.isArray(EXTRA_AI_TOOLS)).toBe(true)
    const run = vi.fn()
    const extra: AiToolEntry = { id: 'moments', label: 'Comment key moments with AI', run }
    render(<AiToolsMenu {...base} extraEntries={[extra]} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comment key moments with AI' }))
    expect(run).toHaveBeenCalled()
  })
})
