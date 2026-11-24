import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PromptsModal } from './PromptsModal'
import { PROMPT_CATALOG } from './promptCatalog'

afterEach(() => vi.restoreAllMocks())

describe('PromptsModal', () => {
  it('lists every prompt with its system and user text', () => {
    render(<PromptsModal onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'All AI prompts' })).toBeTruthy()
    expect(screen.getAllByTestId('prompt-entry')).toHaveLength(PROMPT_CATALOG.length)
    expect(screen.getAllByText(/You translate chess commentary/).length).toBeGreaterThan(0)
  })

  it('filters by text', () => {
    render(<PromptsModal onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Filter prompts'), { target: { value: 'diagram' } })
    const shown = screen.getAllByTestId('prompt-entry')
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(PROMPT_CATALOG.length)
  })

  it('collapses a group', () => {
    render(<PromptsModal onClose={() => {}} />)
    const before = screen.getAllByTestId('prompt-entry').length
    fireEvent.click(screen.getAllByRole('button', { name: /^Group:/ })[0])
    expect(screen.getAllByTestId('prompt-entry').length).toBeLessThan(before)
  })

  it('copies a prompt', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PromptsModal onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy prompt' })[0])
    expect(writeText).toHaveBeenCalledOnce()
    expect(String(writeText.mock.calls[0][0])).toContain('SYSTEM')
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(<PromptsModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Settings entry point', () => {
  it('opens from the AI assistant section', async () => {
    const { LlmSettings } = await import('./LlmSettings')
    render(<LlmSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'View all AI prompts' }))
    expect(screen.getByRole('dialog', { name: 'All AI prompts' })).toBeTruthy()
  })
})
