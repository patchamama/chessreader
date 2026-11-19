import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { analyseComment, commentToSpeechParts } from '@chess-ebook/chess-shared'
import type { LinePosition } from '../../../shared/chess/playLine'
import { playLine } from '../../../shared/chess/playLine'
import type { AppLanguage } from '../../../shared/settings/settingsStore'
import { cuesToBoard } from '../narration/cueStyles'
import { analysisVoice as voice } from './analysisSpeaker'
import { quotedMoves } from './analysisLine'

export interface NarrationView {
  fen: string
  lastMove: { from: string; to: string } | null
  squareStyles: Record<string, CSSProperties>
  arrows: Arrow[]
}

const bare = (san: string) => san.replace(/[+#!?]+$/g, '')

/**
 * "Narrate" a comment on an analysis board: it is read aloud while the moves it
 * quotes are played and what it names is lit up — on that board only, never on
 * the study board. `view` is what the board shows meanwhile (null: its own position).
 */
export function useCommentNarration(p: {
  text: string
  lang: AppLanguage
  startFen: string
  positions: LinePosition[]
  ply: number
  setPly: (ply: number) => void
  onStart?: () => void
}) {
  const [view, setView] = useState<NarrationView | null>(null)
  const [narrating, setNarrating] = useState(false)
  const run = useRef(0)

  // Leaving the board (closing it, another tab) silences it — only its own voice:
  // cancelling when it is not speaking would cut the study's narration.
  const speaking = useRef(false)
  useEffect(() => () => { run.current++; if (speaking.current) voice().cancel() }, [])

  const stop = () => {
    run.current++
    speaking.current = false
    voice().cancel()
    setNarrating(false)
    setView(null)
  }

  const narrate = async () => {
    const { text, lang, startFen, positions, ply, setPly } = p
    if (!text.trim()) return
    const token = ++run.current
    p.onStart?.()
    setNarrating(true)
    speaking.current = true
    const parts = commentToSpeechParts(text, lang)
    const quoted = quotedMoves(text)
    let fen = ply > 0 ? positions[ply - 1].fen : startFen
    let lastMove: NarrationView['lastMove'] = ply > 0 ? { from: positions[ply - 1].from, to: positions[ply - 1].to } : null
    let segStart = 0
    for (let k = 0; k < parts.length; k++) {
      if (run.current !== token) return
      const part = parts[k]
      if (part.at !== null) {
        segStart = part.at
        const san = quoted.get(part.at)
        if (san) {
          // The move from where the board is; else a move of the board's own line.
          const r = playLine(fen, [san])
          if (r.ok) {
            fen = r.positions[0].fen
            lastMove = { from: r.positions[0].from, to: r.positions[0].to }
          } else {
            const i = positions.findIndex((x) => bare(x.san) === bare(san))
            if (i >= 0) {
              fen = positions[i].fen
              lastMove = { from: positions[i].from, to: positions[i].to }
              setPly(i + 1)
            }
          }
        }
      }
      const next = parts.slice(k + 1).find((x) => x.at !== null)?.at ?? text.length
      const cues = analyseComment(text.slice(segStart, next), fen, { lastMove })
      const { squareStyles, arrows } = cuesToBoard(cues)
      setView({ fen, lastMove, squareStyles, arrows })
      await voice().speak(part.speech, lang, 1)
      segStart = next
    }
    if (run.current !== token) return
    speaking.current = false
    setNarrating(false)
    setView(null)
  }

  return { view, narrating, narrate, stop, clearView: () => setView(null) }
}
