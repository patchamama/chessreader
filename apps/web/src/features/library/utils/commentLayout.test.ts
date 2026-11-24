import { describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { bracesToParagraphs, paragraphsToBraces } from './commentLayout'

const sans = (t: string) => { const [g] = recognizeGames(t, { algorithm: 2 }); return g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san) }

describe('comments in braces ⇄ comments as paragraphs (S19)', () => {
  const braces = '1. e4 e5 2. Nf3 { The knight attacks e5. } Nc6 3. Bb5 { The Spanish game. } a6 4. Ba4'

  it('braces become paragraphs after their move, with the move number to go on', () => {
    expect(bracesToParagraphs(braces)).toBe('1. e4 e5 2. Nf3\nThe knight attacks e5.\n2... Nc6 3. Bb5\nThe Spanish game.\n3... a6 4. Ba4')
    expect(sans(bracesToParagraphs(braces))).toEqual(sans(braces))
  })

  it('paragraphs between the moves go back into braces', () => {
    expect(paragraphsToBraces(bracesToParagraphs(braces))).toBe('1. e4 e5 2. Nf3 { The knight attacks e5. } 2... Nc6 3. Bb5 { The Spanish game. } 3... a6 4. Ba4')
    expect(sans(paragraphsToBraces(bracesToParagraphs(braces)))).toEqual(sans(braces))
  })

  it('with the lines of moves told, a book without dots and comments opening with a move go into braces (S10)', () => {
    const text = '1 d4 d5 2 c4 dxc4\nHablando en general, un gambito.\n3 Nf3 Nf6\n13 h4!? (Petrosian-Ignatiev, Moscú 1958).\n\uFFFC\n4 e3'
    const moveLines = new Set([0, 2, 5])
    expect(paragraphsToBraces(text, (i) => moveLines.has(i))).toBe(
      '1 d4 d5 2 c4 dxc4 { Hablando en general, un gambito. } 3 Nf3 Nf6 { 13 h4!? (Petrosian-Ignatiev, Moscú 1958). }\n\uFFFC\n4 e3',
    )
  })
})

