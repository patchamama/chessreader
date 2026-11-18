import type { ErrataEntry } from './errataFormat'

/** A valid entry: "3. Bb4!?" is a misprint for "3. Bb5" (shared by the errata tests). */
export const SAMPLE: ErrataEntry = {
  id: 'smith-games-2-0',
  book: { title: 'Smith Games', id: 7 },
  chapter: 2,
  gameIndex: 0,
  game: { label: 'Smith – Jones', white: 'Smith', black: 'Jones' },
  original: { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb4!?', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], text: '1. e4 e5 2. Nf3 Nc6 3. Bb4!? a6' },
  corrected: { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  changes: [{ ply: 5, from: 'Bb4!?', to: 'Bb5', source: 'engine' }],
  createdAt: '2026-11-18T10:00:00.000Z',
  appVersion: '0.106.6',
}
