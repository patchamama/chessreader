// Extraction helpers of scripts/build-game-db.mjs: heading, ending and cover.
import { describe, expect, it } from 'vitest'
import { parseGameHeader } from '../src/recognition/gameHeader.ts'
import { recognizeGames } from '../src/recognition/recognizeGames.ts'
import { bookChapters, chapterProse, commentCount, commentedPgn, matchGame } from './gameDbExtract.mjs'
import { coverHref, gameEnding, headingLines, readGameHeading } from './gameDbExtract.mjs'

describe('headingLines', () => {
  it('drops the move number, FEN, diagram and engine lines that follow the heading', () => {
    const text = 'Partida 1\nL. Portisch-T. Petrosian\nSan Antonio 1972\n4rrk1/1bqnppbp/1pNp2p1/pPnP4/2P5/4BB2/P4PPP/1NRQ1RK1 w - - 0 24\n￼\nStockfish 14 eval: [+1.23] 24 Nd2 e5\n24'
    expect(headingLines(text)).toEqual(['Partida 1', 'L. Portisch-T. Petrosian', 'San Antonio 1972'])
  })
  it('splits two-column lines', () => {
    expect(headingLines('Greater New York Open        Ataque Indio de Rey (A00)\n1.')).toEqual(['Greater New York Open', 'Ataque Indio de Rey (A00)'])
  })
})

describe('readGameHeading', () => {
  it('reads players, place, date, event and opening', () => {
    const h = readGameHeading(['Partida 149', 'M. Euwe-R. Réti', 'Moscú (Blitz) 28.5.1992', 'Amsterdam 1920, Match, 3ª partida', 'Defensa Caro-Kann (B10)'], parseGameHeader)
    expect(h).toMatchObject({ white: 'M. Euwe', black: 'R. Réti', place: 'Moscú (Blitz)', date: '1992-05-28', year: 1992, event: 'Amsterdam 1920, Match, 3ª partida', opening: 'Defensa Caro-Kann', eco: 'B10', whiteElo: null, blackElo: null })
  })
  it('keeps a tournament line without a year as the event', () => {
    const h = readGameHeading(['Partida 299', 'S. Reshevsky-T. Petrosian', 'Zurich 1953, 2ª ronda', 'Torneo de Candidatos', 'Defensa Nimzoindia (E58)'], parseGameHeader)
    expect(h).toMatchObject({ white: 'S. Reshevsky', black: 'T. Petrosian', place: 'Zurich', year: 1953, event: 'Zurich 1953, 2ª ronda · Torneo de Candidatos', eco: 'E58' })
  })
  it('reads the Elo written after each name', () => {
    const h = readGameHeading(['A. Karpov (2705) – G. Kasparov (2715)', 'Moscú 1984'], parseGameHeader)
    expect(h).toMatchObject({ white: 'A. Karpov', black: 'G. Kasparov', whiteElo: 2705, blackElo: 2715, place: 'Moscú', year: 1984 })
  })
  it('null when the lines are prose', () => {
    expect(readGameHeading(['Esta partida fue extensamente analizada por los expertos, en particular por Larsen, que extrajo conclusiones.'], parseGameHeader)).toBeNull()
  })
})

describe('gameEnding', () => {
  it('resignation, and the result it implies', () => {
    expect(gameEnding(' y las negras abandonaron.\nEl siguiente ejemplo', 'Bxc6', '*')).toEqual({ result: '1-0', termination: 'resignation' })
    expect(gameEnding('\nBlancas se rinden.\n', 'Kg3', '*')).toEqual({ result: '0-1', termination: 'resignation' })
    expect(gameEnding(' 0-1\nWhite resigned.', 'Qh5', '0-1')).toEqual({ result: '0-1', termination: 'resignation' })
  })
  it('draws, perpetual check and mate', () => {
    expect(gameEnding(' ½-½\nTablas.\nEl siguiente ejemplo fue prologado', 'Kf5', '½-½')).toEqual({ result: '½-½', termination: 'draw' })
    expect(gameEnding('\nTablas por jaque perpetuo.', 'Qe8+', '*')).toEqual({ result: '½-½', termination: 'perpetual check' })
    expect(gameEnding(' 1-0', 'Qxf7#', '1-0')).toEqual({ result: '1-0', termination: 'checkmate' })
    expect(gameEnding('\nY mate.', 'Rg3', '*')).toEqual({ result: '*', termination: 'checkmate' })
  })
  it('loss on time; nothing from prose', () => {
    expect(gameEnding('\nLas negras perdieron por tiempo.', 'Kh1', '*')).toEqual({ result: '1-0', termination: 'time' })
    expect(gameEnding('\nLas blancas abandonaron la idea de atacar en el flanco de rey, porque las negras tenían el tiempo de defenderse con comodidad.', 'Nf3', '*')).toEqual({ result: '*', termination: null })
  })
})

