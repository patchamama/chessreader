import { describe, expect, it } from 'vitest'
import { parseGameHeader } from '@chess-ebook/chess-shared'
import { introAfterFirstMove } from './introPlacement'

describe('a regenerated game keeps the book heading (S10 follow-up)', () => {
  it('puts the summary lines after the first line of moves, so nothing but the heading sits above 1. d4', () => {
    const body = 'Apertura: Defensa Nimzoindia. Precisión: Blancas 94%, Negras 95%. Lo más importante: 12... c4.\n1. d4 Cf6 2. c4\nUna idea.\n2... e6'
    const out = introAfterFirstMove(body)
    expect(out.split('\n')).toEqual(['1. d4 Cf6 2. c4', 'Apertura: Defensa Nimzoindia. Precisión: Blancas 94%, Negras 95%. Lo más importante: 12... c4.', 'Una idea.', '2... e6'])
    const lines = ['Partida 299', 'S. Reshevsky-T. Petrosian', 'Zurich 1953, 2ª ronda', ...out.split('\n').slice(0, 0)]
    expect(parseGameHeader(lines)).toMatchObject({ number: 299, white: 'S. Reshevsky' })
  })

  it('leaves a body that starts with moves as it is', () => {
    expect(introAfterFirstMove('1. e4 e5\nBien.')).toBe('1. e4 e5\nBien.')
    expect(introAfterFirstMove('26... Ne4 27. Nxe4')).toBe('26... Ne4 27. Nxe4')
  })
})
