import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recognizeGames, reviewGame } from '@chess-ebook/chess-shared'
import { commentWithModel, configuredModel, openAiModel } from './aiCommentary'
import { analyseGame } from './reviewEngine'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const [game] = recognizeGames('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#', { algorithm: 2 })

async function reviewed() {
  const plies = await analyseGame(game.tree, async () => [{ idx: 1, depth: 8, scoreCp: 20, pv: [] }], { depth: 8 })
  return { plies, review: reviewGame(plies) }
}

beforeEach(() => {
  useSettingsStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('commentary by a language model', () => {
  it('sends the facts of the game and puts the returned remarks on their moves', async () => {
    const { plies, review } = await reviewed()
    const seen: string[] = []
    const model = {
      complete: async (system: string, user: string) => {
        seen.push(system, user)
        return JSON.stringify({ intro: 'A short game.', comments: [{ ply: 6, text: 'The knight leaves f7 alone.' }] })
      },
    }
    const text = await commentWithModel(model, { plies, review, lang: 'en', white: 'A', black: 'B' })
    expect(seen[0]).toContain('English')
    expect(JSON.parse(seen[1].slice(seen[1].indexOf('{'))).moves).toHaveLength(7)
    expect(text).toContain('A short game.')
    expect(text).toContain('{ The knight leaves f7 alone.')
    const [again] = recognizeGames(text, { algorithm: 2 })
    expect(again.tree.mainline).toHaveLength(7)
  })

  it('reports an answer without remarks instead of opening an empty commentary', async () => {
    const { plies, review } = await reviewed()
    await expect(commentWithModel({ complete: async () => '{"intro":"x","comments":[]}' }, { plies, review, lang: 'en' }))
      .rejects.toThrow('The model returned no remarks for this game.')
  })

  it('the OpenAI model sends the key and asks for JSON; a refused request says why', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return calls.length === 1
        ? new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 })
    }))
    const model = openAiModel('sk-test', 'some-model')
    expect(await model.complete('sys', 'usr')).toBe('{"ok":true}')
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ model: 'some-model', response_format: { type: 'json_object' } })
    await expect(model.complete('sys', 'usr')).rejects.toThrow('Incorrect API key provided')
  })

  it('no model is configured until a provider, a key and a model are set', () => {
    expect(configuredModel()).toBeNull()
    useSettingsStore.setState({ aiProvider: 'openai', aiKey: 'sk-x' })
    expect(configuredModel()).toBeNull()
    useSettingsStore.setState({ aiModel: 'm' })
    expect(configuredModel()).not.toBeNull()
  })

  it('a local Ollama model is configured without a key', () => {
    useSettingsStore.setState({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: 'llama3' })
    expect(configuredModel()).not.toBeNull()
  })
})
