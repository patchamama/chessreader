import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../utils/diagramFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/diagramFiles')>()
  return {
    ...actual,
    renderDiagramBlob: vi.fn(async (_fen: string, type: string) => new Blob(['x'], { type })),
    downloadFiles: vi.fn(async () => undefined),
  }
})

import { DiagramToolsPanel } from '../DiagramToolsPanel'
import { downloadFiles, renderDiagramBlob } from '../../utils/diagramFiles'
import { setReviewEngine } from '../../review/reviewStore'
import { useDiagramEvalStore } from '../../diagramEval/diagramEvalStore'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'
import { useBusyStore } from '../../../../shared/layout/busyStore'
import { useAuthStore } from '../../../auth/store/authStore'

const FEN1 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const FEN2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const mockDownload = vi.mocked(downloadFiles)
const mockRender = vi.mocked(renderDiagramBlob)

const readText = (blob: Blob) => new Promise<string>((resolve) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.readAsText(blob)
})

function textHost() {
  const host = document.createElement('div')
  host.innerHTML = `
    <span data-diagram-src="/api/library/books/1/images/OEBPS/qed_5e.jpg" data-diagram-fen="${FEN1}"></span>
    <span data-diagram-src="/api/library/books/1/images/OEBPS/qed_6.gif" data-diagram-fen="${FEN2}"></span>`
  document.body.appendChild(host)
  return host
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.getState().reset()
  useSettingsStore.setState({ language: 'en' })
  useDiagramEvalStore.setState({ byFen: {} })
  useAuthStore.setState({ token: null })
})
afterEach(() => {
  document.body.innerHTML = ''
  setReviewEngine(null)
})

describe('DiagramToolsPanel (S3)', () => {
  it('regenerates every diagram of the text and downloads it under the name of its image file', async () => {
    const host = textHost()
    render(<DiagramToolsPanel root={host} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate all diagrams and download' }))
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1))
    expect(mockRender.mock.calls.map((c) => [c[0], c[1]])).toEqual([[FEN1, 'image/jpeg'], [FEN2, 'image/png']])
    expect(mockDownload.mock.calls[0][0].map((f) => f.name)).toEqual(['qed_5e.jpg', 'qed_6.png'])
    expect(await screen.findByRole('status')).toHaveTextContent('2 diagrams downloaded')
  })

  it('evaluates every diagram with the Settings engine and downloads one text file per diagram', async () => {
    useAuthStore.setState({ token: 'jwt' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setReviewEngine(async () => [{ idx: 1, depth: 12, scoreCp: 44, pv: ['d2d4', 'e5d4'] }])
    const host = textHost()
    render(<DiagramToolsPanel root={host} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate evaluations and download' }))
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1))
    const files = mockDownload.mock.calls[0][0]
    expect(files.map((f) => f.name)).toEqual(['qed_5e.txt', 'qed_6.txt'])
    expect(await readText(files[0].blob)).toContain('3. d4 exd4')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useDiagramEvalStore.getState().get(FEN1)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows the busy spinner with its progress while it works', async () => {
    const host = textHost()
    const labels: string[] = []
    const progress: number[] = []
    const unsub = useBusyStore.subscribe((s) => s.tasks.forEach((t) => {
      labels.push(t.label)
      if (t.progress !== undefined) progress.push(t.progress)
    }))
    render(<DiagramToolsPanel root={host} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate all diagrams and download' }))
    await waitFor(() => expect(mockDownload).toHaveBeenCalled())
    unsub()
    expect(labels).toContain('Regenerating diagrams 1/2')
    expect(labels).toContain('Regenerating diagrams 2/2')
    // The footer bar moves with every diagram done (S5).
    expect(progress).toContain(0.5)
    expect(progress).toContain(1)
    expect(useBusyStore.getState().tasks).toEqual([])
  })

  it('with no diagram in the text, says so and downloads nothing', async () => {
    render(<DiagramToolsPanel root={document.createElement('div')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate all diagrams and download' }))
    expect(await screen.findByRole('status')).toHaveTextContent('No diagrams in this text')
    expect(mockDownload).not.toHaveBeenCalled()
  })
})
