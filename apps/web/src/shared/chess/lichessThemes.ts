import { moveMotifs, type MotifKind } from '@chess-ebook/chess-shared'

/** The Lichess puzzle theme names of the patterns our detectors find (S4). */
const THEME: Partial<Record<MotifKind, string>> = {
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', 'discovered-check': 'Discovered attack', 'double-check': 'Double check',
  sacrifice: 'Sacrifice', 'exchange-sacrifice': 'Exchange sacrifice', mate: 'Checkmate', 'mate-threat': 'Mate threat',
  promotion: 'Promotion', 'en-passant': 'En passant',
}

/** The tactical patterns a move shows, named as Lichess names its puzzle themes. */
export function lichessThemes(fenBefore: string, san: string): string[] {
  try {
    return [...new Set(moveMotifs(fenBefore, san).map((m) => THEME[m.kind]).filter((x): x is string => !!x))]
  } catch {
    return []
  }
}

