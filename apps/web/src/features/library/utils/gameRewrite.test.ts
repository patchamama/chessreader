import { describe, it, expect, vi, afterEach } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { applyGameRewrites, gameLineRange, pickBookComments } from './gameRewrite'
import { htmlToProseText } from './proseText'

const HTML = [
  '<p>Intro of the chapter.</p>',
  '<p class="txt">Game 1</p>',
  '<p class="txt">Anderssen – Kieseritzky</p>',
  '<p class="txt">1. e4 e5 2. Qh5</p>',
  '<p class="txt">A wild queen sortie.</p>',
  '<p class="txt"><img src="x.png" alt="diagram"/></p>',
  '<p class="txt">(2... g6 3. Qf3)</p>',
  '<p class="txt">2... Nc6 3. Bc4 Nf6 4. Qxf7#</p>',
  '<p class="txt">A famous finish.</p>',
  '<p class="txt">Game 2</p>',
  '<p class="txt">1. d4 d5 2. c4 e6</p>',
].join('\n')

const games = () => recognizeGames(htmlToProseText(HTML), { algorithm: 2 })

describe('gameLineRange', () => {
  it('spans from the line of the first move to the end of the line of the last move', () => {
    const text = htmlToProseText(HTML)
    const g = games()[0]
    const { start, end } = gameLineRange(text, g)
    expect(text.slice(start, end)).toMatch(/^1\. e4 e5 2\. Qh5\nA wild queen sortie\.\n[^]*\(2\.\.\. g6 3\. Qf3\)\n2\.\.\. Nc6 3\. Bc4 Nf6 4\. Qxf7#$/)
  })
})

describe('applyGameRewrites (S3)', () => {
  it('replaces one game from its first move to its last (comments, variations, images) with the new commentary, in place', () => {
    const out = applyGameRewrites(HTML, games(), { 0: '1. e4 e5\nA new remark.\n2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#' })
    const doc = new DOMParser().parseFromString(out, 'text/html')
    const texts = [...doc.body.querySelectorAll('p')].map((p) => p.textContent)
    expect(texts).toEqual([
      'Intro of the chapter.', 'Game 1', 'Anderssen – Kieseritzky',
      '1. e4 e5', 'A new remark.', '2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
      'A famous finish.', 'Game 2', '1. d4 d5 2. c4 e6',
    ])
    expect(doc.body.querySelector('img')).toBeNull()
    // The book's own paragraph class is kept on the new paragraphs.
    expect(doc.body.querySelector('p:nth-of-type(4)')!.getAttribute('class')).toBe('txt')
    // The other game is untouched and still read.
    const reread = recognizeGames(htmlToProseText(out), { algorithm: 2 })
    expect(reread).toHaveLength(2)
    expect(reread[0].tree.mainline).toHaveLength(7)
  })

  it('renders book comments of the new commentary as quotes', () => {
    const out = applyGameRewrites(HTML, games(), { 1: '1. d4 d5\n[Comment source="Book" text="Solid."]\n2. c4 e6' })
    const quote = new DOMParser().parseFromString(out, 'text/html').querySelector('blockquote.human-comment[data-no-recognition]')!
    expect(quote.querySelector('p')!.textContent).toBe('Solid.')
    expect(out).toContain('A wild queen sortie.')
  })

  it('leaves the HTML unchanged without rewrites or for an unknown game', () => {
    expect(applyGameRewrites(HTML, games(), {})).toBe(HTML)
    expect(applyGameRewrites(HTML, games(), { 9: '1. e4' })).toBe(HTML)
  })
})

describe('pickBookComments (S4)', () => {
  afterEach(() => vi.restoreAllMocks())
  const alts = [{ text: 'First.', source: 'A' }, { text: 'Second.', source: 'B', gameId: 'g', ply: 2 }]
  const quote = `<blockquote class="human-comment" data-no-recognition data-comment-alternatives='${JSON.stringify(alts)}'><p>First.</p><footer>— A</footer></blockquote>`

  it('keeps the generator\'s choice until the comments are shown again', () => {
    expect(pickBookComments(`<p>x</p>${quote}`, 0)).toBe(`<p>x</p>${quote}`)
  })

  it('picks one of the remarks at random when shown again', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const out = pickBookComments(`<p>x</p>${quote}`, 1)
    const q = new DOMParser().parseFromString(out, 'text/html').querySelector('blockquote.human-comment')!
    expect(q.querySelector('p')!.textContent).toBe('Second.')
    expect(q.querySelector('footer')!.textContent).toContain('— B')
    expect(q.querySelector('a.comment-source')!.getAttribute('data-comment-game')).toBe('g')
    expect(q.getAttribute('data-comment-alternatives')).not.toBeNull()
  })
})
