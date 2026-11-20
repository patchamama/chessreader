import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore, mergeWithDefaults, migrateSettings } from './settingsStore'

describe('settingsStore — persistence migration', () => {
  it('fills missing new keys from defaults (old persisted state lacks showEngineArrow)', () => {
    const current = useSettingsStore.getState()
    // Simulate state persisted before showEngineArrow existed (had hideEngineArrow).
    const oldPersisted = { showEval: true, engineDepth: 22, hideEngineArrow: true }
    const merged = mergeWithDefaults(current, oldPersisted)
    // Missing new key takes its default (ON) — not undefined.
    expect(merged.showEngineArrow).toBe(true)
    // Persisted values still win for keys they define.
    expect(merged.engineDepth).toBe(22)
  })

  it('persisted values override defaults for known keys', () => {
    const current = useSettingsStore.getState()
    const merged = mergeWithDefaults(current, { showEngineArrow: false, fontSize: 20 })
    expect(merged.showEngineArrow).toBe(false)
    expect(merged.fontSize).toBe(20)
  })
})

describe('settingsStore — engine settings', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('defaults: eval on, depth 30, 1 variation, arrow visible', () => {
    const s = useSettingsStore.getState()
    expect(s.showEval).toBe(true)
    expect(s.engineDepth).toBe(30)
    expect(s.engineVariations).toBe(1)
    expect(s.showEngineArrow).toBe(true)
  })

  it('set patches engine fields independently', () => {
    useSettingsStore.getState().set({ showEval: true, engineDepth: 24 })
    const s = useSettingsStore.getState()
    expect(s.showEval).toBe(true)
    expect(s.engineDepth).toBe(24)
    // untouched fields keep their defaults
    expect(s.engineVariations).toBe(1)
    expect(s.showEngineArrow).toBe(true)
  })

  it('reset restores engine defaults', () => {
    useSettingsStore.getState().set({
      showEval: true,
      engineDepth: 30,
      engineVariations: 3,
      showEngineArrow: false,
    })
    useSettingsStore.getState().reset()
    const s = useSettingsStore.getState()
    expect(s.showEval).toBe(true)
    expect(s.engineDepth).toBe(30)
    expect(s.engineVariations).toBe(1)
    expect(s.showEngineArrow).toBe(true)
  })
})

describe('settingsStore — appearance & behavior settings', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('defaults: light app theme, default piece theme, panel 320px, labels/highlight/sound on', () => {
    const s = useSettingsStore.getState()
    expect(s.appTheme).toBe('light')
    expect(s.pieceTheme).toBe('default')
    expect(s.studyPanelWidth).toBe(320)
    expect(s.showBoardLabels).toBe(true)
    expect(s.fullSquareHighlight).toBe(true)
    expect(s.playMoveSound).toBe(true)
    expect(s.autoplayDelay).toBe(1)
  })

  it('applyAppTheme("dark") sets dark bg/text presets', () => {
    useSettingsStore.getState().applyAppTheme('dark')
    const s = useSettingsStore.getState()
    expect(s.appTheme).toBe('dark')
    expect(s.bgColor).toBe('#1a1a1a')
    expect(s.textColor).toBe('#e8e8e8')
  })

  it('applyAppTheme("light") restores light bg/text presets', () => {
    useSettingsStore.getState().applyAppTheme('dark')
    useSettingsStore.getState().applyAppTheme('light')
    const s = useSettingsStore.getState()
    expect(s.appTheme).toBe('light')
    expect(s.bgColor).toBe('#ffffff')
    expect(s.textColor).toBe('#1a1a1a')
  })

  it('set patches appearance fields independently', () => {
    useSettingsStore.getState().set({ pieceTheme: 'alpha', studyPanelWidth: 480 })
    const s = useSettingsStore.getState()
    expect(s.pieceTheme).toBe('alpha')
    expect(s.studyPanelWidth).toBe(480)
    expect(s.showBoardLabels).toBe(true)
  })

  it('toggles behave as plain booleans', () => {
    useSettingsStore.getState().set({ showBoardLabels: false, playMoveSound: false })
    const s = useSettingsStore.getState()
    expect(s.showBoardLabels).toBe(false)
    expect(s.playMoveSound).toBe(false)
    expect(s.fullSquareHighlight).toBe(true)
  })

  it('reset restores appearance defaults', () => {
    useSettingsStore.getState().set({
      appTheme: 'dark',
      pieceTheme: 'merida',
      studyPanelWidth: 600,
      showBoardLabels: false,
      fullSquareHighlight: false,
      playMoveSound: false,
      autoplayDelay: 5,
    })
    useSettingsStore.getState().reset()
    const s = useSettingsStore.getState()
    expect(s.appTheme).toBe('light')
    expect(s.pieceTheme).toBe('default')
    expect(s.studyPanelWidth).toBe(320)
    expect(s.showBoardLabels).toBe(true)
    expect(s.fullSquareHighlight).toBe(true)
    expect(s.playMoveSound).toBe(true)
    expect(s.autoplayDelay).toBe(1)
  })
})

