import { useEffect, useMemo, useState } from 'react'
import { positionIdeas } from '@chess-ebook/chess-shared'
import type { BoardCue, CueRole, Lang, PositionIdeas } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useNarrationStore } from '../narration/narrationStore'
import { CUE_COLORS } from '../narration/cueStyles'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type Group = 'hanging' | 'loose' | 'outposts' | 'pinned' | 'passedPawns'
const ROLE: Record<Group, CueRole> = { hanging: 'bad', loose: 'dubious', outposts: 'good', pinned: 'piece', passedPawns: 'pawn' }

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Ideas on the board', show: 'Light them on the board', none: 'Nothing stands out in this position.',
    hanging: 'Can be taken (attacked, and undefended or worth more than the attacker)', loose: 'Undefended pieces',
    outposts: 'Strong squares (no enemy pawn can chase the piece)', pinned: 'Pinned to the king', passedPawns: 'Passed pawns',
    openFiles: 'Open files', white: 'White', black: 'Black',
  },
  es: {
    title: 'Ideas en el tablero', show: 'Iluminarlas en el tablero', none: 'Nada destaca en esta posición.',
    hanging: 'Se pueden capturar (atacadas y sin defensa, o valen más que quien las ataca)', loose: 'Piezas sin defensa',
    outposts: 'Casillas fuertes (ningún peón rival puede expulsar la pieza)', pinned: 'Clavadas contra el rey', passedPawns: 'Peones pasados',
    openFiles: 'Columnas abiertas', white: 'Blancas', black: 'Negras',
  },
  de: {
    title: 'Ideen auf dem Brett', show: 'Auf dem Brett anzeigen', none: 'In dieser Stellung fällt nichts auf.',
    hanging: 'Können geschlagen werden (angegriffen und ungedeckt oder mehr wert als der Angreifer)', loose: 'Ungedeckte Figuren',
    outposts: 'Starke Felder (kein gegnerischer Bauer kann die Figur vertreiben)', pinned: 'An den König gefesselt', passedPawns: 'Freibauern',
    openFiles: 'Offene Linien', white: 'Weiß', black: 'Schwarz',
  },
}
const GLYPH: Record<string, string> = { wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔', bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚' }
const GROUPS: Group[] = ['hanging', 'loose', 'outposts', 'pinned', 'passedPawns']

/** The ideas as board cues: one colour per kind, hanging pieces blinking with an arrow from each attacker. */
export function ideasToCues(ideas: PositionIdeas): BoardCue[] {
  const cue = (group: Group): BoardCue => ({
    kind: 'structure', label: group, start: 0, end: 0,
    squares: ideas[group].map((p) => ({ square: p.square, role: ROLE[group], ...(group === 'hanging' ? { blink: true } : {}) })),
    arrows: group === 'hanging' ? ideas.hanging.flatMap((h) => h.attackers.map((from) => ({ from, to: h.square, role: 'attacker' as const })))
      : group === 'pinned' ? ideas.pinned.map((p) => ({ from: p.by, to: p.square, role: 'attacker' as const })) : [],
  })
  return GROUPS.filter((g) => ideas[g].length > 0).map(cue)
}

/**
 * What a coach sees in the position on the board, before any move: pieces that
 * can be taken, pieces nobody defends, strong squares, pins, passed pawns.
 */
export function PositionIdeasPanel() {
  const lang = useSettingsStore((s) => s.language)
  const game = useStudyBoardStore((s) => s.activeGame)
  const nodeId = useStudyBoardStore((s) => s.currentNodeId)
  const playFen = useStudyBoardStore((s) => s.playFen)
  const narrating = useNarrationStore((s) => s.status === 'playing' || s.status === 'waiting-move')
  const [show, setShow] = useState(false)
  const fen = playFen ?? (game && nodeId ? game.nodes.get(nodeId)?.fen : game?.startFen) ?? START
  const ideas = useMemo(() => { try { return positionIdeas(fen) } catch { return null } }, [fen])

  useEffect(() => {
    if (!show || narrating || !ideas) return
    useNarrationStore.setState({ cues: ideasToCues(ideas) })
    return () => useNarrationStore.setState({ cues: [] })
  }, [show, narrating, ideas])

  const t = T[lang]
  if (!ideas) return null
  const any = GROUPS.some((g) => ideas[g].length > 0)

  return (
    <section aria-label={t.title} className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800">{t.title}</h3>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-700">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          {t.show}
        </label>
      </div>
      {!any && <p className="text-xs text-slate-500">{t.none}</p>}
      <ul className="flex flex-col gap-1 text-xs text-slate-700">
        {GROUPS.filter((g) => ideas[g].length > 0).map((g) => (
          <li key={g} data-testid={`ideas-${g}`}>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: CUE_COLORS[ROLE[g]] }} />
            {t[g]}:{' '}
            <span className="font-mono">
              {ideas[g].map((p) => `${GLYPH[`${p.color[0]}${p.piece}`]}${p.square}`).join(' ')}
            </span>
          </li>
        ))}
        {ideas.openFiles.length > 0 && <li>{t.openFiles}: <span className="font-mono">{ideas.openFiles.join(' ')}</span></li>}
      </ul>
    </section>
  )
}
