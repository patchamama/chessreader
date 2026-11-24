import { describe, expect, it, vi } from 'vitest'
const save = vi.hoisted(() => vi.fn())
vi.mock('../../comments/commentsApi', () => ({ setCommentActions: save }))

import { actionsPrompt, parseActionsAnswer, proposeActions, factsText, generateCommentActions } from './actionsAi'
import { positionFacts } from '@chess-ebook/chess-shared'

// The sample game of S6 (invented position): 1.e4 e5 2.Nf3 d6, Black to move.
const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const TEXT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'
const answer = (actions: string) => ({ text: JSON.stringify({ actions }), model: 'fake-model' })

describe('the AI step that writes the narration actions of a comment (S6)', () => {
  it('the prompt carries the numbered words, the FEN, the evaluations and the reach of every piece', () => {
    const req = actionsPrompt({ text: TEXT, fen: FEN, evals: ['f7f5: +0.3', 'Nc6: +0.1'] })
    const user = req.messages[0].text
    expect(req.json).toBe(true)
    expect(user).toContain(FEN)
    expect(user).toContain('13:f5!')
    expect(user).toContain('Stockfish')
    expect(user).toContain('f7f5: +0.3')
    expect(user).toContain('bishop c8 (black)')
    expect(user).toContain('diagonal c8-h3')
    expect(req.system).toContain('Diagonal:c8-h3')
    expect(req.system).toMatch(/JSON/)
  })

  it('without evaluations the prompt does not mention an engine', () => {
    expect(actionsPrompt({ text: TEXT, fen: FEN }).messages[0].text).not.toContain('Stockfish')
  })

  it('lists the legal moves and the sliders of the position from its FEN', () => {
    const text = factsText(positionFacts(FEN))
    expect(text).toContain('Black to move')
    expect(text).toContain('pawn f7 (black): f5, f6')
    expect(text).toContain('rook a8 (black)')
  })

  it('reads the answer, in a JSON fence or not, with the actions as text or as a list', () => {
    expect(parseActionsAnswer('{"actions": "0Clear"}')).toBe('0Clear')
    expect(parseActionsAnswer('```json\n{"actions": ["0Diagonal:c8-h3", "13Arrow:f7-f5"]}\n```')).toBe('0Diagonal:c8-h3, 13Arrow:f7-f5')
    expect(() => parseActionsAnswer('no json')).toThrow()
    expect(() => parseActionsAnswer('{"other": 1}')).toThrow()
  })

  it('proposes "iluminar casillas desde c8-h3 y flecha f7-f5" for the f5 comment, discarding what does not fit the position', async () => {
    const complete = vi.fn().mockResolvedValue(answer('0Diagonal:c8-h3, 13Arrow:f7-f5, 2Diagonal:c8-h4, 5Arrow:e5-e6, 40Square:e4, 3Fly:x, 7Piece:c5'))
    const p = await proposeActions(complete, { text: TEXT, fen: FEN })
    expect(complete).toHaveBeenCalledOnce()
    expect(p.actions).toBe('0Diagonal:c8-h3, 5Arrow:e5-e6, 13Arrow:f7-f5')
    expect(p.model).toBe('fake-model')
    expect(p.rejected.map((r) => r.reason)).toEqual(['not-a-diagonal', 'no-piece', 'token-out-of-range', 'unreadable'])
  })

  it('an answer with no valid action proposes an empty list', async () => {
    const p = await proposeActions(vi.fn().mockResolvedValue(answer('0Arrow:a4-a5')), { text: TEXT, fen: FEN })
    expect(p.actions).toBe('')
  })

  it('a failed model call is not swallowed', async () => {
    await expect(proposeActions(vi.fn().mockRejectedValue(new Error('offline')), { text: TEXT, fen: FEN })).rejects.toThrow('offline')
  })
})

describe('storing the proposed actions with the comment', () => {
  it('saves the valid actions through the comments API', async () => {
    save.mockReset()
    const p = await generateCommentActions(vi.fn().mockResolvedValue(answer('0Diagonal:c8-h3, 13Arrow:f7-f5')), { id: 7, text: TEXT, fen: FEN })
    expect(save).toHaveBeenCalledWith(7, '0Diagonal:c8-h3, 13Arrow:f7-f5')
    expect(p.saved).toBe(true)
  })

  it('saves nothing when no action is valid', async () => {
    save.mockReset()
    const p = await generateCommentActions(vi.fn().mockResolvedValue(answer('0Arrow:a4-a5')), { id: 7, text: TEXT, fen: FEN })
    expect(save).not.toHaveBeenCalled()
    expect(p.saved).toBe(false)
  })
})
