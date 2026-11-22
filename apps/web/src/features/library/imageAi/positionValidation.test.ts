import { describe, it, expect } from 'vitest'
import { assembleFen, castlingOptions, enPassantOptions, sideFromFollowing, validatePlacement } from './positionValidation'

describe('validatePlacement', () => {
  it('accepts a normal position', () => {
    expect(validatePlacement('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'w')).toEqual([])
  })
  it('wants exactly one king per side', () => {
    expect(validatePlacement('8/8/8/8/8/8/8/R3K3')).toEqual(expect.arrayContaining([expect.stringMatching(/black.*king/i)]))
    expect(validatePlacement('k6k/8/8/8/8/8/8/4K3')).toEqual(expect.arrayContaining([expect.stringMatching(/black.*2 kings|two kings|more than one/i)]))
  })
  it('refuses pawns on the first and eighth ranks', () => {
    const issues = validatePlacement('P3k3/8/8/8/8/8/8/p3K3')
    expect(issues.filter((i) => /rank/i.test(i)).length).toBeGreaterThan(0)
  })
  it('limits pawns to 8 and pieces to 16 per side', () => {
    expect(validatePlacement('4k3/8/8/8/8/PPPPPPPP/P7/4K3').join(' ')).toMatch(/white.*9 pawns|more than 8 pawns/i)
    expect(validatePlacement('rrrrkrrr/qqqqqqqq/n7/8/8/8/8/4K3').join(' ')).toMatch(/black.*16 pieces|more than 16/i)
  })
  it('refuses a position where the side not to move is in check', () => {
    // White to move, black king attacked by the rook on e1.
    expect(validatePlacement('4k3/8/8/8/8/8/8/K3R3', 'w').join(' ')).toMatch(/black.*check/i)
    expect(validatePlacement('4k3/8/8/8/8/8/8/K3R3', 'b')).toEqual([])
  })
  it('does not see a check through a piece', () => {
    expect(validatePlacement('4k3/4p3/8/8/8/8/8/K3R3', 'w')).toEqual([])
  })
  it('refuses a malformed board', () => {
    expect(validatePlacement('8/8/8').join(' ')).toMatch(/board/i)
  })
})

describe('questions the FEN needs', () => {
  it('offers only the castling rights that king and rook squares allow', () => {
    expect(castlingOptions('r3k2r/8/8/8/8/8/8/R3K2R')).toEqual(['K', 'Q', 'k', 'q'])
    expect(castlingOptions('r3k3/8/8/8/8/8/8/4K2R')).toEqual(['K', 'q'])
    expect(castlingOptions('4k3/8/8/8/8/8/8/3K3R')).toEqual([])
  })
  it('offers en passant only when a double push is plausible', () => {
    // Black pawn on d5 next to a white pawn on e5: white could capture on d6.
    expect(enPassantOptions('4k3/8/8/3pP3/8/8/8/4K3', 'w')).toEqual(['d6'])
    expect(enPassantOptions('4k3/8/3p4/3pP3/8/8/8/4K3', 'w')).toEqual([]) // d6 occupied
    expect(enPassantOptions('4k3/8/8/3p4/8/8/8/4K3', 'w')).toEqual([])
    expect(enPassantOptions('4k3/8/8/8/3Pp3/8/8/4K3', 'b')).toEqual(['d3'])
  })
  it('takes the side to move from the following text', () => {
    expect(sideFromFollowing('12.Nf3 Nc6')).toBe('w')
    expect(sideFromFollowing('12...Nc6 13.d4')).toBe('b')
    expect(sideFromFollowing('Just prose.')).toBeNull()
  })
  it('assembles the FEN', () => {
    expect(assembleFen({ placement: '4k3/8/8/8/8/8/8/4K3', side: 'b', castling: [], enPassant: null, moveNumber: 12 })).toBe('4k3/8/8/8/8/8/8/4K3 b - - 0 12')
    expect(assembleFen({ placement: '4k3/8/8/8/8/8/8/4K3', side: 'w', castling: ['k', 'K'], enPassant: 'd6' })).toBe('4k3/8/8/8/8/8/8/4K3 w Kk d6 0 1')
  })
})
