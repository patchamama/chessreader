import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractPlayers } from '@chess-ebook/chess-shared'
import type { Lang, RecognizedGame } from '@chess-ebook/chess-shared'
import ChessBoard from '../../../shared/chess/ChessBoard'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
import { textToChapters } from '../utils/textToChapters'
import { applyToText, checkMoves, correctionList, exportPgn, initialMoves, normaliseSan, type CheckResult, type EditableMove } from './workbench'
import { APP_VERSION } from '../../../version'
import { useErrataContext } from '../errata/errataContext'
import { buildErrataEntry, coreMove, type ErrataEntry } from '../errata/errataFormat'
import { saveErrata, type SaveErrataResult } from '../errata/errataSource'
import { findOnlineReference, type OnlineLookupResult } from '../errata/onlineLookup'

const T: Record<Lang, Record<string, string>> = {
  en: {
    open: 'Correct this game', title: 'Correction workbench', close: 'Close',
    intro: 'Change, insert or remove moves, then check the game up to any point. Nothing is saved until you export.',
    checkAll: 'Check to the end', checkTo: 'Check up to move', ok: 'All moves are legal up to', end: 'the end', fails: 'does not fit here', alike: 'Legal moves that look like it:',
    use: 'Use', suggestion: 'The reader proposes', insert: 'Insert a move after', remove: 'Remove', move: 'Move', reset: 'Undo all changes',
    pgn: 'Export PGN', changes: 'Export corrections', reader: 'Open corrected text in the reader', changed: 'changes', none: 'No changes yet.',
    replaced: 'replace', inserted: 'insert', deleted: 'remove', at: 'at character',
    errata: 'Save as errata', errataHint: 'Errata record substituted moves only (no inserted or removed moves).',
    saved: 'Saved as errata:', noServer: 'No server: add this file to the resources repository at', json: 'Errata JSON',
    online: 'Search online', searching: 'Searching the Lichess masters database…', differs: 'move differs', differ: 'moves differ',
  },
  es: {
    open: 'Corregir esta partida', title: 'Banco de corrección', close: 'Cerrar',
    intro: 'Cambia, inserta o quita jugadas y comprueba la partida hasta el punto que quieras. Nada se guarda hasta que exportes.',
    checkAll: 'Comprobar hasta el final', checkTo: 'Comprobar hasta la jugada', ok: 'Todas las jugadas son legales hasta', end: 'el final', fails: 'no encaja aquí', alike: 'Jugadas legales parecidas:',
    use: 'Usar', suggestion: 'El lector propone', insert: 'Insertar una jugada después de', remove: 'Quitar', move: 'Jugada', reset: 'Deshacer todos los cambios',
    pgn: 'Exportar PGN', changes: 'Exportar correcciones', reader: 'Abrir el texto corregido en el lector', changed: 'cambios', none: 'Todavía no hay cambios.',
    replaced: 'reemplazar', inserted: 'insertar', deleted: 'quitar', at: 'en el carácter',
    errata: 'Guardar como errata', errataHint: 'Las erratas registran solo jugadas sustituidas (no insertadas ni quitadas).',
    saved: 'Guardada como errata:', noServer: 'Sin servidor: añade este archivo al repositorio de recursos en', json: 'JSON de la errata',
    online: 'Buscar en internet', searching: 'Buscando en la base de maestros de Lichess…', differs: 'jugada distinta', differ: 'jugadas distintas',
  },
  de: {
    open: 'Diese Partie korrigieren', title: 'Korrekturwerkbank', close: 'Schließen',
    intro: 'Züge ändern, einfügen oder entfernen und die Partie bis zu einem beliebigen Punkt prüfen. Gespeichert wird erst beim Export.',
    checkAll: 'Bis zum Ende prüfen', checkTo: 'Prüfen bis Zug', ok: 'Alle Züge sind legal bis', end: 'zum Ende', fails: 'passt hier nicht', alike: 'Ähnliche legale Züge:',
    use: 'Nehmen', suggestion: 'Der Leser schlägt vor', insert: 'Zug einfügen nach', remove: 'Entfernen', move: 'Zug', reset: 'Alle Änderungen verwerfen',
    pgn: 'PGN exportieren', changes: 'Korrekturen exportieren', reader: 'Korrigierten Text im Leser öffnen', changed: 'Änderungen', none: 'Noch keine Änderungen.',
    replaced: 'ersetzen', inserted: 'einfügen', deleted: 'entfernen', at: 'bei Zeichen',
    errata: 'Als Erratum speichern', errataHint: 'Errata enthalten nur ersetzte Züge (keine eingefügten oder entfernten).',
    saved: 'Als Erratum gespeichert:', noServer: 'Kein Server: diese Datei im Ressourcen-Repository ablegen unter', json: 'Erratum-JSON',
    online: 'Online suchen', searching: 'Suche in der Lichess-Meisterdatenbank…', differs: 'Zug weicht ab', differ: 'Züge weichen ab',
  },
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const label = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'}`

/**
 * Manual correction of a game the reader could not (or should not) repair by
 * itself: an editable move list with a legality check up to any point, and the
 * exports needed to fix the original text.
 */
export function CorrectionWorkbench({ games, text }: { games: RecognizedGame[]; text: string }) {
  const lang = useSettingsStore((s) => s.language)
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const orientation = useStudyBoardStore((s) => s.orientation)
  const openBook = useExternalBookStore((s) => s.open)
  const navigate = useNavigate()
  const gameIndex = Math.max(0, games.findIndex((g) => g.tree === activeGame))
  const game = games[gameIndex]
  const original = useMemo(() => (game ? initialMoves(text, game) : []), [text, game])
  const [open, setOpen] = useState(false)
  const [moves, setMoves] = useState<EditableMove[]>([])
  const [result, setResult] = useState<(CheckResult & { upTo: number }) | null>(null)
  const [upTo, setUpTo] = useState(1)
  const [seq, setSeq] = useState(0)
  const errataCtx = useErrataContext()
  const lichessToken = useSettingsStore((s) => s.lichessToken)
  const [saveResult, setSaveResult] = useState<SaveErrataResult | null>(null)
  const [online, setOnline] = useState<OnlineLookupResult | 'searching' | null>(null)

  const t = T[lang]
  if (!game) return null
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'

  const start = () => { setMoves(original.map((m) => ({ ...m }))); setResult(null); setUpTo(Math.ceil(original.length / 2)); setSaveResult(null); setOnline(null); setOpen(true) }
  const change = (next: EditableMove[]) => { setMoves(next); setResult(null); setSaveResult(null) }
  /** One move set to `san`, recording where the change comes from. */
  const setMove = (i: number, san: string, origin: EditableMove['origin'], evidence?: string) =>
    change(moves.map((x, j) => (j === i ? { ...x, san, origin, evidence } : x)))
  const check = (plies: number) => setResult({ ...checkMoves(moves.map((m) => m.san), { upTo: plies }), upTo: plies })
  const changes = correctionList(text, original, moves)
  const header = text.slice(gameIndex > 0 ? games[gameIndex - 1].charEnd : 0, game.charStart)
  const players = extractPlayers(text.slice(gameIndex > 0 ? games[gameIndex - 1].charEnd : 0, game.charEnd))
  const year = Number([...header.slice(-300).matchAll(/\b(1[5-9]\d\d|20\d\d)\b/g)].pop()?.[1]) || null

  // An errata entry needs the book and chapter, and substituted moves only.
  const errataEntry = (): ErrataEntry | null => {
    if (!errataCtx.bookTitle || errataCtx.chapter === null || changes.length === 0 || changes.some((c) => c.kind !== 'replaced')) return null
    const last = original[original.length - 1]?.source?.charEnd ?? game.charEnd
    return buildErrataEntry({
      book: { title: errataCtx.bookTitle, ...(errataCtx.bookId !== null ? { id: errataCtx.bookId } : {}) },
      chapter: errataCtx.chapter,
      gameIndex,
      game: { label: players.white && players.black ? `${players.white} – ${players.black}` : `Game ${gameIndex + 1}`, white: players.white ?? null, black: players.black ?? null },
      original: original.map((m) => ({ written: m.source?.written ?? m.san, san: m.san })),
      corrected: moves.map((m) => ({ san: normaliseSan(coreMove(m.san)), origin: m.origin, evidence: m.evidence })),
      text: text.slice(original[0]?.source?.charStart ?? game.charStart, last),
      appVersion: APP_VERSION,
    })
  }
  const entry = errataEntry()
  const saveAsErrata = async (e: ErrataEntry | null) => {
    if (e) setSaveResult(await saveErrata(e))
  }
  const searchOnline = async () => {
    setOnline('searching')
    const r = await findOnlineReference(
      { printed: original.map((m) => m.source?.written ?? m.san), white: players.white, black: players.black, year },
      { token: lichessToken || undefined },
    )
    setOnline(r)
    if (r.status === 'found' && r.changes.length) {
      change(moves.map((m, i) => {
        const c = r.changes.find((x) => x.ply === i + 1)
        return c ? { ...m, san: c.to, origin: 'online' as const, evidence: r.url } : m
      }))
    }
  }

  const status = (i: number) =>
    !result ? '' : result.error?.index === i ? 'border-red-500 bg-red-50' : i < result.legal ? 'border-emerald-400 bg-emerald-50' : ''
  const shownFen = result ? result.fens[result.fens.length - 1] : null

  return (
    <>
      <button className={button} onClick={start}>🛠 {t.open}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={t.title} className="relative flex max-h-[92vh] w-[min(64rem,96vw)] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t.title}</h2>
              <button onClick={() => setOpen(false)} aria-label={t.close} className="text-lg leading-none text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="text-xs text-slate-600">{t.intro}</p>

            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded border border-blue-700 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700" onClick={() => check(moves.length)}>
                {t.checkAll}
              </button>
              <label className="flex items-center gap-1 text-xs text-slate-700">
                {t.checkTo}
                <input
                  type="number" min={1} max={Math.ceil(moves.length / 2)} value={upTo} aria-label={t.checkTo}
                  onChange={(e) => setUpTo(Number(e.target.value))}
                  className="w-14 rounded border border-slate-300 px-1 py-0.5"
                />
              </label>
              <button className={button} onClick={() => check(Math.min(moves.length, upTo * 2))}>✓</button>
              <button className={button} onClick={start} disabled={changes.length === 0}>{t.reset}</button>
              <button className={button} aria-label={t.online} onClick={searchOnline} disabled={online === 'searching'}>🌐 {t.online}</button>
            </div>

            {online && (
              <p role="status" data-testid="online-status" className="text-xs text-slate-700">
                {online === 'searching' ? t.searching : online.status === 'found' ? (
                  <>
                    <a href={online.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                      {online.white} – {online.black}{online.year ? ` (${online.year})` : ''}
                    </a>
                    : {online.changes.length} {online.changes.length === 1 ? t.differs : t.differ}
                  </>
                ) : online.reason}
              </p>
            )}

            {result && (
              <div role="status" data-testid="check-result" className={`rounded border px-2 py-1.5 text-xs ${result.error ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                {result.error ? (
                  <>
                    <p><strong className="font-mono">{label(result.error.index)} {result.error.san}</strong> {t.fails}.</p>
                    {result.error.candidates.length > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-1">
                        {t.alike}
                        {result.error.candidates.map((c) => (
                          <button
                            key={c} className={button} aria-label={`${t.use} ${c}`}
                            onClick={() => setMove(result.error!.index, c, 'engine')}
                          >
                            {c}
                          </button>
                        ))}
                      </p>
                    )}
                  </>
                ) : (
                  <p>{t.ok} {result.upTo >= moves.length ? t.end : `${label(result.upTo - 1)} ${moves[result.upTo - 1]?.san}`}.</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row">
              <ol className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5">
                {moves.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-1">
                    <span className="w-9 shrink-0 text-right font-mono text-[11px] text-slate-500">{label(i)}</span>
                    <input
                      aria-label={`${t.move} ${label(i)}`}
                      value={m.san}
                      onChange={(e) => setMove(i, e.target.value, 'manual')}
                      title={m.suggestion ? `${t.suggestion} ${m.suggestion}` : m.source?.written}
                      className={`w-16 rounded border px-1 py-0.5 font-mono text-xs ${status(i) || (m.repaired ? 'border-amber-400 bg-amber-50' : 'border-slate-300')}`}
                    />
                    {m.suggestion && m.san !== m.suggestion && (
                      <button className={button} aria-label={`${t.use} ${m.suggestion}`} onClick={() => setMove(i, m.suggestion!, 'engine')}>
                        → {m.suggestion}
                      </button>
                    )}
                    <button
                      className="text-xs text-slate-400 hover:text-blue-700" title={`${t.insert} ${label(i)}`} aria-label={`${t.insert} ${label(i)}`}
                      onClick={() => { change([...moves.slice(0, i + 1), { id: `new-${seq}`, san: '' }, ...moves.slice(i + 1)]); setSeq(seq + 1) }}
                    >
                      ＋
                    </button>
                    <button
                      className="text-xs text-slate-400 hover:text-red-700" title={`${t.remove} ${label(i)}`} aria-label={`${t.remove} ${label(i)}`}
                      onClick={() => change(moves.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
              {shownFen && (
                <div className="w-56 shrink-0 self-start">
                  <ChessBoard fen={shownFen} orientation={orientation} hideLabels />
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{changes.length} {t.changed}</p>
              {changes.length === 0 ? <p className="text-xs text-slate-500">{t.none}</p> : (
                <ul className="mt-1 text-xs text-slate-700" data-testid="correction-list">
                  {changes.map((c, i) => (
                    <li key={i} className="font-mono">
                      {t[c.kind]} {c.written ?? ''}{c.kind === 'replaced' ? ' → ' : ''}{c.corrected ?? ''} <span className="text-slate-400">({t.at} {c.charStart})</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className={button} onClick={() => download('game.pgn', exportPgn(moves.map((m) => m.san), players), 'application/x-chess-pgn')}>{t.pgn}</button>
                <button className={button} disabled={changes.length === 0} onClick={() => download('corrections.json', JSON.stringify({ game: gameIndex + 1, players, corrections: changes }, null, 2), 'application/json')}>
                  {t.changes}
                </button>
                <button
                  className={button} disabled={!entry} title={entry ? undefined : t.errataHint}
                  onClick={() => saveAsErrata(entry)}
                >
                  {t.errata}
                </button>
                <button
                  className={button} disabled={changes.length === 0}
                  onClick={() => {
                    // Accepting the correction also files it as errata.
                    void saveAsErrata(entry)
                    const { title, chapters } = textToChapters(applyToText(text, original, moves))
                    openBook(title, chapters)
                    setOpen(false)
                    navigate(`/read/${EXTERNAL_BOOK_ID}`)
                  }}
                >
                  {t.reader}
                </button>
              </div>
              {saveResult && (
                <div role="status" data-testid="errata-status" className="mt-2 text-xs text-slate-700">
                  {saveResult.saved ? <p>{t.saved} <code>{saveResult.path}</code></p> : (
                    <>
                      <p>{t.noServer} <code>{saveResult.path}</code>{saveResult.reason ? ` (${saveResult.reason})` : ''}</p>
                      <textarea readOnly aria-label={t.json} value={saveResult.json} rows={8} className="mt-1 w-full rounded border border-slate-300 p-1 font-mono text-[11px]" />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
