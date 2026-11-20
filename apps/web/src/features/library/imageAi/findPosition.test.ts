import { describe, it, expect, vi } from 'vitest'
import { readingFromFen } from '@chess-ebook/chess-shared'
import { findPosition, visionReading } from './findPosition'

// A rook ending: the moves after the diagram are only legal from it.
const FEN = '6k1/5pp1/7p/8/8/8/5PPP/R5K1 w - - 0 30'
const TEXT = '30.Ra8+ Kh7 31.h4 g6'

describe('findPosition', () => {
  it('from the moves alone finds a position from which they play', () => {
    const [best] = findPosition({ followingText: TEXT })
    expect(best.totalMoves).toBe(4)
    expect(best.playedMoves).toBe(4)
  })

  it('with readings (templates, vision) keeps the read position when the moves play from it', () => {
    const [best] = findPosition({ followingText: TEXT, readings: [readingFromFen(FEN, 0.8)] })
    expect(best.fen.split(' ')[0]).toBe(FEN.split(' ')[0])
    expect(best.playedMoves).toBe(4)
    expect(best.changedSquares).toEqual([])
  })

  it('without moves gives nothing to play', () => {
    const [best] = findPosition({ followingText: 'no moves here', readings: [readingFromFen(FEN)] })
    expect(best.totalMoves).toBe(0)
  })
})

describe('visionReading', () => {
  it('asks the model with the image and validates its 64 squares', async () => {
    const squares = readingFromFen(FEN, 0.7)
    const complete = vi.fn().mockResolvedValue({ text: JSON.stringify({ sideToMove: 'w', squares }), model: 'm' })
    const out = await visionReading(complete, 'data:image/png;base64,AAAA')
    expect(complete.mock.calls[0][0].messages[0].images).toEqual(['data:image/png;base64,AAAA'])
    expect(out.readings).toHaveLength(64)
    expect(out.model).toBe('m')
  })

  it('asks again without JSON mode when the model cannot give structured output', async () => {
    const squares = readingFromFen(FEN, 0.7)
    const complete = vi.fn()
      .mockRejectedValueOnce(new Error('Ollama answered 501. Ollama said: structured output is unavailable'))
      .mockResolvedValueOnce({ text: 'Here it is: ' + JSON.stringify({ squares }), model: 'm' })
    const out = await visionReading(complete, 'data:x')
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[0][0].json).toBeTruthy()
    expect(complete.mock.calls[1][0].json).toBeUndefined()
    expect(out.readings).toHaveLength(64)
  })

  it('fails with the validation error when the answer is not a board', async () => {
    const complete = vi.fn().mockResolvedValue({ text: '{"squares": []}', model: 'm' })
    await expect(visionReading(complete, 'data:x')).rejects.toThrow(/64/)
  })
})
