import { describe, expect, it } from 'vitest'
import { parseStudyChapters } from './studyChapters'

const PGN = `[Event "Invented study"]
[ChapterName "Opening ideas"]

{ Welcome to the invented course. } 1. e4 e5 2. Nf3 $1 { A good developing move. } 2... Nc6 3. Bb5? { This allows nothing special. } (3. Bc4 { Also possible. } Bc5) 3... a6 { [%eval 0.2] [%clk 0:01:00] } 4. Ba4 *

[Event "Invented study"]
[ChapterName "From a position"]
[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]
[SetUp "1"]

1. Kd2 Kd4 *

[Event "Invented study"]
[ChapterName "Empty board"]
[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]

{ Only a note. } *`

describe('parseStudyChapters', () => {
  const chapters = parseStudyChapters(PGN)

  it('makes one chapter per study chapter with its name and starting FEN', () => {
    expect(chapters.map((c) => c.name)).toEqual(['Opening ideas', 'From a position', 'Empty board'])
    expect(chapters[0].startFen.startsWith('rnbqkbnr/pppppppp')).toBe(true)
    expect(chapters[1].startFen).toBe('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1')
  })

  it('keeps the comment before the first move as the introduction', () => {
    expect(chapters[0].intro).toEqual(['Welcome to the invented course.'])
    expect(chapters[2].intro).toEqual(['Only a note.'])
  })

  it('records main-line moves with numbering, comments and the position after them', () => {
    const [, , nf3, nc6, bb5] = chapters[0].moves
    expect(nf3).toMatchObject({ san: 'Nf3', text: '2. Nf3!', mark: 'good', comments: ['A good developing move.'] })
    expect(nf3.fenAfter.split(' ')[1]).toBe('b')
    expect(nc6.text).toBe('2... Nc6')
    expect(bb5).toMatchObject({ mark: 'bad', text: '3. Bb5?' })
  })

  it('renders variations as text next to their move and never as main-line moves', () => {
    const bb5 = chapters[0].moves[4]
    expect(bb5.variations).toEqual(['(3. Bc4 Also possible. Bc5)'])
    expect(chapters[0].moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'])
  })

  it('drops engine and clock commands and a comment left empty', () => {
    const a6 = chapters[0].moves[5]
    expect(a6.comments).toEqual([])
  })

  it('numbers black moves after a comment with dots', () => {
    expect(chapters[0].moves[5].text).toBe('3... a6')
  })

  it('starts numbering from the FEN', () => {
    expect(chapters[1].moves.map((m) => m.text)).toEqual(['1. Kd2', 'Kd4'])
    const black = parseStudyChapters('[Event "x"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 7"]\n\n7... Kd7 8. Kd2 *')[0]
    expect(black.moves.map((m) => m.text)).toEqual(['7... Kd7', '8. Kd2'])
  })

  it('marks only ! and !! as good and ? and ?? as bad', () => {
    const c = parseStudyChapters('[Event "x"]\n\n1. e4! e5? 2. d4!! d5?? 3. c4!? c5?! *')[0].moves
    expect(c.map((m) => m.mark)).toEqual(['good', 'bad', 'good', 'bad', null, null])
  })

  it('stops at an illegal move without throwing', () => {
    const c = parseStudyChapters('[Event "x"]\n\n1. e4 e5 2. Qh8 d5 *')[0]
    expect(c.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
  })
})
