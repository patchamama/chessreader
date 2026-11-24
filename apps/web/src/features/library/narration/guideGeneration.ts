import type { GameNode, GameTree, RecognizedGame } from '@chess-ebook/chess-shared'
import { nodeBeforeOffset } from '../utils/proseText'
import { relabelTask, withProgress } from '../../../shared/layout/busyStore'
import { setCommentActions } from '../../comments/commentsApi'
import { lookupPositionComments, type HumanComment } from '../commentdb/commentLookup'
import { proposeActions, type Complete } from './actionsAi'
import { sameGuideText } from './guideChips'
import { guideKey, normGuideText, useGuideStore } from './guideStore'

/**
 * Paragraph-by-paragraph generation of the narration guides of a chapter (ai-narration-guides S2, S3):
 * for each prose paragraph that follows a move (and each comment quoted from the database) the AI
 * gets everything it needs — the text, the position, what every piece can reach, the moves before
 * and after, the engine's lines when there are — and what it answers is checked and kept.
 */

export interface GuideJob {
  key: string
  text: string
  fen: string
  context: { previous?: string; next?: string }
  /** The comment of the database this paragraph is (id and the actions it already has). */
  comment?: { id: number; actions?: string }
  /** The reader already has a guide for it. */
  hasGuide?: boolean
}

const MIN_WORDS = 4
const MIN_LETTERS = 20
const CONTEXT_BEFORE = 6
const CONTEXT_AFTER = 4

/** Moves as a book writes them: "11.Nf3 Nc6 12.Bb5 a6", "11...Nc6" when it starts on Black's move. */
export function formatMoves(nodes: GameNode[]): string {
  return nodes.map((n, i) => (n.color === 'white' ? `${n.moveNumber}.${n.san}` : i === 0 ? `${n.moveNumber}...${n.san}` : n.san)).join(' ')
}

function movesAround(tree: GameTree, node: GameNode): { previous?: string; next?: string } {
  const before: GameNode[] = []
  for (let n: GameNode | undefined = node; n && before.length < CONTEXT_BEFORE; n = n.parentId ? tree.nodes.get(n.parentId) : undefined) before.unshift(n)
  const at = tree.mainline.indexOf(node.id)
  const after = at >= 0 ? tree.mainline.slice(at + 1, at + 1 + CONTEXT_AFTER).map((id) => tree.nodes.get(id)!).filter(Boolean) : []
  return { previous: formatMoves(before), ...(after.length ? { next: formatMoves(after) } : {}) }
}

/** The prose paragraphs of the games' text that follow a move and say something (not the move lines, not a heading). */
export function collectParagraphJobs(games: RecognizedGame[], text: string, o: { bookId: number | string; chapter: number }): GuideJob[] {
  const jobs: GuideJob[] = []
  const seen = new Set<string>()
  games.forEach((game, gi) => {
    const to = gi + 1 < games.length ? games[gi + 1].charStart : text.length
    const { tree } = game
    const mainline = new Set(tree.mainline)
    let lineStart = game.charStart
    for (const line of text.slice(game.charStart, to).split('\n')) {
      const start = lineStart
      const end = start + line.length
      lineStart = end + 1
      const prose = normGuideText(line)
      if (!prose || prose.split(' ').length < MIN_WORDS || prose.replace(/[^\p{L}]/gu, '').length < MIN_LETTERS) continue
      // A line with moves of the game is a move line: its text is not a comment of its own.
      let movesHere = false
      let last: GameNode | null = null
      for (const n of tree.nodes.values()) {
        if (n.charStart === undefined || n.charEnd === undefined || n.invalid) continue
        if (n.charStart < end && n.charEnd > start) movesHere = true
      }
      if (movesHere) continue
      const before = nodeBeforeOffset(tree, start)
      // The position is the last move of the game written before the paragraph (not a quoted variation).
      for (let n: GameNode | null = before; n; n = n.parentId ? tree.nodes.get(n.parentId) ?? null : null) {
        if (mainline.has(n.id)) { last = n; break }
      }
      if (!last) continue
      const key = guideKey(o.bookId, o.chapter, prose)
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push({ key, text: prose, fen: last.fen, context: movesAround(tree, last) })
    }
  })
  return jobs
}

