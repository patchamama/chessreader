import { describe, it, expect } from 'vitest'
import { textToChapters } from './textToChapters'
import { boardSvg } from './boardSvg'
import { extractProseText } from './proseText'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const FEN = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'

describe('diagram marks in a commented game (S18)', () => {
  it('become a drawn board with the evaluation under it', () => {
    const { chapters } = textToChapters(`Title\n1. e4 e5\n[Diagram fen="${FEN}" eval="White mates in 1"]\n2. Nf3`)
    const html = chapters[0].html
    expect(html).toMatch(/<img [^>]*src="data:image\/svg\+xml[^"]*"[^>]*data-fen="r1bqkb1r\/pppp1Qpp/)
    expect(html).toContain('<p class="diagram-eval">White mates in 1</p>')
    expect(html).toContain('<p>2. Nf3</p>')
    expect(html).not.toContain('[Diagram')
  })

  it('without an evaluation there is no caption', () => {
    const { chapters } = textToChapters(`T\n1. e4\n[Diagram fen="${FEN}"]`)
    expect(chapters[0].html).not.toContain('diagram-eval')
  })

  it('the board drawing has 64 squares and the pieces of the position, drawn with real piece figures (S9)', () => {
    const svg = boardSvg(FEN)
    expect((svg.match(/<rect /g) ?? []).length).toBe(64)
    expect((svg.match(/data-piece="/g) ?? []).length).toBe(31) // 32 pieces minus the pawn taken on f7
    expect(svg).not.toContain('♔')
  })

  it('uses the colours of the board theme and the piece set of the settings, like the thumbnails (S9)', () => {
    useSettingsStore.setState({ boardTheme: 'green', pieceTheme: 'cardinal' })
    const svg = boardSvg(FEN)
    expect(svg).toContain('fill="#ffffdd"')
    expect(svg).toContain('fill="#86a666"')
    expect(svg).toContain('viewBox="0 0 50 50"') // the cardinal set's drawing
    useSettingsStore.getState().reset()
  })

  it('names the engine, its next moves and an alternative under the diagram; those moves are not read as game moves (S9)', () => {
    const { chapters } = textToChapters(`T\n1. e4 e5\n[Diagram fen="${FEN}" eval="White mates in 1 · Stockfish 18, depth 14" line="5. Qxf7#" alt="5. Bxf7+ Kxf7 (+0.4)"]`)
    const html = chapters[0].html
    expect(html).toContain('<p class="diagram-eval">White mates in 1 · Stockfish 18, depth 14</p>')
    expect(html).toContain('<p class="diagram-line" data-no-recognition>5. Qxf7#</p>')
    expect(html).toContain('<p class="diagram-line diagram-alt" data-no-recognition>5. Bxf7+ Kxf7 (+0.4)</p>')
    const div = document.createElement('div')
    div.innerHTML = html
    expect(extractProseText(div).text).not.toContain('Qxf7#')
  })
})
