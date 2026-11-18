import type { StudyAnnotations } from './studyBoardStore'

/** Where the reader was in a book: the chapter, the game, the move, and the arrows and marks drawn. */
export interface BoardMemory {
  chapter: number
  gameIndex: number
  nodeId: string | null
  annotations: Record<string, StudyAnnotations>
}

const KEY = 'chessreader-board-v1'

function readAll(): Record<string, BoardMemory> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, BoardMemory>
  } catch {
    return {}
  }
}

/** The remembered place in a book, or null. */
export function loadBoardMemory(bookId: number): BoardMemory | null {
  return readAll()[String(bookId)] ?? null
}

/** Remember the place in a book (survives a refresh). */
export function saveBoardMemory(bookId: number, memory: BoardMemory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [String(bookId)]: memory }))
  } catch {
    // storage full or blocked: the place is a convenience
  }
}
