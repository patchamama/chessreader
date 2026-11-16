import { useEffect, useMemo } from 'react'
import type { Lang, RecognizedGame } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useReviewStore } from '../review/reviewStore'
import { findProblems, hintFor, type ProblemReason } from './problems'
import { MAX_ATTEMPTS, useProblemStore } from './problemStore'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Problem mode', start: 'Start problems', stop: 'Stop', none: 'No key positions found in this game. An engine review adds more.',
    found: 'key positions', playing: 'Playing up to the next key position…', white: 'White to move', black: 'Black to move',
    ask: 'Find the move played in the game.', attempts: 'attempts left', hint: 'Hint', solution: 'Show the move',
    next: 'Next problem', finish: 'Finish', solved: 'Correct!', revealed: 'The move was', wrong: 'Not that one — try again.',
    done: 'Done', of: 'of', problem: 'Problem',
    marked: 'a move the text marks as strong', commented: 'a move with a long comment', variations: 'a position with several lines', engine: 'a move the engine rates as strong',
  },
  es: {
    title: 'Modo problema', start: 'Empezar problemas', stop: 'Parar', none: 'No se encontraron posiciones clave en esta partida. Una revisión con el motor agrega más.',
    found: 'posiciones clave', playing: 'Reproduciendo hasta la próxima posición clave…', white: 'Juegan blancas', black: 'Juegan negras',
    ask: 'Encuentra la jugada de la partida.', attempts: 'intentos restantes', hint: 'Pista', solution: 'Mostrar la jugada',
    next: 'Siguiente problema', finish: 'Terminar', solved: '¡Correcto!', revealed: 'La jugada era', wrong: 'Esa no — prueba otra vez.',
    done: 'Terminado', of: 'de', problem: 'Problema',
    marked: 'una jugada que el texto marca como fuerte', commented: 'una jugada con un comentario largo', variations: 'una posición con varias líneas', engine: 'una jugada que el motor valora como fuerte',
  },
  de: {
    title: 'Aufgabenmodus', start: 'Aufgaben starten', stop: 'Stopp', none: 'Keine Schlüsselstellungen in dieser Partie gefunden. Eine Engine-Analyse fügt weitere hinzu.',
    found: 'Schlüsselstellungen', playing: 'Spiele bis zur nächsten Schlüsselstellung…', white: 'Weiß am Zug', black: 'Schwarz am Zug',
    ask: 'Finde den Zug der Partie.', attempts: 'Versuche übrig', hint: 'Tipp', solution: 'Zug zeigen',
    next: 'Nächste Aufgabe', finish: 'Beenden', solved: 'Richtig!', revealed: 'Der Zug war', wrong: 'Der nicht — versuch es noch einmal.',
    done: 'Fertig', of: 'von', problem: 'Aufgabe',
    marked: 'ein Zug, den der Text als stark markiert', commented: 'ein Zug mit langem Kommentar', variations: 'eine Stellung mit mehreren Varianten', engine: 'ein Zug, den die Engine als stark bewertet',
  },
}

/**
 * Problem mode for the game on the board: it is played up to each important
 * position and the reader has to find the move — with attempts and hints.
 */
export function ProblemPanel({ games, text }: { games: RecognizedGame[]; text: string }) {
  const lang = useSettingsStore((s) => s.language)
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const reviews = useReviewStore((s) => s.byTree)
  const p = useProblemStore()
  const { stop } = p
  const game = games.find((g) => g.tree === activeGame) ?? games[0]
  const problems = useMemo(
    () => (game ? findProblems(text, game, reviews.get(game.tree)?.review.moves) : []),
    [text, game, reviews],
  )
  // Leave problem mode when the chapter (and its games) goes away.
  useEffect(() => () => stop(), [games, stop])

  const t = T[lang]
  if (!game) return null
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const running = p.phase !== 'idle' && p.tree === game.tree
  const problem = running && p.phase !== 'finished' ? p.problems[p.index] : null
  const node = problem ? game.tree.nodes.get(problem.nodeId) : undefined
  const last = running && p.index >= p.problems.length - 1

  return (
    <section aria-label={t.title} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">{t.title}</h3>
        <span className="ml-auto text-[11px] text-slate-500">
          {running && p.phase !== 'finished' ? `${t.problem} ${p.index + 1} ${t.of} ${p.problems.length}` : `${problems.length} ${t.found}`}
        </span>
      </div>

      {!running && (
        problems.length === 0
          ? <p className="text-xs text-slate-500">{t.none}</p>
          : (
            <button
              className="rounded border border-amber-700 bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
              onClick={() => p.start(game.tree, problems)}
            >
              ▶ {t.start}
            </button>
          )
      )}

      {running && p.phase === 'playing' && <p role="status" className="text-xs text-slate-600">{t.playing}</p>}

      {running && node && p.phase === 'solving' && (
        <div role="status" className="text-xs text-slate-800">
          <p className="font-semibold">{node.color === 'white' ? t.white : t.black}. {t.ask}</p>
          <p className="text-slate-500">({t[problem!.reason as ProblemReason]})</p>
          <p className="mt-1">
            {MAX_ATTEMPTS - p.attempts} {t.attempts}
            {p.attempts > 0 && <span className="ml-2 text-red-700">{t.wrong}</span>}
          </p>
          {p.hintLevel > 0 && (
            <p data-testid="problem-hint" className="mt-1 rounded bg-white px-2 py-1 text-amber-900">
              💡 {hintFor(game.tree, node, p.hintLevel as 1 | 2, lang)}
            </p>
          )}
        </div>
      )}

      {running && node && (p.phase === 'solved' || p.phase === 'revealed') && (
        <p role="status" className={`text-xs font-semibold ${p.phase === 'solved' ? 'text-emerald-700' : 'text-red-700'}`}>
          {p.phase === 'solved' ? t.solved : t.revealed}{' '}
          <span className="font-mono">{node.moveNumber}{node.color === 'white' ? '.' : '...'} {node.rawSan ?? node.san}</span>
        </p>
      )}

      {running && p.phase === 'finished' && (
        <p role="status" className="text-xs font-semibold text-slate-800">{t.done}: {p.solved} {t.of} {p.problems.length}</p>
      )}

      {running && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.phase === 'solving' && (
            <>
              <button className={button} onClick={p.hint} disabled={p.hintLevel >= 2}>💡 {t.hint}</button>
              <button className={button} onClick={p.reveal}>{t.solution}</button>
            </>
          )}
          {(p.phase === 'solved' || p.phase === 'revealed') && (
            <button className={button} onClick={p.next}>{last ? t.finish : t.next}</button>
          )}
          <button className={button} onClick={p.stop}>⏹ {t.stop}</button>
        </div>
      )}
    </section>
  )
}
