import { describe, expect, it } from 'vitest'
import { guideParagraphs, guideQuotes } from './guideTargets'

const FEN = '8/8/8/8/8/8/8/K6k w - - 0 1'

describe('what a guide can belong to in the reading pane', () => {
  it('finds prose paragraphs apart from the quotes of the database, the chip lines and the short ones', () => {
    const root = document.createElement('div')
    root.innerHTML = `<p>Una clavada sobre el caballo de f3.</p><p>Corta.</p>
      <blockquote class="human-comment" data-comment-fen="${FEN}"><p>Un comentario del libro sobre la posición.</p><footer>— A</footer></blockquote>
      <div data-guide-chips data-no-recognition><p>1 2 3 4 5</p></div>`
    expect(guideParagraphs(root).map((p) => p.text)).toEqual(['Una clavada sobre el caballo de f3.'])
    const [quote] = guideQuotes(root)
    expect(quote.text).toBe('Un comentario del libro sobre la posición.')
    expect(quote.fen).toBe(FEN)
    expect(quote.textElement.tagName).toBe('P')
  })
})