describe('study PGN: comments of a variation stay inside it, one line (Chess Fundamentals)', () => {
  // Lichess study export: comments in braces, variations in parentheses, black moves without numbers.
  const A = '6. Rd6 (6. Rc6? { the Black King will go back to } 6... Rd8 { and it will take much longer to mate. }) 6... Rb8 { If now the King moves back to d8, Ra8 mates at once. } (6... Rd8 7. Ta8#) 7. Tc7 Ra8 8. Rc6 Rb8 9. Rb6 Ra8 10. Tc8# *'
  const B = '1. Re2 Rd5 2. Re3 { . As the Rook has not yet come into play, it is better to advance the King. If } 2... Re5 { the Rook drives it back by } (2... Re5 { the Rook drives it back by } 3. Th5+ { . On the other hand, if: }) (2... Rc4 { instead, then also } 3. Th5'

  it('a variation with its comments is one line: no braces, no breaks, no move number in front', () => {
    const out = bracesToParagraphs(A)
    expect(out).toContain('(6. Rc6? the Black King will go back to 6... Rd8 and it will take much longer to mate.)')
    expect(out).not.toMatch(/\d+\.\s*\(/)
    expect(out).not.toContain('{')
  })

  it('the main line goes on in a new line after ANY variation that closes (6... Rb8, 7. Tc7)', () => {
    expect(bracesToParagraphs(A)).toBe([
      '6. Rd6 (6. Rc6? the Black King will go back to 6... Rd8 and it will take much longer to mate.)',
      '6... Rb8',
      'If now the King moves back to d8, Ra8 mates at once.',
      '(6... Rd8 7. Ta8#)',
      '7. Tc7 Ra8 8. Rc6 Rb8 9. Rb6 Ra8 10. Tc8# *',
    ].join('\n'))
  })

  it('variations side by side stay together, and a black move after one also starts a line', () => {
    expect(bracesToParagraphs('1. e4 { Good. } (1. d4 d5) (1. c4 e5) 1... e5 2. Nf3')).toBe('1. e4\nGood.\n(1. d4 d5) (1. c4 e5)\n1... e5 2. Nf3')
    expect(bracesToParagraphs('1. e4 e5 (1... c5 { The Sicilian. } 2. Nf3) 2. Nf3 Nc6 { Fine. } 3. Bb5')).toBe('1. e4 e5 (1... c5 The Sicilian. 2. Nf3)\n2. Nf3 Nc6\nFine.\n3. Bb5')
  })

  it('a comment that opens with a comma or a period loses it; one inside a variation joins the move it follows', () => {
    expect(bracesToParagraphs(B)).toBe([
      '1. Re2 Rd5 2. Re3',
      'As the Rook has not yet come into play, it is better to advance the King. If',
      '2... Re5',
      'the Rook drives it back by',
      '(2... Re5 the Rook drives it back by 3. Th5+. On the other hand, if:) (2... Rc4 instead, then also 3. Th5',
    ].join('\n'))
    expect(bracesToParagraphs('1. Ta7 { , which immediately confines the King. } 1... Rg8')).toBe('1. Ta7\nwhich immediately confines the King.\n1... Rg8')
    expect(bracesToParagraphs('1. e4 { . } 1... e5')).toBe('1. e4\n1... e5')
  })

  it('every move of the game is still read, in the main line and in the variations', () => {
    const game = '1. e4 e5 2. Nf3 { The knight. } (2. Bc4 { The bishop. } 2... Nf6) 2... Nc6 3. Bb5 { The Spanish. } a6'
    const [g] = recognizeGames(bracesToParagraphs(game), { algorithm: 2 })
    const [h] = recognizeGames(game, { algorithm: 2 })
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(h.tree.mainline.map((id) => h.tree.nodes.get(id)!.san))
    expect(g.tree.nodes.size).toBe(h.tree.nodes.size)
    expect(g.tree.errors).toEqual([])
  })
})


describe('bracesToParagraphs — comments that close and open again', () => {
  it('joins "} {" and "}{" into one comment: "if:" and its continuation are one paragraph', () => {
    expect(bracesToParagraphs('3. Rh5+ { if: } { (3... Rg6 then it ends.) } *')).toBe('3. Rh5+\nif: 3... Rg6 then it ends.\n*')
    expect(bracesToParagraphs('3. Rh5+ { if: }{ (3... Rg6 then it ends.) } *')).toBe('3. Rh5+\nif: 3... Rg6 then it ends.\n*')
  })

  it('takes the parentheses off a comment that is a parenthesised remark, but not off a variation', () => {
    expect(bracesToParagraphs('3. Rh5+ { (3... Rg6 then it ends.) } 3... Kf8')).toBe('3. Rh5+\n3... Rg6 then it ends.\n3... Kf8')
    expect(bracesToParagraphs('3. Rh5+ (3. Rh4 Kf8) 3... Kf8 { A remark. }')).toContain('(3. Rh4 Kf8)')
  })

  it('does not invent a move number before the result: "{ … } *" ends the game', () => {
    expect(bracesToParagraphs('3. Rh5+ { .\nOn the other hand, if: } *')).toBe('3. Rh5+\nOn the other hand, if:\n*')
    expect(bracesToParagraphs('3. Rh5+ { Mate. } 1-0')).toBe('3. Rh5+\nMate.\n1-0')
    expect(bracesToParagraphs('3. Rh5+ { Draw. } 1/2-1/2')).toBe('3. Rh5+\nDraw.\n1/2-1/2')
    expect(bracesToParagraphs('3. Rh5+ { Time. } 0-1')).toBe('3. Rh5+\nTime.\n0-1')
  })

  it('still numbers a black move that continues the main line after a comment', () => {
    expect(bracesToParagraphs('1. e4 { King pawn. } e5')).toBe('1. e4\nKing pawn.\n1... e5')
  })
})
