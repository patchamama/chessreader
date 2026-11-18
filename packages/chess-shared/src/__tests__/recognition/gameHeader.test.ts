import { describe, expect, it } from 'vitest'
import { parseGameHeader } from '../../recognition/gameHeader'

describe('game header lines before a game (books)', () => {
  it('reads the usual book heading: number, players, place and date, event, opening with ECO', () => {
    const h = parseGameHeader(['Partida 149', 'M. Euwe-R. Réti', 'Moscú (Blitz) 28.5.1992', 'Amsterdam 1920, Match, 3ª partida', 'Defensa Caro-Kann (B10)'])
    expect(h).toEqual({
      number: 149, white: 'M. Euwe', black: 'R. Réti', place: 'Moscú (Blitz)', date: '1992-05-28', year: 1992,
      event: 'Amsterdam 1920, Match, 3ª partida', opening: 'Defensa Caro-Kann', eco: 'B10', lines: 5,
    })
  })

  it('works with lines missing, ALL-CAPS names, dashes and other languages', () => {
    expect(parseGameHeader(['T. PETROSIAN – S. GLIGORIC', 'Olimpiada de Varna 1962'])).toEqual({
      white: 'T. Petrosian', black: 'S. Gligoric', event: 'Olimpiada de Varna 1962', place: 'Olimpiada de Varna', year: 1962, lines: 2,
    })
    expect(parseGameHeader(['Game 7', 'Alekhine – Capablanca', "Queen's Gambit Declined (D63)"])).toMatchObject({ number: 7, white: 'Alekhine', black: 'Capablanca', opening: "Queen's Gambit Declined", eco: 'D63', lines: 3 })
  })

  it('takes only the heading lines just before the game: prose stops it', () => {
    const h = parseGameHeader(['Esta partida explica de la manera más dramática posible la palabra zugzwang, que todos temen.', 'Partida 12', 'Fischer-Rossetto', 'Mar del Plata 1959'])
    expect(h).toMatchObject({ number: 12, white: 'Fischer', black: 'Rossetto', year: 1959, lines: 3 })
    expect(parseGameHeader(['Un párrafo cualquiera de comentario, sin nombres.'])).toBeNull()
  })

  it('keeps a tournament line without a year as part of the event (Kasparov: "19º Campeonato de la URSS")', () => {
    expect(parseGameHeader(['Partida 298', 'T. Petrosian-V. Smyslov', 'Moscú 1951', '19º Campeonato de la URSS', 'Defensa Eslava (D15)'])).toEqual({
      number: 298, white: 'T. Petrosian', black: 'V. Smyslov', place: 'Moscú', year: 1951,
      event: 'Moscú 1951 · 19º Campeonato de la URSS', opening: 'Defensa Eslava', eco: 'D15', lines: 5,
    })
    expect(parseGameHeader(['Partida 5', 'Tal-Botvinnik', 'Torneo de Candidatos'])).toMatchObject({ number: 5, event: 'Torneo de Candidatos', lines: 3 })
  })

  it('reads a hyphenated surname in the players line (Capítulo dos: "A. Dyin-Zhenevsky-E. Lasker")', () => {
    expect(parseGameHeader(['Partida 72', 'A. Dyin-Zhenevsky-E. Lasker', 'Moscú 1925'])).toMatchObject({
      number: 72, white: 'A. Dyin-Zhenevsky', black: 'E. Lasker', lines: 3,
    })
  })
})
