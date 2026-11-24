import { buildCommentaryRequest, type GameReview, type PlyInput } from '@chess-ebook/chess-shared'
import { translateGamePrompt, translatePrompt, universalPrompt, type PromptComment } from '../../features/comments/commentPrompts'
import { actionsPrompt } from '../../features/library/narration/actionsAi'
import { describePrompt, fenPrompt, redrawPrompt } from '../../features/library/imageAi/prompts'
import { RANK_SYSTEM, rankPrompt } from '../../features/library/wrongMove/wrongMove'
import { momentCommentPrompt } from '../../features/library/review/aiMoments'
import { momentFacts } from '../../features/library/review/momentFacts'
import { buildPlies, flat } from '../../features/library/review/testPlies'
import { PARAGRAPH_EDIT_SYSTEM } from '../../features/library/edit/paragraphPrompt'
import { TEST_PROMPT, VISION_PROBE_PROMPT } from './llmClient'
import type { LlmRequest } from './types'

/**
 * Every prompt the app sends to an AI model, built by the REAL builders from
 * sample inputs, so the "All AI prompts" modal cannot drift from what is sent.
 * To list a new prompt add ONE entry to ENTRIES below.
 */
export interface PromptEntry {
  id: string
  title: string
  /** When the app sends it, in one sentence. */
  situation: string
  group: string
  /** The shape of the answer the prompt asks for. */
  answer: string
  /** The request, built with sample inputs. */
  build: () => LlmRequest
}

const SAMPLE_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'
const SAMPLE: PromptComment = { text: 'White threatens 4. Qxf7# at once; Black must defend with 4...g6.', lang: 'en', fen: SAMPLE_FEN, move: '3...Nf6' }
const SAMPLE_IMAGE = 'data:image/png;base64,<image of the figure>'

const TEXT_ANSWER = '{"text": "<the new comment>"}'

