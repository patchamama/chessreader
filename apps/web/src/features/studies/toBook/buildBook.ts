import { hasPieces, type StudyChapter, type StudyMove } from './studyChapters'
import { diagramSvgFile, textToBase64 } from './diagramSvg'
import { engineMark } from './engineQuality'
import { diagramEvalText } from '../../library/diagramEval/diagramEvalText'
import type { DiagramEvaluation } from '../../library/diagramEval/diagramEvalStore'
import type { DiagramStyle } from '../../library/utils/boardSvg'
import { parseAiText, translatePrompt, validateRewrite, type TargetLang } from '../../comments/commentPrompts'
import type { Complete } from '../../library/translate/translateGame'

export interface BuildOptions {
  title: string
  author: string
  /** Language of the book (and of the translation when `translate`). */
  language: TargetLang
  /** Translate the comments and the chapter titles into `language`. */
  translate: boolean
  /** A diagram of the starting position of each chapter that has pieces. */
  startDiagrams: boolean
  /** An automatic diagram before the comment after a good (!, !!) / bad (?, ??) main-line move. */
  autoGood: boolean
  autoBad: boolean
  /** Also find good and bad moves with the engine for the moves the author did not mark. */
  engineQuality: boolean
  /** The engine's evaluation under each diagram. */
  engineEval: boolean
  diagramStyle: DiagramStyle
  /** The checkbox of a commented main-line move (by its id): true = diagram, false = none. */
  overrides: Record<string, boolean>
}

export interface BuildDeps {
  evaluate: (fen: string) => Promise<DiagramEvaluation>
  complete?: Complete
  diagramSvg?: (fen: string, style: DiagramStyle) => string
}

export type Block =
  | { type: 'p' | 'h2' | 'note'; text: string }
  | { type: 'img'; image: string; alt: string; fen: string }

/** What the API turns into an EPUB (see StudyEpubBuilder). */
export interface StudyBookPayload {
  title: string
  author: string
  language: string
  chapters: { title: string; blocks: Block[] }[]
  images: { name: string; mime: string; data: string }[]
  cover: { mime: string; data: string } | null
}

export interface BuiltBook extends StudyBookPayload { warnings: string[] }

/** A commented main-line move: the unit of the per-move diagram checklist. */
export interface Candidate { id: string; chapterIndex: number; chapter: string; move: StudyMove }

export function candidateMoves(chapters: StudyChapter[]): Candidate[] {
  return chapters.flatMap((chapter, chapterIndex) => chapter.moves
    .filter((move) => move.comments.length > 0)
    .map((move) => ({ id: `${chapterIndex}:${move.ply}`, chapterIndex, chapter: chapter.name, move })))
}

/** Whether a move gets a diagram: its checkbox when set, else the good/bad switches. */
export function isIncluded(c: Candidate, o: Pick<BuildOptions, 'autoGood' | 'autoBad' | 'overrides'>, engine?: 'good' | 'bad' | null): boolean {
  const manual = o.overrides[c.id]
  if (manual !== undefined) return manual
  const mark = c.move.mark ?? engine ?? null
  return (mark === 'good' && o.autoGood) || (mark === 'bad' && o.autoBad)
}

const cancelled = () => new DOMException('Conversion cancelled', 'AbortError')
const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
const evalLang = (l: TargetLang) => (l === 'fr' ? 'en' : l)

/**
 * Assemble the book of a study: a chapter per study chapter (title, diagram of
 * its starting position, comments as paragraphs, moves as text), the
 * automatic and chosen diagrams before their comments, and the engine
 * evaluation under each diagram. Engine and model come in through `deps`.
 */
