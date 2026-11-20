import { useState } from 'react'
import { findWrongMove, type Lang, type WrongMoveFix, type WrongMoveResult } from '@chess-ebook/chess-shared'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useLlm } from '../../../shared/llm'
import { useErrataContext } from '../errata/errataContext'
import type { SaveFixInput } from './gameFix'
import type { EditableMove } from '../correction/workbench'
import { fixLabel, parseRank, plyLabel, previewFix, RANK_SYSTEM } from './wrongMove'
import { rankQuestion, saveWrongMoveFix, type FixSaveResult } from './gameFix'

const T: Record<Lang, Record<string, string>> = {
  en: {
    find: 'Find the wrong move', plays: 'The whole printed game plays: there is no wrong move to find.', failing: 'The game stops at',
    none: 'No single fix makes more of the game play.', later: 'later moves play', complete: 'complete', preview: 'Preview',
    read: 'of', moves: 'moves are read', before: 'before', save: 'Save the correction', saved: 'Saved:', noServer: 'Not saved: add this JSON to the resources repository at',
    noBook: 'Open the game from a book to save a correction.', ai: 'Ask the AI to rank', asking: 'Asking the AI…', aiPick: 'AI pick', aiBad: 'The AI answer could not be read.',
  },
  es: {
    find: 'Buscar la jugada errónea', plays: 'Toda la partida impresa se juega: no hay jugada errónea que buscar.', failing: 'La partida se detiene en',
    none: 'Ningún arreglo único hace que se juegue más partida.', later: 'jugadas posteriores se juegan', complete: 'completa', preview: 'Previsualizar',
    read: 'de', moves: 'jugadas se leen', before: 'antes', save: 'Guardar la corrección', saved: 'Guardada:', noServer: 'Sin guardar: añade este JSON al repositorio de recursos en',
    noBook: 'Abre la partida desde un libro para guardar una corrección.', ai: 'Pedir a la IA que ordene', asking: 'Preguntando a la IA…', aiPick: 'Elección de la IA', aiBad: 'No se pudo leer la respuesta de la IA.',
  },
  de: {
    find: 'Den falschen Zug finden', plays: 'Die ganze gedruckte Partie ist spielbar: kein falscher Zug.', failing: 'Die Partie stoppt bei',
    none: 'Keine einzelne Korrektur macht mehr von der Partie spielbar.', later: 'spätere Züge spielbar', complete: 'vollständig', preview: 'Vorschau',
    read: 'von', moves: 'Zügen werden gelesen', before: 'vorher', save: 'Korrektur speichern', saved: 'Gespeichert:', noServer: 'Nicht gespeichert: dieses JSON im Ressourcen-Repository ablegen unter',
    noBook: 'Öffne die Partie aus einem Buch, um eine Korrektur zu speichern.', ai: 'Die KI ordnen lassen', asking: 'Frage die KI…', aiPick: 'KI-Wahl', aiBad: 'Die Antwort der KI war nicht lesbar.',
  },
}

const TOP_N = 5

interface Props {
  /** The printed main line (the workbench's initial moves). */
  moves: EditableMove[]
  startFen: string
  /** The chapter text the moves' offsets point into. */
  text: string
  gameIndex: number
  /** The errata entry for a corrected main line of the same length, or null when it cannot be built. */
  errataFor: SaveFixInput['errataFor']
}

type SaveState = FixSaveResult

/**
 * "Find the wrong move": the deterministic search of chess-shared over the
 * printed main line, ranked fixes with a preview of how much of the game they
 * read, an optional LLM ranking, and saving the chosen fix (errata for a
 * substitution, a 'move' suggestion for the others). Nothing is applied by itself.
 */
