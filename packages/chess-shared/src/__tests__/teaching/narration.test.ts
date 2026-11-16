import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { sanToSpeech, commentToSpeech, buildNarrationScript } from '../../teaching/narration.js'

describe('sanToSpeech', () => {
  it('speaks moves in Spanish', () => {
    expect(sanToSpeech('Nf3', 'es')).toBe('caballo f 3')
    expect(sanToSpeech('Bxb5+', 'es')).toBe('alfil por b 5, jaque')
    expect(sanToSpeech('exd5', 'es')).toBe('peón e por d 5')
    expect(sanToSpeech('e4', 'es')).toBe('peón a e 4')
    expect(sanToSpeech('O-O-O', 'es')).toBe('enroque largo')
    expect(sanToSpeech('Rd8#', 'es')).toBe('torre d 8, jaque mate')
    expect(sanToSpeech('e8=Q', 'es')).toBe('peón a e 8 y corona dama')
    expect(sanToSpeech('Nbd7', 'es')).toBe('caballo de b a d 7')
  })

  it('speaks moves in English', () => {
    expect(sanToSpeech('Nf3', 'en')).toBe('knight f 3')
    expect(sanToSpeech('Bxb5+', 'en')).toBe('bishop takes b 5, check')
    expect(sanToSpeech('O-O', 'en')).toBe('castles kingside')
    expect(sanToSpeech('Rd8#', 'en')).toBe('rook d 8, checkmate')
  })
})

describe('commentToSpeech', () => {
  it('replaces notation with words and drops move numbers and brackets', () => {
    expect(commentToSpeech('Lo normal es 3... exd4 4. ♘xd4 ♘f6.', 'es')).toBe(
      'Lo normal es peón e por d 4, caballo por d 4, caballo f 6.',
    )
    expect(commentToSpeech('{ A premature pin on the knight on f3. }', 'en')).toBe('A premature pin on the knight on f 3.')
  })
})

describe('buildNarrationScript', () => {
  const TEXT = [
    'La partida de la Ópera',
    '1. e4 e5 2. ♘f3 d6',
    'La Defensa Philidor. Las negras sostienen el peón de e5.',
    '3. d4 ♗g4',
    'Una clavada sobre el caballo de f3. Lo normal es 3... exd4 4. ♘xd4.',
    '4. dxe5',
  ].join('\n')
  const [game] = recognizeGames(TEXT, { algorithm: 2 })
  const script = buildNarrationScript(TEXT, game, { from: 0 })

  it('alternates intro, moves and comments in reading order', () => {
    expect(script.map((s) => s.kind)).toEqual([
      'intro', 'move', 'move', 'move', 'move', 'comment', 'move', 'move', 'comment', 'move',
    ])
  })

  it('a move step announces the move and carries its node and cue', () => {
    const first = script[1]
    expect(first.speech).toBe('1. Blancas: peón a e 4')
    expect(first.nodeId).toBe(game.tree.mainline[0])
    expect(first.sentences[0].cues[0]).toMatchObject({ kind: 'move' })
    expect(script[4].speech).toBe('2. Negras: peón a d 6')
  })

  it('a comment step is shown on the position after the previous move', () => {
    const comment = script[5]
    expect(comment.nodeId).toBe(game.tree.mainline[3])
    expect(comment.sentences.map((s) => s.speech)).toEqual([
      'La Defensa Philidor.',
      'Las negras sostienen el peón de e 5.',
    ])
    const cues = comment.sentences[1].cues
    expect(cues.find((c) => c.kind === 'piece')!.squares[0]).toEqual({ square: 'e5', role: 'piece', blink: true })
  })

  it('a comment keeps the variation moves it quotes, to simulate them', () => {
    const comment = script[8]
    const quoted = comment.sentences[1].moves.map((id) => game.tree.nodes.get(id)!.san)
    expect(quoted).toEqual(['exd4', 'Nxd4'])
    expect(comment.sentences[0].cues.some((c) => c.concept === 'pin')).toBe(true)
  })

  it('every step points at its source text', () => {
    for (const step of script) expect(step.charEnd).toBeGreaterThan(step.charStart)
    expect(TEXT.slice(script[5].charStart, script[5].charEnd)).toContain('Defensa Philidor')
  })
})
