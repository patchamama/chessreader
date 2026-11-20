import { describe, expect, it } from 'vitest'
import { gameCommentsOf, moveKeys, parseAiComments, parseAiText, replaceGameComments, translateGamePrompt, translatePrompt, universalPrompt, validateRewrite } from './commentPrompts'

const comment = { text: 'After 12...Nb6 Smith keeps the c4 square, as in his game against Jones; 13. Bxe6 fails to Qh4+.', lang: 'en', fen: 'r1bqkb1r/pppp1ppp/1n6/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', move: '12...Nb6' }

describe('comment prompts (S3)', () => {
  it('universal: a fixed system prompt asking for JSON {text} with the position and the comment', () => {
    const r = universalPrompt(comment)
    expect(r.json).toBe(true)
    expect(r.system).toMatch(/any game that reaches this position/i)
    expect(r.system).toMatch(/no player names/i)
    expect(r.system).toMatch(/\{"text"/)
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0].text).toContain(comment.fen)
    expect(r.messages[0].text).toContain(comment.text)
    expect(r.messages[0].text).toContain('12...Nb6')
    expect(universalPrompt(comment)).toEqual(r)
  })

  it('translate: names the target language and its piece letters', () => {
    const r = translatePrompt(comment, 'es')
    expect(r.json).toBe(true)
    expect(r.system).toMatch(/Spanish/)
    expect(r.system).toMatch(/R \(rey\), D \(dama\), T \(torre\), A \(alfil\), C \(caballo\)/)
    expect(translatePrompt(comment, 'de').system).toMatch(/K \(König\), D \(Dame\), T \(Turm\), L \(Läufer\), S \(Springer\)/)
    expect(translatePrompt(comment, 'fr').system).toMatch(/French/)
    expect(translatePrompt(comment, 'en').system).toMatch(/K, Q, R, B, N/)
  })

  it('parses the JSON answer, also inside a code fence', () => {
    expect(parseAiText('{"text":"A clean remark."}')).toBe('A clean remark.')
    expect(parseAiText('```json\n{"text": "Fenced."}\n```')).toBe('Fenced.')
    expect(() => parseAiText('no json')).toThrow(/JSON/)
    expect(() => parseAiText('{"text":"  "}')).toThrow(/empty/)
  })

  it('moveKeys reads moves in any notation: letters, figurines, castling', () => {
    expect(moveKeys('12...Nb6 13. Bxe6 Qh4+ O-O e4')).toEqual(['Pb6', 'Pxe6', 'Ph4', 'O-O', 'pe4'])
    expect(moveKeys('12...Cb6 13. Axe6 Dh4+ 0-0 e4')).toEqual(['Pb6', 'Pxe6', 'Ph4', 'O-O', 'pe4'])
    expect(moveKeys('12...♘b6 13.♗xe6 ♕h4+')).toEqual(['Pb6', 'Pxe6', 'Ph4'])
    expect(moveKeys('dxe5 fxg8=Q O-O-O')).toEqual(['pxe5', 'pxg8=', 'O-O-O'])
  })

  it('validates a rewrite: not empty, at most 3× the original, every move kept', () => {
    expect(validateRewrite(comment.text, 'After 12...Nb6 White keeps c4; 13. Bxe6 fails to Qh4+.')).toEqual([])
    expect(validateRewrite(comment.text, 'Tras 12...Cb6 se mantiene c4; 13. Axe6 falla por Dh4+.')).toEqual([])
    expect(validateRewrite(comment.text, '')).toContain('the proposal is empty')
    expect(validateRewrite('Short.', 'x'.repeat(19))).toContain('the proposal is more than 3 times longer than the original')
    expect(validateRewrite(comment.text, 'After 12...Nb6 White keeps c4.')).toEqual(['moves missing from the proposal: Bxe6, Qh4+'])
  })
})

describe('translating a game (S3)', () => {
  const pgn = '[White "A"]\n\n1. e4 {A sharp start.} e5 2. Nf3 {The knight hits e5.} Nc6 *'

  it('reads the {comments} of a PGN and puts translated ones back, moves untouched', () => {
    expect(gameCommentsOf(pgn)).toEqual(['A sharp start.', 'The knight hits e5.'])
    expect(replaceGameComments(pgn, ['Un comienzo agudo.', 'El caballo ataca e5.'])).toBe('[White "A"]\n\n1. e4 {Un comienzo agudo.} e5 2. Nf3 {El caballo ataca e5.} Nc6 *')
    expect(() => replaceGameComments(pgn, ['one'])).toThrow(/2 comments/)
  })

  it('asks for JSON {comments: [...]} in the same order and parses it', () => {
    const r = translateGamePrompt(gameCommentsOf(pgn), 'es')
    expect(r.json).toBe(true)
    expect(r.system).toMatch(/\{"comments"/)
    expect(JSON.parse(r.messages[0].text.slice(r.messages[0].text.indexOf('{')))).toEqual({ comments: ['A sharp start.', 'The knight hits e5.'] })
    expect(parseAiComments('{"comments":["a","b"]}', 2)).toEqual(['a', 'b'])
    expect(() => parseAiComments('{"comments":["a"]}', 2)).toThrow(/2 comments/)
  })
})