export function WrongMoveFinder({ moves, startFen, text, gameIndex, errataFor }: Props) {
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang]
  const llm = useLlm()
  const ctx = useErrataContext()
  const [result, setResult] = useState<WrongMoveResult | null>(null)
  const [previews, setPreviews] = useState<Record<number, { read: number; total: number }>>({})
  const [rank, setRank] = useState<{ best: number; reason: string } | 'asking' | 'bad' | null>(null)
  const [saved, setSaved] = useState<SaveState | null>(null)
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'

  const sans = moves.map((m) => m.san)
  const run = () => {
    setResult(findWrongMove({ sans, startFen, topN: TOP_N }))
    setPreviews({}); setRank(null); setSaved(null)
  }
  const before = () => (result?.failingPly ?? 0)

  const save = async (fix: WrongMoveFix) => {
    setSaved(null)
    setSaved(await saveWrongMoveFix(fix, { moves, gameIndex, errataFor, target: { book: ctx.bookTitle, chapter: ctx.chapter }, noBook: t.noBook }))
  }

  const askAi = async () => {
    const question = result ? rankQuestion(moves, text, result) : null
    if (!result || !question) return
    setRank('asking')
    try {
      const answer = await llm.complete({ system: RANK_SYSTEM, messages: [{ role: 'user', text: question }], json: true, maxTokens: 400 })
      setRank(parseRank(answer.text, result.fixes.length) ?? 'bad')
    } catch {
      setRank('bad')
    }
  }

  return (
    <div className="rounded border border-slate-200 p-2 text-xs text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={run} aria-label={t.find}>🔎 {t.find}</button>
        {llm.available && result && result.fixes.length > 0 && (
          <button className={button} onClick={askAi} disabled={rank === 'asking'} aria-label={t.ai}>✨ {t.ai}</button>
        )}
      </div>
      {result && (result.failingPly === null ? <p className="mt-1">{t.plays}</p> : (
        <>
          <p className="mt-1" data-testid="wrong-move-failing">
            {t.failing} <strong className="font-mono">{plyLabel(result.failingPly)} {moves[result.failingPly]?.source?.written ?? sans[result.failingPly]}</strong>
          </p>
          {rank === 'asking' && <p role="status">{t.asking}</p>}
          {rank === 'bad' && <p role="status" className="text-red-700">{t.aiBad}</p>}
          {rank && typeof rank === 'object' && (
            <p role="status" data-testid="wrong-move-ai" className="mt-1 rounded bg-violet-50 px-2 py-1 text-violet-900">
              {t.aiPick}: {fixLabel(result.fixes[rank.best])}. {rank.reason}
            </p>
          )}
          {result.fixes.length === 0 ? <p className="mt-1">{t.none}</p> : (
            <ol className="mt-1 flex flex-col gap-1" data-testid="wrong-move-fixes">
              {result.fixes.map((fix, i) => {
                const picked = rank !== null && typeof rank === 'object' && rank.best === i
                const preview = previews[i]
                return (
                  <li
                    key={`${fix.kind}-${fix.ply}-${fix.to}`}
                    data-ai-pick={picked ? 'true' : undefined}
                    className={`flex flex-wrap items-center gap-1.5 rounded border px-2 py-1 ${picked ? 'border-violet-400 bg-violet-50' : 'border-slate-200'}`}
                  >
                    <span className="font-mono">{fixLabel(fix)}</span>
                    <span className="text-slate-500">· {fix.playedAfter} {t.later}</span>
                    {fix.complete && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold uppercase text-emerald-800">{t.complete}</span>}
                    {picked && <span className="rounded bg-violet-200 px-1 text-[10px] font-semibold uppercase text-violet-900">{t.aiPick}</span>}
                    <span className="ml-auto flex gap-1">
                      <button className={button} onClick={() => setPreviews({ ...previews, [i]: previewFix(sans, fix, startFen) })}>{t.preview}</button>
                      <button className={button} onClick={() => void save(fix)}>{t.save}</button>
                    </span>
                    {preview && (
                      <span className="w-full text-slate-600" data-testid="wrong-move-preview">
                        {preview.read} {t.read} {preview.total} {t.moves} ({before()} {t.before})
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </>
      ))}
      {saved && (
        <div role="status" data-testid="wrong-move-saved" className="mt-1">
          {saved.ok ? <p>{t.saved} <code>{saved.path}</code></p> : 'path' in saved ? (
            <>
              <p>{t.noServer} <code>{saved.path}</code>{saved.reason ? ` (${saved.reason})` : ''}</p>
              <textarea readOnly value={saved.json} rows={6} aria-label="JSON" className="mt-1 w-full rounded border border-slate-300 p-1 font-mono text-[11px]" />
            </>
          ) : <p>{saved.reason}</p>}
        </div>
      )}
    </div>
  )
}