describe('settingsStore — annotated games laid out like a book by default', () => {
  it('a new reader gets split lines, key-moment diagrams and their evaluation', () => {
    useSettingsStore.getState().reset()
    const s = useSettingsStore.getState()
    expect(s.commentLayout).toBe('split')
    expect(s.commentDiagrams).toBe(true)
    expect(s.commentDiagramEval).toBe(true)
  })
  it('settings saved before (version 0) move once to the book layout; the rest is kept', () => {
    const old = { commentLayout: 'paragraphs', commentDiagrams: false, commentDiagramEval: false, fontSize: 21 }
    expect(migrateSettings(old, 0)).toMatchObject({ commentLayout: 'split', commentDiagrams: true, commentDiagramEval: true, fontSize: 21 })
    expect(migrateSettings({ commentLayout: 'paragraphs' }, 1)).toMatchObject({ commentLayout: 'paragraphs' })
  })
})

describe('settingsStore — pause after each move in the narration (S32)', () => {
  it('is 0 s by default (as before) and can be set', () => {
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().narrationMovePause).toBe(0)
    useSettingsStore.getState().set({ narrationMovePause: 3 })
    expect(useSettingsStore.getState().narrationMovePause).toBe(3)
  })

  it('version 2: the legacy recognition algorithm 3 becomes 2, and one Lichess token is kept (S2, S13)', () => {
    expect(migrateSettings({ recognitionAlgorithm: 3, lichessPlayToken: 'play', lichessToken: '' }, 1)).toMatchObject({ recognitionAlgorithm: 2, lichessToken: 'play' })
    expect(migrateSettings({ recognitionAlgorithm: 1, lichessPlayToken: 'play', lichessToken: 'read' }, 1)).toMatchObject({ recognitionAlgorithm: 1, lichessToken: 'read' })
  })
})

describe('settingsStore — chapter title separator', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('defaults to " - " and an older saved state gets the default', () => {
    expect(useSettingsStore.getState().chapterTitleSeparator).toBe(' - ')
    const merged = mergeWithDefaults(useSettingsStore.getState(), { fontSize: 18 })
    expect(merged.chapterTitleSeparator).toBe(' - ')
  })

  it('keeps the chosen separator', () => {
    useSettingsStore.getState().set({ chapterTitleSeparator: ': ' })
    expect(useSettingsStore.getState().chapterTitleSeparator).toBe(': ')
  })
})

describe('settingsStore — piece notation (S12)', () => {
  beforeEach(() => useSettingsStore.getState().reset())

  it('defaults to the letters of the selected language', () => {
    expect(useSettingsStore.getState().notationStyle).toBe('letters')
  })

  it('keeps a saved choice and repairs a missing or unknown one', () => {
    const current = useSettingsStore.getState()
    expect(mergeWithDefaults(current, { notationStyle: 'figurine' }).notationStyle).toBe('figurine')
    expect(mergeWithDefaults(current, { fontSize: 18 }).notationStyle).toBe('letters')
    expect(mergeWithDefaults(current, { notationStyle: 'emoji' }).notationStyle).toBe('letters')
  })
})

describe('settingsStore — AI assistant (S1)', () => {
  beforeEach(() => useSettingsStore.getState().reset())

  it('is off by default, with no base URL, key, model, known vision or resources write token', () => {
    const s = useSettingsStore.getState()
    expect(s.aiProvider).toBe('none')
    expect(s.aiBaseUrl).toBe('')
    expect(s.aiKey).toBe('')
    expect(s.aiModel).toBe('')
    expect(s.aiVision).toBeNull()
    expect(s.resourcesWriteToken).toBe('')
  })

  it('version 5: an older Claude or OpenAI setup keeps its key and model and gets the provider base URL', () => {
    expect(migrateSettings({ aiProvider: 'anthropic', aiKey: 'sk-ant', aiModel: '' }, 4))
      .toMatchObject({ aiProvider: 'anthropic', aiKey: 'sk-ant', aiModel: '', aiBaseUrl: 'https://api.anthropic.com', aiVision: null })
    expect(migrateSettings({ aiProvider: 'openai', aiKey: 'sk', aiModel: 'gpt-x' }, 4))
      .toMatchObject({ aiProvider: 'openai', aiKey: 'sk', aiModel: 'gpt-x', aiBaseUrl: 'https://api.openai.com/v1' })
    expect(migrateSettings({ aiProvider: 'none' }, 4)).toMatchObject({ aiProvider: 'none' })
    // A base URL saved by version 5 itself is never replaced.
    expect(migrateSettings({ aiProvider: 'openai', aiBaseUrl: 'https://proxy.example/v1' }, 5)).toMatchObject({ aiBaseUrl: 'https://proxy.example/v1' })
  })

  it('an unknown saved provider falls back to off', () => {
    expect(mergeWithDefaults(useSettingsStore.getState(), { aiProvider: 'gemini' }).aiProvider).toBe('none')
    expect(mergeWithDefaults(useSettingsStore.getState(), { aiProvider: 'ollama' }).aiProvider).toBe('ollama')
  })
})