function sampleCommentary(): LlmRequest {
  const plies = [{ nodeId: '1', san: 'e4', color: 'white', moveNumber: 1, from: 'e2', to: 'e4', fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' }] as unknown as PlyInput[]
  const review = {
    moves: [{ nodeId: '1', san: 'e4', color: 'white', moveNumber: 1, winBefore: 50, winAfter: 52, loss: 0, accuracy: 100, motifs: [] }],
    white: { accuracy: 100 }, black: { accuracy: 100 }, keyMoments: [],
  } as unknown as GameReview
  const r = buildCommentaryRequest(plies, review, { lang: 'en', white: 'White player', black: 'Black player' })
  return { system: r.system, messages: [{ role: 'user', text: r.user }], json: true }
}

const ENTRIES: PromptEntry[] = [
  { id: 'comment-universal', group: 'Comments database', title: 'Make a comment universal',
    situation: 'Sent when you ask the AI to rewrite a database comment so it fits any game reaching the position (also for borrowed comments of the reader).',
    answer: TEXT_ANSWER, build: () => universalPrompt(SAMPLE) },
  { id: 'comment-translate', group: 'Comments database', title: 'Translate a comment',
    situation: 'Sent when you translate one comment (database, book translation or borrowed comment) into another language.',
    answer: TEXT_ANSWER, build: () => translatePrompt(SAMPLE, 'es') },
  { id: 'game-translate', group: 'Comments database', title: 'Translate every comment of a game',
    situation: 'Sent when you translate all the comments of one game in a single request.',
    answer: '{"comments": ["…", …]}', build: () => translateGamePrompt(['White threatens mate.', 'Black defends with g6.'], 'de') },
  { id: 'narration-actions', group: 'Narration', title: 'Board actions for a comment',
    situation: 'Sent when the AI writes the board animation (arrows, squares, diagonals) that goes with a comment read aloud.',
    answer: '{"actions": "0Diagonal:c8-h3, 13Arrow:f7-f5"}',
    build: () => actionsPrompt({ text: SAMPLE.text, fen: SAMPLE_FEN, evals: ['+1.2 4.Qxf7#'] }) },
  { id: 'moment-comment', group: 'Game review', title: 'Comment a key moment of a game (AI)',
    situation: 'Sent once per key moment when you ask the AI to comment the key moments of a game: the engine lines, the material of each side and the sacrifices are given to it as facts.',
    answer: '{"comment": "<1-3 sentences in the chosen language>"}',
    build: () => momentCommentPrompt(momentFacts(buildPlies(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5'], flat(10, 20)), 6), { lang: 'en', level: 2 }) },
  { id: 'paragraph-edit', group: 'Editing', title: 'Suggest a corrected paragraph',
    situation: 'Sent when you ask the AI to correct a paragraph of the book in edit mode.',
    answer: 'The corrected paragraph, as plain text.',
    build: () => ({ system: PARAGRAPH_EDIT_SYSTEM, messages: [{ role: 'user', text: 'The knigt on f3 attacks the pown on e5.' }] }) },
  { id: 'connection-test', group: 'Settings', title: 'Test of the AI connection',
    situation: 'Sent by the Test button of the AI assistant settings, to check that the model answers.',
    answer: 'The word OK.', build: () => ({ messages: [{ role: 'user', text: TEST_PROMPT }] }) },
  { id: 'vision-probe', group: 'Settings', title: 'Test that the model can see images',
    situation: 'Sent by the Test button together with a tiny red image, to find out whether the model reads images.',
    answer: 'One word: the colour.', build: () => ({ messages: [{ role: 'user', text: VISION_PROBE_PROMPT }] }) },
  { id: 'image-describe', group: 'Book images', title: 'Extract a table or flowchart',
    situation: 'Sent when you ask the AI to extract the information of a figure (table, flowchart) as HTML.',
    answer: 'An HTML fragment (table, list, p, h4…), no SVG or images.', build: () => describePrompt(SAMPLE_IMAGE) },
  { id: 'image-redraw', group: 'Book images', title: 'Redraw an unclear figure',
    situation: 'Sent when you ask the AI to redraw an unclear figure as clean markup.',
    answer: 'An HTML fragment (table or nested list), no SVG.', build: () => redrawPrompt(SAMPLE_IMAGE) },
  { id: 'image-fen', group: 'Book images', title: 'Read a chess diagram',
    situation: 'Sent when the AI reads a diagram image square by square to find its position.',
    answer: '{"sideToMove": "w" | "b" | null, "squares": [{"square": "a8", "piece": "r", "confidence": 0.9}, …64]}', build: () => fenPrompt(SAMPLE_IMAGE) },
  { id: 'game-commentary', group: 'Game review', title: 'Commentary of a whole game',
    situation: 'Sent when you ask the AI to comment a reviewed game from the engine facts (the sample is a one-move game).',
    answer: '{"intro": "…", "comments": [{"ply": 1, "text": "…"}]}', build: sampleCommentary },
  { id: 'wrong-move-rank', group: 'Corrections', title: 'Rank the fixes of a wrong move',
    situation: 'Sent when the AI picks the most likely fix for a misprinted move among those found by the legal-move search.',
    answer: '{"best": <number of the fix>, "reason": "…"}',
    build: () => ({
      system: RANK_SYSTEM, json: true, maxTokens: 400,
      messages: [{ role: 'user', text: rankPrompt({
        moves: [{ written: 'e4' }, { written: 'e5' }, { written: 'Nf3' }, { written: 'Nc7' }], failingPly: 3,
        excerpt: '1. e4 e5 2. Nf3 Nc7 3. Bb5',
        fixes: [{ ply: 3, kind: 'substitute', from: 'Nc7', to: 'Nc6', playedAfter: 1, complete: true }],
      }) }],
    }) },
]

export const PROMPT_CATALOG: PromptEntry[] = ENTRIES