export interface GenerateGuidesOptions {
  games: RecognizedGame[]
  /** The recognition text of the chapter (the one the games were recognised on). */
  text: string
  bookId: number | string
  chapter: number
  complete: Complete
  /** The user may write the guide of a database comment into the database. */
  isAdmin: boolean
  /** Make the guides again, also where there is one. */
  redo?: boolean
  /** Comments of the database quoted in the chapter (text and the position they talk about). */
  quotes?: { text: string; fen: string }[]
  /** Engine lines of a position as text; optional, never required. */
  evalsFor?: (fen: string) => Promise<string[] | undefined>
  label?: string
}

export interface GenerateGuidesResult {
  total: number
  generated: number
  /** The model answered but no action was valid. */
  empty: number
  failed: number
  skipped: number
  cancelled: boolean
  savedToDatabase: number
  firstError?: string
}

async function quoteJobs(quotes: { text: string; fen: string }[], o: { bookId: number | string; chapter: number }, taken: Set<string>): Promise<GuideJob[]> {
  const jobs: GuideJob[] = []
  for (const q of quotes) {
    const text = normGuideText(q.text)
    const key = guideKey(o.bookId, o.chapter, text)
    if (!text || taken.has(key)) continue
    taken.add(key)
    let comment: GuideJob['comment']
    try {
      const own = (await lookupPositionComments(q.fen)).find((c: HumanComment) => c.id !== undefined && sameGuideText(c.text, text))
      if (own?.id !== undefined) comment = { id: own.id, ...(own.actions ? { actions: own.actions } : {}) }
    } catch { /* no database: the guide is kept locally */ }
    jobs.push({ key, text, fen: q.fen, context: {}, ...(comment ? { comment } : {}) })
  }
  return jobs
}

/** Generate the guides of a chapter paragraph by paragraph, with a cancellable progress bar in the status footer. */
export function generateGuidesForChapter(o: GenerateGuidesOptions): Promise<GenerateGuidesResult> {
  const base = o.label ?? 'Generating narration guides'
  return withProgress(base, async (report, signal) => {
    const paragraphs = collectParagraphJobs(o.games, o.text, o)
    const jobs = [...paragraphs, ...(await quoteJobs(o.quotes ?? [], o, new Set(paragraphs.map((j) => j.key))))]
    const result: GenerateGuidesResult = { total: jobs.length, generated: 0, empty: 0, failed: 0, skipped: 0, cancelled: false, savedToDatabase: 0 }
    let label = base
    for (const [i, job] of jobs.entries()) {
      if (signal.aborted) { result.cancelled = true; break }
      const have = job.comment?.actions || useGuideStore.getState().guides[job.key]?.actions
      if (have && !o.redo) {
        result.skipped++
      } else {
        try {
          let evals: string[] | undefined
          try { evals = await o.evalsFor?.(job.fen) } catch { evals = undefined }
          const proposal = await proposeActions(o.complete, {
            text: job.text, fen: job.fen, ...(evals?.length ? { evals } : {}),
            ...(job.context.previous || job.context.next ? { context: job.context } : {}),
          })
          if (!proposal.actions) {
            result.empty++
          } else if (job.comment && o.isAdmin) {
            await setCommentActions(job.comment.id, proposal.actions)
            result.savedToDatabase++
            result.generated++
          } else {
            useGuideStore.getState().set(job.key, { text: job.text, fen: job.fen, actions: proposal.actions })
            result.generated++
          }
        } catch (e) {
          result.failed++
          result.firstError ??= e instanceof Error ? e.message : String(e)
        }
      }
      report(i + 1, jobs.length)
      const next = `${base} ${i + 1}/${jobs.length}`
      relabelTask(label, next)
      label = next
    }
    if (signal.aborted) result.cancelled = true
    return result
  }, { cancellable: true })
}
