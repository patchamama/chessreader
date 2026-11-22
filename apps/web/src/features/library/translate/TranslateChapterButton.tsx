import { useEffect, useMemo, useRef } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { useLlm } from '../../../shared/llm/useLlm'
import { withProgress } from '../../../shared/layout/busyStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { TARGET_LANGS, langName, type TargetLang } from '../../comments/commentPrompts'
import { loadCommentGame, saveBookGame } from '../../comments/commentsApi'
import { detectLanguage } from './detectLanguage'
import { originalGamePgn, translateGameText } from './translateGame'
import { bookGameId, pgnToTranslatedText } from './storedTranslation'

interface Props {
  games: RecognizedGame[]
  /** The recognition text of the chapter (the one the games were recognised on). */
  text: string
  bookTitle: string
  bookAuthor?: string | null
  /** The language the book is written in, when it is known; otherwise read from the text. */
  bookLanguage?: string | null
  chapter: number
  /** The user may keep the game in the shared commentary database (admin). */
  canSave: boolean
  /** The server's commentary database can be asked for games kept translated. */
  serverSession?: boolean
  /** The reader already shows this game rewritten (a comment again, a translation). */
  isRewritten?: (gameIndex: number) => boolean
  /** A game's translated text, ready to show in place of the book's. */
  onApplied: (gameIndex: number, rewrite: { text: string; leading: number }) => void
}

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Translate the comments of the chapter's games into the language of the
 * interface (S1): one comment at a time with a chess prompt, shown in place of
 * the book's text, and kept with their originals in the commentary database
 * together with the game's PGN in both languages (S2, S3). Offered only when
 * an AI model is set up and the text is in another language than the interface.
 */
export function TranslateChapterButton({ games, text, bookTitle, bookAuthor = null, bookLanguage, chapter, canSave, serverSession = false, isRewritten, onApplied }: Props) {
  const llm = useLlm()
  const target = useSettingsStore((s) => s.language)
  const source = useMemo(() => {
    if (bookLanguage && (TARGET_LANGS as readonly string[]).includes(bookLanguage)) return bookLanguage as TargetLang
    return detectLanguage(text)
  }, [bookLanguage, text])
  // A game kept translated in the database shows translated by itself (S2): no AI, no click.
  const asked = useRef(new Set<string>())
  const rewrittenRef = useRef(isRewritten)
  rewrittenRef.current = isRewritten
  const appliedRef = useRef(onApplied)
  appliedRef.current = onApplied
  useEffect(() => {
    if (!serverSession || !source || source === target || !bookTitle || games.length === 0) return
    let after = 0
    games.forEach((game, i) => {
      const previous = after
      after = game.charEnd
      const key = `${bookTitle}|${chapter}|${i}|${target}|${text.length}`
      if (asked.current.has(key) || rewrittenRef.current?.(i)) return
      asked.current.add(key)
      const id = bookGameId(bookTitle, chapter, originalGamePgn(text, game, game.tree.startFen || STANDARD_FEN, previous))
      loadCommentGame(id).then((stored) => {
        const pgn = stored.translations?.[target]
        if (pgn && !rewrittenRef.current?.(i)) appliedRef.current(i, pgnToTranslatedText(pgn))
      }).catch(() => { /* the database does not know this game: the book's text stays */ })
    })
  }, [serverSession, source, target, bookTitle, chapter, games, text])

  const offered = llm.available && games.length > 0 && !!source && source !== target && (TARGET_LANGS as readonly string[]).includes(target)
  if (!offered || !source) return null
  const to = target as TargetLang

  const run = () => {
    void withProgress(`Translating the comments to ${langName(to)}`, async (report, signal) => {
      let previousEnd = 0
      for (let i = 0; i < games.length; i++) {
        const game = games[i]
        const result = await translateGameText(llm.complete, text, game, to, game.tree.startFen || STANDARD_FEN, {
          signal, after: previousEnd, onProgress: (done, total) => report((i + (total ? done / total : 1)) / games.length),
        })
        previousEnd = game.charEnd
        if (result.comments.every((c) => c.translated === null)) continue
        onApplied(i, { text: result.text, leading: result.leading })
        if (!canSave) continue
        const pairs = result.comments
        try {
          await saveBookGame({
            book: { title: bookTitle, author: bookAuthor, lang: source }, chapter,
            game: {
              label: `Game ${i + 1}`, pgn: result.originalPgn,
              comments: pairs.map((c) => ({ hash: c.hash, key: c.key, ply: c.ply, move: c.move, san: c.san, text: c.original })),
              translations: { [to]: { pgn: result.pgn, comments: pairs.map((c) => c.translated ?? '') } },
            },
          })
        } catch (e) {
          console.warn('[TranslateChapterButton] could not keep the game in the database', e)
        }
      }
    }, { cancellable: true }).catch((e: unknown) => console.warn('[TranslateChapterButton] translation stopped', e))
  }

  const label = `Translate the comments to ${langName(to)} with AI`
  return (
    <button
      type="button"
      onClick={run}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-300 bg-violet-50 text-violet-700 shadow-sm transition hover:bg-violet-100"
    >
      <span aria-hidden className="text-sm font-bold">文A</span>
    </button>
  )
}
