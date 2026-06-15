import { httpClient } from '../api/httpClient'

interface NotesResponse {
  content: string
}

/** Load the current user's notes from the backend (notes.<userId>.txt). */
export async function fetchNotes(): Promise<string> {
  const { content } = await httpClient<NotesResponse>('/api/notes', { method: 'GET' })
  return content
}

/** Persist the current user's notes to the backend. */
export async function saveNotes(content: string): Promise<void> {
  await httpClient('/api/notes', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
}
