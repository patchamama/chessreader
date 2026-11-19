import { create } from 'zustand'

const KEY = 'chessreader-training-prefs'

interface TrainingPrefs { showEval: boolean }

function read(): TrainingPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TrainingPrefs>
    return { showEval: saved.showEval === true }
  } catch { return { showEval: false } }
}

/** The options of the training boards, shared by all of them and remembered in this browser. */
export const useTrainingPrefs = create<TrainingPrefs & { setShowEval: (on: boolean) => void }>((set) => ({
  ...read(),
  setShowEval: (showEval) => {
    try { localStorage.setItem(KEY, JSON.stringify({ showEval })) } catch { /* not kept */ }
    set({ showEval })
  },
}))
