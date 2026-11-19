import { afterEach, describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { recommentGame, type CommentOptions } from './recommentGame'
import { setReviewEngine } from './reviewStore'

const TEXT = 'Game 1\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
const OPTIONS: CommentOptions = { lang: 'en', level: 1, layout: 'paragraphs', diagrams: undefined, humanComments: false, depth: 4, sfUrl: '' }

afterEach(() => setReviewEngine(null))

describe('comment a game again reports its progress (S5)', () => {
  it('reports one step per position analysed, up to the whole game', async () => {
    setReviewEngine(async () => [{ pv: [], scoreCp: 20, depth: 4 } as never])
    const games = recognizeGames(TEXT)
    const steps: Array<[number, number]> = []
    const body = await recommentGame(games, 0, TEXT, OPTIONS, { onProgress: (done, total) => steps.push([done, total]) })
    expect(body).toContain('e4')
    // Six moves: seven positions (the start and after each move).
    expect(steps.at(-1)).toEqual([7, 7])
    expect(steps.map(([d]) => d)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('stops when its signal aborts', async () => {
    setReviewEngine(async () => [{ pv: [], scoreCp: 20, depth: 4 } as never])
    const controller = new AbortController()
    controller.abort()
    await expect(recommentGame(recognizeGames(TEXT), 0, TEXT, OPTIONS, { signal: controller.signal })).rejects.toThrow('aborted')
  })
})
