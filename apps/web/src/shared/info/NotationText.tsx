import { HoverLine } from '../chess/HoverLine'
import { notationSegments } from './notationSegments'

/** Shows a line of a text on a board: the position `ply` half-moves into `sans`, played from `startFen`. */
export type ShowLine = (startFen: string, sans: string[], ply: number) => void

/**
 * A text whose chess moves (legal from one of `fens`, by default the start
 * position) are written in the notation of the settings, with a thumbnail of
 * each position on hover when move thumbnails are on; with `onShowLine`, each
 * move is a button that shows its position on the caller's board. The rest of
 * the text stays as written.
 */
export function NotationText({ text, lang, fens, onShowLine }: { text: string; lang: string; fens?: string[]; onShowLine?: ShowLine }) {
  return (
    <>
      {notationSegments(text, lang, fens).map((s, i) => {
        if (s.kind !== 'line') return <span key={i}>{s.text}</span>
        const written = s.positions.map((p, j) => `${s.numbers[j] ? `${s.numbers[j]} ` : ''}${p.san}`).join(' ')
        const sans = s.positions.map((p) => p.san)
        return (
          <HoverLine key={i} text={written} positions={s.positions} className="font-mono"
            onPick={onShowLine ? (j) => onShowLine(s.startFen, sans, j + 1) : undefined} />
        )
      })}
    </>
  )
}
