import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { applyErrataToHtml } from './errataApply'
import { htmlToProseText } from '../utils/proseText'
import { SAMPLE } from './errataFixture'
import type { ErrataEntry } from './errataFormat'

const HTML = '<p>Smith – Jones</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb4!? a6 (3... d6 is also played) 4. Ba4 Nf6 5. O-O Be7</p>'

describe('applyErrataToHtml', () => {
  it('writes the correction in the text, keeps the comments, and shows the printed move struck through', () => {
    const { html, applied } = applyErrataToHtml(HTML, [SAMPLE])
    expect(applied).toBe(1)
    expect(html).toContain('3. <span class="errata-corrected')
    expect(html).toMatch(/>Bb5<\/span><span class="errata-original[^"]*" data-no-recognition=""> \[<del[^>]*>Bb4!\?<\/del>\]<\/span> a6 \(3\.\.\. d6 is also played\)/)
  })

  it('the recogniser reads only the correction: the whole main line, with no repair left', () => {
    const { html } = applyErrataToHtml(HTML, [SAMPLE])
    const text = htmlToProseText(html)
    expect(text).toContain('3. Bb5 a6 (3... d6 is also played)')
    expect(text).not.toContain('Bb4')
    const [game] = recognizeGames(text, { algorithm: 2 })
    const main = game.tree.mainline.map((id) => game.tree.nodes.get(id)!)
    expect(main.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'])
    expect(main.some((n) => n.correctedFrom)).toBe(false)
  })

  it('marks the corrected move with the red wavy underline and says what the book printed', () => {
    const { html } = applyErrataToHtml(HTML, [SAMPLE])
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const span = doc.querySelector('.errata-corrected')!
    expect(span.className).toContain('decoration-wavy')
    expect(span.className).toContain('decoration-red-500')
    expect(span.getAttribute('data-errata-from')).toBe('Bb4!?')
    expect(span.getAttribute('title')).toContain('Bb4!?')
  })

  it('writes the correction in the notation of the book (Spanish letters)', () => {
    const es = '<p>1. e4 e5 2. Cf3 Cc6 3. Ab4 a6 4. Aa4 Cf6 5. 0-0 Ae7</p>'
    const entry: ErrataEntry = {
      ...SAMPLE,
      original: { moves: ['e4', 'e5', 'Cf3', 'Cc6', 'Ab4', 'a6', 'Aa4', 'Cf6', '0-0', 'Ae7'], text: '' },
      changes: [{ ply: 5, from: 'Ab4', to: 'Bb5', source: 'online' }],
    }
    const { html } = applyErrataToHtml(es, [entry])
    expect(htmlToProseText(html)).toContain('3. Ab5 a6')
    expect(html).toContain('<del class="line-through">Ab4</del>')
  })

  it('applying twice changes nothing more', () => {
    const once = applyErrataToHtml(HTML, [SAMPLE]).html
    const twice = applyErrataToHtml(once, [SAMPLE])
    expect(twice.applied).toBe(0)
    expect(twice.html).toBe(once)
  })

  it('finds the game by its moves when the game index moved', () => {
    const { applied } = applyErrataToHtml(HTML, [{ ...SAMPLE, gameIndex: 4 }])
    expect(applied).toBe(1)
  })

  it('leaves the chapter alone when the printed move is not where the entry says', () => {
    const entry = { ...SAMPLE, changes: [{ ply: 5, from: 'Bc4', to: 'Bb5', source: 'manual' as const }] }
    const { html, applied } = applyErrataToHtml(HTML, [entry])
    expect(applied).toBe(0)
    expect(html).toBe(HTML)
  })
})
