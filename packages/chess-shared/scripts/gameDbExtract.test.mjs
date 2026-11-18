// Extraction helpers of scripts/build-game-db.mjs: heading, ending and cover.
import { describe, expect, it } from 'vitest'
import { parseGameHeader } from '../src/recognition/gameHeader.ts'
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
