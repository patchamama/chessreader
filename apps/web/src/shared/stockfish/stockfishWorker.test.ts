import { describe, expect, it } from 'vitest'
import { engineScript } from './stockfishWorker'
import { STOCKFISH_VERSIONS, useSettingsStore } from '../settings/settingsStore'

describe('engineScript', () => {
  it('Stockfish 18 is served by this site and runs straight from its address (S2)', () => {
    expect(STOCKFISH_VERSIONS['sf18-local'].url).toMatch(/stockfish\/stockfish-18-lite-single\.js$/)
    expect(engineScript('/chessreader/stockfish/stockfish-18-lite-single.js', 'https://x.github.io/chessreader/#/play'))
      .toEqual({ url: 'https://x.github.io/chessreader/stockfish/stockfish-18-lite-single.js', sameOrigin: true })
  })
  it('a CDN script is not on this site', () => {
    expect(engineScript(STOCKFISH_VERSIONS['sf10-jsdelivr'].url, 'https://x.github.io/').sameOrigin).toBe(false)
  })
  it('new users get Stockfish 18', () => {
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().stockfishVersion).toBe('sf18-local')
  })
})
