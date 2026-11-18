import { describe, expect, it } from 'vitest'
import { INITIAL_FEN } from './inferDiagramFen'
import { collectDiagrams, diagramFenOf, imageFileName, regeneratedFileName, textFileName, uniqueNames } from './diagramFiles'

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const TEXT_FEN = '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1'

describe('imageFileName (S3)', () => {
  it('is the name of the image file the text references', () => {
    expect(imageFileName('/api/library/books/3/images/OEBPS/images/qed_5e.jpg', 0)).toBe('qed_5e.jpg')
    expect(imageFileName('/api/library/books/3/images/OEBPS%2Fimages%2Fqed%205e.jpg?v=2#x', 0)).toBe('qed 5e.jpg')
  })

  it('a drawing without a file (data URL) is numbered', () => {
    expect(imageFileName('data:image/svg+xml;charset=utf-8,%3Csvg', 4)).toBe('diagram-5.svg')
  })
})

describe('regeneratedFileName (S3)', () => {
  it('keeps the name and the extension when the format can be drawn', () => {
    expect(regeneratedFileName('qed_5e.jpg')).toEqual({ name: 'qed_5e.jpg', type: 'image/jpeg' })
    expect(regeneratedFileName('qed_5e.JPEG')).toEqual({ name: 'qed_5e.JPEG', type: 'image/jpeg' })
    expect(regeneratedFileName('a.png')).toEqual({ name: 'a.png', type: 'image/png' })
    expect(regeneratedFileName('a.webp')).toEqual({ name: 'a.webp', type: 'image/webp' })
    expect(regeneratedFileName('a.svg')).toEqual({ name: 'a.svg', type: 'image/svg+xml' })
  })

  it('a format that cannot be drawn becomes a PNG of the same name', () => {
    expect(regeneratedFileName('qed_5e.gif')).toEqual({ name: 'qed_5e.png', type: 'image/png' })
    expect(regeneratedFileName('noext')).toEqual({ name: 'noext.png', type: 'image/png' })
  })
})

describe('textFileName and uniqueNames (S3)', () => {
  it('the evaluation file is named after the image it follows', () => {
    expect(textFileName('qed_5e.jpg')).toBe('qed_5e.txt')
    expect(textFileName('noext')).toBe('noext.txt')
  })

  it('two diagrams with the same image name never overwrite each other', () => {
    expect(uniqueNames(['a.png', 'b.png', 'a.png', 'a.png'])).toEqual(['a.png', 'b.png', 'a-2.png', 'a-3.png'])
  })
})

describe('diagramFenOf (S8)', () => {
  const img = (attrs: Record<string, string>) => {
    const el = document.createElement('img')
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }

  it('a diagram written with its position (data-fen) is known', () => {
    expect(diagramFenOf(img({ 'data-fen': FEN }), INITIAL_FEN)).toEqual({ fen: FEN, known: true })
  })

  it('the FEN line the text prints next to the diagram is known', () => {
    expect(diagramFenOf(img({ 'data-text-fen': TEXT_FEN }), FEN)).toEqual({ fen: TEXT_FEN, known: true })
  })

  it('the position after the last recognised move before the image is known', () => {
    expect(diagramFenOf(img({}), FEN)).toEqual({ fen: FEN, known: true })
  })

  it('with no move before the image the position is not known', () => {
    expect(diagramFenOf(img({}), INITIAL_FEN)).toEqual({ fen: INITIAL_FEN, known: false })
  })
})

describe('collectDiagrams (S3)', () => {
  it('reads every diagram of the text, in order, with its image and position', () => {
    const root = document.createElement('div')
    root.innerHTML = `<p>x</p><span data-diagram-src="/i/qed_1.jpg" data-diagram-fen="${FEN}"></span><span data-diagram-src="/i/qed_2.png" data-diagram-fen="${TEXT_FEN}"></span>`
    expect(collectDiagrams(root)).toEqual([
      { src: '/i/qed_1.jpg', fen: FEN, fileName: 'qed_1.jpg' },
      { src: '/i/qed_2.png', fen: TEXT_FEN, fileName: 'qed_2.png' },
    ])
  })
})
