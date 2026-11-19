import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { markCommentMoves } from './commentLines'

// Saint-Amant – Staunton, 1843: the main line a book comment speaks about.
const MAIN = ['d4', 'e6', 'c4', 'd5', 'e3', 'c5', 'Nc3', 'Nf6', 'Nf3', 'Nc6']

/** Position before each main-line move, keyed like the reader's Book: "5b" → before Black's 5th move. */
function mainLine(sans: string[]): Map<string, string> {
  const chess = new Chess()
  const before = new Map<string, string>()
  for (const san of sans) {
    before.set(`${chess.moveNumber()}${chess.turn()}`, chess.fen())
    chess.move(san)
  }
  return before
}
const BEFORE = mainLine(MAIN)
const AFTER = (() => { const c = new Chess(); MAIN.forEach((s) => c.move(s)); return c.fen() })()
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const lineOf = (html: string) => {
  const m = /data-line-start="([^"]*)" data-line-moves="([^"]*)"/.exec(html)
  return m ? { start: m[1], moves: m[2] } : null
}

describe('markCommentMoves: the moves a book comment quotes (S7)', () => {
  it('marks "5…Nc6" (English letters, unicode ellipsis) from the main line before Black\'s 5th move', () => {
    const text = 'Por extraño que parezca, ¡es la Defensa Tarrasch!, que ya se había planteado en la 7ª y 17ª partidas. Staunton elude la Variante Simétrica, con 5…Nc6.'
    const html = markCommentMoves(text, AFTER, BEFORE)
    expect(html).toContain(`<span class="chess-line" data-line-start="${attr(BEFORE.get('5b')!)}" data-line-moves="Nc6">5…<span class="line-move" data-ply="1">Nc6</span></span>`)
    expect(html.startsWith('Por extraño que parezca, ¡es la Defensa Tarrasch!, que ya se había planteado en la 7ª y 17ª partidas.')).toBe(true)
    expect(html.endsWith('</span></span>.')).toBe(true)
  })

  it('reads "5...Nc6" with three dots the same way', () => {
    expect(lineOf(markCommentMoves('Staunton plays 5...Nc6 here.', AFTER, BEFORE))).toEqual({ start: BEFORE.get('5b'), moves: 'Nc6' })
  })

  it.each([
    ['Spanish', 'Era mejor 6.Ad3 dxc4 7.Axc4.'],
    ['German', 'Besser war 6.Ld3 dxc4 7.Lxc4.'],
    ['French', 'Il fallait jouer 6.Fd3 dxc4 7.Fxc4.'],
    ['figurine', 'Mejor era 6.♗d3 dxc4 7.♗xc4.'],
    ['English', 'Better was 6.Bd3 dxc4 7.Bxc4.'],
  ])('reads %s piece letters and keeps the book\'s own letters visible', (_lang, text) => {
    const html = markCommentMoves(text, AFTER, BEFORE)
    expect(lineOf(html)).toEqual({ start: attr(BEFORE.get('6w') ?? AFTER), moves: 'Bd3 dxc4 Bxc4' })
    const shown = [...html.matchAll(/<span class="line-move" data-ply="\d">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(shown.join(' ')).toBe(text.match(/6\.(\S+) (\S+) 7\.(\S+)\./)!.slice(1).join(' '))
  })

  it('picks the language whose moves are legal: Spanish C is a knight, A a bishop', () => {
    const html = markCommentMoves('Con 4.Cc3 Cf6 5.Cf3 las blancas se desarrollan.', AFTER, BEFORE)
    expect(lineOf(html)).toEqual({ start: attr(BEFORE.get('4w')!), moves: 'Nc3 Nf6 Nf3' })
  })

  it('without the main line, plays from the commented position', () => {
    expect(lineOf(markCommentMoves('Better is 6. Bd3 here.', AFTER))).toEqual({ start: attr(AFTER), moves: 'Bd3' })
  })

  it('leaves moves that cannot be played, ordinals and bare squares as text', () => {
    const text = 'Staunton elude la Variante Simétrica, con 5…Nc6. La casilla d5 en la 7ª partida.'
    expect(markCommentMoves(text, AFTER)).toBe(text)
  })

  it('escapes the text around the lines', () => {
    expect(markCommentMoves('a <b> & 6.Bd3', AFTER, BEFORE)).toMatch(/^a &lt;b&gt; &amp; <span class="chess-line"/)
  })
})
