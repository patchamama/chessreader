import { useParams } from 'react-router-dom'
import { useChapter } from '../api/libraryApi'
import { recognizeGames } from '@chess-ebook/chess-shared'
import InlineGame from '../../viewer/components/InlineGame'

/**
 * BookReader — EPIC-5 implementation.
 *
 * Fetches a chapter, runs recognizeGames over the text content,
 * and renders the prose with InlineGame boards for each recognized game.
 */
export default function BookReader() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = Number(bookId)
  const { data, isLoading } = useChapter(id, 0)

  if (isLoading) {
    return (
      <div role="status" className="p-8">
        <span className="sr-only">Loading…</span>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  const html = data?.html ?? ''
  // Strip HTML tags to get plain text for move recognition
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const games = recognizeGames(plainText)

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{data?.title}</h1>

      {games.length === 0 ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div>
          {games.map((game, i) => {
            const treeId = `book-${id}-game-${i}`
            return (
              <InlineGame
                key={treeId}
                treeId={treeId}
                game={game}
                fullText={plainText}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
