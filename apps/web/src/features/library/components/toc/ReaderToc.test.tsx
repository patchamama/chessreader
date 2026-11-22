import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReaderToc } from './ReaderToc'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'

const renderToc = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReaderToc
        bookId={6}
        toc={[
          { order: 6, title: 'Capítulo uno — Wilhelm I' },
          { order: 7, title: 'Capítulo dos — Emanuel II' },
          { order: 10, title: 'Indice de partidas' },
        ]}
        currentChapter={7}
        currentGames={[]}
        algorithm={2}
        onChapter={() => {}}
        onGame={() => {}}
      />
    </QueryClientProvider>,
  )

describe('ReaderToc — chapter titles', () => {
  beforeEach(() => useSettingsStore.getState().reset())

  it('joins the lines of a chapter title with the default separator', () => {
    renderToc()
    expect(screen.getByRole('button', { name: 'Capítulo dos - Emanuel II' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Indice de partidas' })).toBeInTheDocument()
  })

  it('uses the separator chosen in the settings', () => {
    useSettingsStore.getState().set({ chapterTitleSeparator: ' · ' })
    renderToc()
    expect(screen.getByRole('button', { name: 'Capítulo uno · Wilhelm I' })).toBeInTheDocument()
  })
})

describe('ReaderToc — the current chapter stays visible', () => {
  beforeEach(() => useSettingsStore.getState().reset())

  it('scrolls the current chapter into view, and again when the chapter changes', () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.textContent ?? '') }
    try {
      const props = {
        bookId: 6,
        toc: [
          { order: 6, title: 'Chapter one' },
          { order: 7, title: 'Chapter two' },
        ],
        currentGames: [],
        algorithm: 2 as const,
        onChapter: () => {},
        onGame: () => {},
      }
      const ui = (current: number) => (
        <QueryClientProvider client={new QueryClient()}>
          <ReaderToc {...props} currentChapter={current} />
        </QueryClientProvider>
      )
      const { rerender } = render(ui(6))
      expect(scrolled).toContain('Chapter one')
      rerender(ui(7))
      expect(scrolled[scrolled.length - 1]).toBe('Chapter two')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
