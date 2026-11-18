import { HoverLine } from '../../shared/chess/HoverLine'
import type { LinePosition } from '../../shared/chess/playLine'
import type { AppLanguage } from '../../shared/settings/settingsStore'
import { localSan } from './trapNotation'
import type { IdeaSegment } from './trapText'

/**
 * The idea text of a trap: each line of moves is clickable (every move shows
 * its position on the practice board, with a thumbnail on hover when move
 * thumbnails are on) and each square or line of squares it names is lit, and
 * marked on the board when clicked. Moves are written in the notation of the
 * settings; the rest of the text keeps its language.
 */
export function TrapIdeaText({ segments, lang, figurines, onPosition, onSquares }: {
  segments: IdeaSegment[]; lang: AppLanguage; figurines: boolean
  onPosition: (p: LinePosition) => void; onSquares: (squares: string[]) => void
}) {
  return (
    <>
      {segments.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.text}</span>
        if (s.kind === 'square') {
          return (
            <button key={i} type="button" aria-label={s.text} onClick={() => onSquares(s.squares)}
              className="rounded bg-amber-100 px-0.5 font-medium text-amber-900 hover:bg-amber-200">{s.text}</button>
          )
        }
        const text = s.positions.map((p, j) => `${s.numbers[j] ? `${s.numbers[j]} ` : ''}${localSan(p.san, lang, figurines)}`).join(' ')
        return <HoverLine key={i} text={text} positions={s.positions} className="font-mono" onPick={(j) => onPosition(s.positions[j])} />
      })}
    </>
  )
}
