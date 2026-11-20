import { useEffect, useRef } from 'react'
import { LinePlayer } from '../../shared/chess/LinePlayer'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import type { Trap } from './traps'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const T = {
  en: { close: 'Close', sets: 'Set by', white: 'White', black: 'Black', at: 'at move', setup: 'Can be set up', fall: 'Chance they fall', tactic: 'Tactical level', source: 'Source' },
  es: { close: 'Cerrar', sets: 'La pone', white: 'Blancas', black: 'Negras', at: 'en la jugada', setup: 'Posibilidad de planteamiento', fall: 'Probabilidad de que caigan', tactic: 'Nivel táctico', source: 'Fuente' },
  de: { close: 'Schließen', sets: 'Gestellt von', white: 'Weiß', black: 'Schwarz', at: 'im Zug', setup: 'Aufstellbar', fall: 'Fallwahrscheinlichkeit', tactic: 'Taktisches Niveau', source: 'Quelle' },
}

const dots = (n: number | null) => (n === null ? '–' : '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n)))

/**
 * A trap in a modal (S11): its line on a small board to replay move by move,
 * and its explanation — category, opening, who sets it, the ratings and the
 * book's introduction. Escape, the close button or the backdrop close it.
 */
export function TrapPreviewModal({ trap, onClose }: { trap: Trap; onClose: () => void }) {
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const title = lang === 'es' && trap.titleEs ? trap.titleEs : trap.title
  const intro = lang === 'es' && trap.introEs ? trap.introEs : trap.intro
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="text-xs text-slate-600">
              {trap.category} · {trap.opening} · {t.sets}: {trap.side === 'white' ? t.white : t.black}{trap.trapMove ? ` ${t.at} ${trap.trapMove}` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" aria-label={t.close} title={t.close} onClick={onClose} className="rounded px-2 text-lg leading-none text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="w-full shrink-0 sm:w-64">
            <LinePlayer fen={START} moves={trap.sans} orientation={trap.side} testId="trap-preview-player" />
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs text-slate-700">
              <dt>{t.setup}</dt><dd aria-label={`${t.setup}: ${trap.setup ?? '–'}`}>{dots(trap.setup)}</dd>
              <dt>{t.fall}</dt><dd aria-label={`${t.fall}: ${trap.fall ?? '–'}`}>{dots(trap.fall)}</dd>
              <dt>{t.tactic}</dt><dd aria-label={`${t.tactic}: ${trap.tactic ?? '–'}`}>{dots(trap.tactic)}</dd>
            </dl>
            {intro && intro.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
            <p className="text-xs text-slate-500">{t.source}: {trap.source.title}{trap.source.author ? ` — ${trap.source.author}` : ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