export async function buildStudyBook(
  studyChapters: StudyChapter[],
  o: BuildOptions,
  deps: BuildDeps,
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<BuiltBook> {
  const warnings: string[] = []
  const candidates = candidateMoves(studyChapters)
  const checkOverride = (c: Candidate) => o.overrides[c.id] === undefined
  const engineChecked = o.engineQuality ? candidates.filter((c) => c.move.mark === null && checkOverride(c)) : []
  const translations = o.translate ? studyChapters.reduce((n, c) => n + 1 + c.intro.length + c.moves.reduce((m, x) => m + x.comments.length, 0), 0) : 0
  const diagrams = studyChapters.length + candidates.length
  const total = translations + engineChecked.length * 2 + (o.engineEval ? diagrams : 0) + 1
  let done = 0
  const step = () => hooks.onProgress?.(Math.min(++done, total), total)
  const check = () => { if (hooks.signal?.aborted) throw cancelled() }

  const evals = new Map<string, DiagramEvaluation | null>()
  const evaluate = async (fen: string): Promise<DiagramEvaluation | null> => {
    const k = positionKey(fen)
    if (evals.has(k)) return evals.get(k) ?? null
    check()
    try { evals.set(k, await deps.evaluate(fen)) } catch (e) {
      evals.set(k, null)
      warnings.push(`Engine evaluation failed: ${(e as Error).message}`)
    }
    return evals.get(k) ?? null
  }

  // Engine verdicts for the moves the author left unmarked.
  const engineMarks = new Map<string, 'good' | 'bad' | null>()
  for (const c of engineChecked) {
    const before = await evaluate(c.move.fenBefore); step()
    const after = await evaluate(c.move.fenAfter); step()
    engineMarks.set(c.id, before && after ? engineMark(before, after, c.move.uci) : null)
  }

  const translate = async (text: string, fen: string, move: string): Promise<string> => {
    check()
    try {
      if (!deps.complete) throw new Error('no AI model is set up')
      const out = parseAiText((await deps.complete(translatePrompt({ text, lang: '', fen, move }, o.language))).text)
      const issues = validateRewrite(text, out)
      if (issues.length) { warnings.push(`${move || 'start'}: ${issues.join('; ')} (kept the original)`); return text }
      return out
    } catch (e) {
      if (hooks.signal?.aborted) throw cancelled()
      warnings.push(`${move || 'start'}: ${(e as Error).message} (kept the original)`)
      return text
    } finally { step() }
  }

  const svgOf = deps.diagramSvg ?? diagramSvgFile
  const images = new Map<string, string>()
  const imageFiles: BuiltBook['images'] = []
  const imageName = (fen: string) => {
    const k = positionKey(fen)
    let name = images.get(k)
    if (!name) {
      name = `d${images.size + 1}`
      images.set(k, name)
      imageFiles.push({ name, mime: 'image/svg+xml', data: textToBase64(svgOf(fen, o.diagramStyle)) })
    }
    return name
  }
  const diagram = async (fen: string, alt: string): Promise<Block[]> => {
    const blocks: Block[] = [{ type: 'img', image: imageName(fen), alt, fen }]
    if (o.engineEval) {
      const e = await evaluate(fen); step()
      if (e) blocks.push({ type: 'note', text: diagramEvalText(fen, e, evalLang(o.language)).trim() })
    }
    return blocks
  }

  const chapters: BuiltBook['chapters'] = []
  for (const [chapterIndex, chapter] of studyChapters.entries()) {
    check()
    const blocks: Block[] = []
    const title = o.translate ? await translate(chapter.name, chapter.startFen, '') : chapter.name
    if (o.startDiagrams && hasPieces(chapter.startFen)) blocks.push(...await diagram(chapter.startFen, 'Starting position'))
    for (const c of chapter.intro) blocks.push({ type: 'p', text: o.translate ? await translate(c, chapter.startFen, '') : c })

    let pending: string[] = []
    const flush = () => { if (pending.length) blocks.push({ type: 'p', text: pending.join(' ') }); pending = [] }
    for (const move of chapter.moves) {
      pending.push(move.text, ...move.variations)
      if (!move.comments.length) continue
      flush()
      const cand: Candidate = { id: `${chapterIndex}:${move.ply}`, chapterIndex, chapter: chapter.name, move }
      if (isIncluded(cand, o, engineMarks.get(cand.id))) blocks.push(...await diagram(move.fenAfter, `Position after ${move.text}`))
      for (const text of move.comments) blocks.push({ type: 'p', text: o.translate ? await translate(text, move.fenAfter, move.text) : text })
    }
    flush()
    if (!blocks.length) blocks.push({ type: 'p', text: '—' })
    chapters.push({ title, blocks })
  }
  step()
  return { title: o.title, author: o.author, language: o.language, chapters, images: imageFiles, cover: null, warnings }
}
