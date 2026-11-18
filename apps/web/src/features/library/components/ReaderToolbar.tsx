import { useState } from 'react'
import { useReaderViewStore } from '../store/readerViewStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { usePracticeStore } from '../store/practiceStore'
import { useStudyToolsStore } from '../store/studyToolsStore'
import { trainerLineFromNode } from '../utils/trainerLineFromNode'
import { addTrainerLine } from '../api/trainerApi'

const base = 'flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition'
const on = 'border-amber-400 bg-amber-50 text-amber-700'
const off = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'

/**
 * Show or hide every book comment inserted in the text (S4). Shown by default
 * and remembered; each time they are shown again, a position with several
 * remarks in the database shows one of them at random.
 */
export function BookCommentsToggle() {
  const shown = useReaderViewStore((s) => s.bookComments)
  const toggle = useReaderViewStore((s) => s.toggleBookComments)
  const label = shown ? 'Hide book comments' : 'Show book comments'
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} aria-pressed={shown} className={`${base} ${shown ? on : off}`}>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4.3-.9L3 20l1.3-3.9A7.6 7.6 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
        {!shown && <path strokeLinecap="round" d="M4 4l16 16" />}
      </svg>
    </button>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Save the line from this move to the trainer',
  saving: 'Saving the line to the trainer…',
  saved: 'Line saved to the trainer',
  error: 'Could not save the line (are you signed in?)',
}

/**
 * The study tools, as icons in the reader's top bar (study-tools-round S7):
 * - save the rest of the open game's main line, from the current move, as a
 *   trainer line for spaced-repetition review;
 * - guess the move: the board hides the next moves and you play them, scored;
 * - the position trainer: your saved lines, reviewed when due and graded.
 * `onOpen` brings the study board into view when a tool takes its place.
 */
export function StudyTools({ onOpen }: { onOpen?: () => void }) {
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const currentNodeId = useStudyBoardStore((s) => s.currentNodeId)
  const practiceActive = usePracticeStore((s) => s.active)
  const trainerOpen = useStudyToolsStore((s) => s.trainerOpen)
  const setTrainerOpen = useStudyToolsStore((s) => s.setTrainerOpen)
  const [save, setSave] = useState<SaveState>('idle')
  const guessing = practiceActive && !trainerOpen

  const saveLine = async () => {
    if (!activeGame || save === 'saving') return
    const draft = trainerLineFromNode(activeGame, currentNodeId)
    if (draft.movesUci.length === 0) return
    setSave('saving')
    try {
      await addTrainerLine({ name: '', ...draft })
      setSave('saved')
    } catch {
      setSave('error')
    }
    window.setTimeout(() => setSave('idle'), 2500)
  }

  const toggleGuess = () => {
    if (guessing) { usePracticeStore.getState().stop(); return }
    if (!activeGame) return
    setTrainerOpen(false)
    usePracticeStore.getState().start(activeGame, currentNodeId)
    onOpen?.()
  }

  const toggleTrainer = () => {
    // A guess or a review in progress belongs to the tool being left.
    if (usePracticeStore.getState().active) usePracticeStore.getState().stop()
    setTrainerOpen(!trainerOpen)
    if (!trainerOpen) onOpen?.()
  }

  const saveLabel = SAVE_LABEL[save]
  const guessLabel = guessing ? 'Stop guessing the moves' : 'Guess the next moves'
  const trainerLabel = trainerOpen ? 'Close the position trainer' : 'Open the position trainer'
  const saveTone = save === 'saved' ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
    : save === 'error' ? 'border-red-300 bg-red-50 text-red-600' : off
  return (
    <>
      <button type="button" onClick={saveLine} disabled={!activeGame || practiceActive} title={saveLabel} aria-label={saveLabel}
        className={`${base} ${saveTone} disabled:cursor-not-allowed disabled:opacity-35`}>
        <svg aria-hidden="true" className={`h-4 w-4 ${save === 'saving' ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {save === 'saved'
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-6-4-6 4V3zM12 7v6M9 10h6" />}
        </svg>
      </button>
      <button type="button" onClick={toggleGuess} disabled={!activeGame && !guessing} title={guessLabel} aria-label={guessLabel} aria-pressed={guessing}
        className={`${base} ${guessing ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : off} disabled:cursor-not-allowed disabled:opacity-35`}>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 100-20 10 10 0 000 20z" />
        </svg>
      </button>
      <button type="button" onClick={toggleTrainer} title={trainerLabel} aria-label={trainerLabel} aria-pressed={trainerOpen}
        className={`${base} ${trainerOpen ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : off}`}>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4L2 9l10 5 10-5-10-5zM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 9v6" />
        </svg>
      </button>
    </>
  )
}