describe('coverHref', () => {
  const items = '<item id="img1" href="Images/first.jpg" media-type="image/jpeg"/><item media-type="image/jpeg" href="Images/real%20cover.jpg" id="cov"/>'
  it('EPUB 3: the item with properties="cover-image"', () => {
    expect(coverHref(`<manifest>${items}<item properties="cover-image" href="Images/c3.png" id="c3" media-type="image/png"/></manifest>`)).toBe('Images/c3.png')
  })
  it('EPUB 2: <meta name="cover" content=id>, in any attribute order', () => {
    expect(coverHref(`<metadata><meta content="cov" name="cover"/></metadata><manifest>${items}</manifest>`)).toBe('Images/real cover.jpg')
  })
  it('the image of the guide cover page', () => {
    const opf = `<manifest>${items}<item id="p" href="Text/cover.xhtml" media-type="application/xhtml+xml"/></manifest><guide><reference type="cover" href="Text/cover.xhtml#top"/></guide>`
    const read = (p) => (p === 'Text/cover.xhtml' ? '<svg><image xlink:href="../Images/front.jpg"/></svg>' : null)
    expect(coverHref(opf, read)).toBe('Images/front.jpg')
  })
  it('else the first image', () => {
    expect(coverHref(`<manifest>${items}</manifest>`)).toBe('Images/first.jpg')
  })
})

describe('bookChapters (numbered like the reader: one chapter per form feed, empty ones skipped)', () => {
  it('numbers the non-empty pieces from 1 and keeps each piece untouched', () => {
    expect(bookChapters('Intro\n\f \n\fPartida 1\n1.e4 e5\fEnd')).toEqual([
      { chapter: 1, text: 'Intro\n' }, { chapter: null, text: ' \n' }, { chapter: 2, text: 'Partida 1\n1.e4 e5' }, { chapter: 3, text: 'End' },
    ])
  })
})

describe('chapterProse (the text the reader recognises: one line per paragraph, whitespace collapsed)', () => {
  it('drops blank lines and collapses spaces', () => {
    expect(chapterProse('  Partida 1 \r\n\n\n1.e4   e5\t 2.Cf3\n')).toBe('Partida 1\n1.e4 e5 2.Cf3')
  })
})

describe('commentedPgn (the game with the book\'s remarks in braces and its variations)', () => {
  const text = chapterProse('1.e4 e5 2.Cf3 Las blancas atacan el peón de e5.\n2...Cc6 (2...d6 es la Defensa Philidor, más pasiva.) 3.Ab5 a6!? Una idea de Morphy.\n4.Aa4 Cf6')
  const [game] = recognizeGames(text, { algorithm: 2 })
  const pgn = commentedPgn(game.tree, text)
  it('puts the prose after a move in braces (the next Black move numbered again), in English SAN with the move marks', () => {
    expect(pgn).toContain('2. Nf3 {Las blancas atacan el peón de e5.} 2... Nc6')
    expect(pgn).toContain('3. Bb5 a6!? {Una idea de Morphy.} 4. Ba4 Nf6')
  })
  it('keeps the variations in parentheses, with their remarks', () => {
    expect(pgn).toContain('(2... d6 {es la Defensa Philidor, más pasiva.})')
  })
  it('no comment for a gap of bare move numbers; braces in the prose cannot break the PGN', () => {
    expect(pgn.startsWith('1. e4 e5 2. Nf3')).toBe(true)
    const t = chapterProse('1.e4 e5 2.Cf3 una {rara} jugada; Stockfish 14 eval: [+0.48] ￼ 2...Cc6 3.Ab5')
    const [g] = recognizeGames(t, { algorithm: 2 })
    expect(commentedPgn(g.tree, t)).toContain('2. Nf3 {una (rara) jugada;} 2... Nc6')
  })
  it('a remark keeps only balanced parentheses (an open one would swallow the moves after it)', () => {
    const t = chapterProse('1.e4 e5 2.Cf3 Cc6 3.Ab5 a6?! (según Bronstein, era mejor 3...Cf6 4.O-O) 4.Aa4 Cf6 5.O-O Ae7')
    const [g] = recognizeGames(t, { algorithm: 2 })
    const pgn = commentedPgn(g.tree, t)
    expect(pgn).toContain('3. Bb5 a6?! {según Bronstein, era mejor} (3... Nf6 4. O-O) 4. Ba4')
    for (const [, body] of pgn.matchAll(/\{([^}]*)\}/g)) expect(body.split('(').length).toBe(body.split(')').length)
    const [again] = recognizeGames(pgn, { algorithm: 2 })
    expect(again.tree.mainline.map((id) => again.tree.nodes.get(id).san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'])
  })
  it('commentCount counts the remarks', () => {
    expect(commentCount(pgn)).toBe(3)
    expect(commentCount('1. e4 e5')).toBe(0)
  })
})

describe('matchGame (the reader\'s game of a chapter that is this database game)', () => {
  const games = [['d4', 'Nf6'], ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'], ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']]
  const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']
  it('the longest shared opening of the moves, skipping games already taken', () => {
    expect(matchGame(sans, games)).toBe(2)
    expect(matchGame(sans, games, new Set([2]))).toBe(1)
  })
  it('null when no game shares enough moves', () => {
    expect(matchGame(['c4', 'e5', 'Nc3'], games)).toBeNull()
    expect(matchGame(sans, games, new Set([1, 2]))).toBeNull()
  })
})
