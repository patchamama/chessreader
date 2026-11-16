import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { sanToSpeech, commentToSpeech, buildNarrationScript } from '../../teaching/narration.js'

describe('sanToSpeech', () => {
  it('speaks moves in Spanish', () => {
    expect(sanToSpeech('Nf3', 'es')).toBe('caballo efe 3')
    expect(sanToSpeech('Bxb5+', 'es')).toBe('alfil por be 5, jaque')
    expect(sanToSpeech('exd5', 'es')).toBe('peón e por de 5')
    expect(sanToSpeech('e4', 'es')).toBe('peón a e 4')
    expect(sanToSpeech('O-O-O', 'es')).toBe('enroque largo')
    expect(sanToSpeech('Rd8#', 'es')).toBe('torre de 8, jaque mate')
    expect(sanToSpeech('e8=Q', 'es')).toBe('peón a e 8 y corona dama')
    expect(sanToSpeech('Nbd7', 'es')).toBe('caballo de be a de 7')
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
      'Lo normal es peón e por de 4, caballo por de 4, caballo efe 6.',
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
    expect(first.speech).toBe('1. peón a e 4')
    expect(first.nodeId).toBe(game.tree.mainline[0])
    expect(first.sentences[0].cues[0]).toMatchObject({ kind: 'move' })
    expect(script[4].speech).toBe('peón a de 6')
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

describe('narration wording options', () => {
  const TEXT = '1. e4 e5 2. Nf3 d6'
  const [game] = recognizeGames(TEXT, { algorithm: 2 })
  const speech = (o: object) => buildNarrationScript(TEXT, game, { from: 0, lang: 'es', ...o }).filter((s) => s.kind === 'move').map((s) => s.speech)

  it('by default says the number on White moves only and never the colour', () => {
    expect(speech({})).toEqual(['1. peón a e 4', 'peón a e 5', '2. caballo efe 3', 'peón a de 6'])
  })
  it('can say the colour, and the number for Black (always with the colour)', () => {
    expect(speech({ sayColor: true })[0]).toBe('1. Blancas: peón a e 4')
    expect(speech({ sayNumber: 'both' })[1]).toBe('1. Negras: peón a e 5')
    expect(speech({ sayNumber: 'none' })[0]).toBe('peón a e 4')
  })
  it('the caption of a move is the move as written, not its phonetics', () => {
    const script = buildNarrationScript(TEXT, game, { from: 0, lang: 'es' })
    expect(script.find((s) => s.kind === 'move')!.caption).toBe('1. e4')
  })
  it('speaks German', () => {
    expect(sanToSpeech('Nxb5+', 'de')).toBe('Springer schlägt b 5, Schach')
    expect(sanToSpeech('O-O', 'de')).toBe('kurze Rochade')
  })
})

describe('dates in commentary', () => {
  it('reads year.month.day and day.month.year as dates', () => {
    expect(commentToSpeech('Jugada el 2020.11.28 en Madrid.', 'es')).toBe('Jugada el 28 de noviembre de 2020 en Madrid.')
    expect(commentToSpeech('Played on 28.11.2020.', 'en')).toBe('Played on November 28, 2020.')
    expect(commentToSpeech('Gespielt am 28.11.2020.', 'de')).toBe('Gespielt am 28. November 2020.')
    expect(commentToSpeech('Londres, 1858.??.??', 'es')).toBe('Londres, 1858')
  })
})

describe('variation moves are spoken one by one, each with its node', () => {
  const TEXT = ['1. e4 e5 2. Nf3 d6 3. d4 Bg4', 'Lo normal es 3... exd4 4. Nxd4 y las blancas están mejor.', '4. dxe5'].join('\n')
  const [game] = recognizeGames(TEXT, { algorithm: 2 })
  const script = buildNarrationScript(TEXT, game, { from: 0, lang: 'es' })
  it('splits the sentence in parts that start at each quoted move', () => {
    const sentence = script.find((s) => s.kind === 'comment')!.sentences[0]
    expect(sentence.parts.map((p) => p.speech)).toEqual(['Lo normal es', 'peón e por de 4', 'caballo por de 4 y las blancas están mejor.'])
    expect(sentence.parts.map((p) => (p.moveId ? game.tree.nodes.get(p.moveId)!.san : null))).toEqual([null, 'exd4', 'Nxd4'])
    expect(sentence.speech).toBe('Lo normal es peón e por de 4, caballo por de 4 y las blancas están mejor.')
  })
})
