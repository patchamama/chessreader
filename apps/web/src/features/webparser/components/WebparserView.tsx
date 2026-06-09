import { useState } from 'react'
import { useParseWebpage, type DiagramImage, type ParsedWebpage } from '../api/webparserApi'
import InlineGame from '../../viewer/components/InlineGame'
import type { RecognizedGame } from '@chess-ebook/chess-shared'

type Mode = 'normal' | 'substitution'

function SubstitutionHtml({
  html,
  images,
  games,
}: {
  html: string
  images: DiagramImage[]
  games: RecognizedGame[]
}) {
  // Replace each diagram <img> with a matching InlineGame based on array order.
  // We do a simple split-replace of each img src.
  // If there are fewer games than images, remaining imgs stay as-is.
  const parts: React.ReactNode[] = []
  let remaining = html

  images.forEach((img, idx) => {
    const game = games[idx]
    const tag = `<img`
    // Find the img tag by src
    const srcAttr = `src="${img.src}"`
    const pos = remaining.indexOf(srcAttr)
    if (pos < 0) return

    // Walk back to find opening <img
    const imgStart = remaining.lastIndexOf(tag, pos)
    if (imgStart < 0) return

    // Find closing > (or />)
    const imgEnd = remaining.indexOf('>', imgStart)
    if (imgEnd < 0) return

    // Emit everything before the img
    const before = remaining.slice(0, imgStart)
    if (before) {
      parts.push(<span key={`pre-${idx}`} dangerouslySetInnerHTML={{ __html: before }} />)
    }

    // Emit game board or fallback img
    if (game) {
      parts.push(
        <InlineGame
          key={`game-${idx}`}
          treeId={`webparser-${idx}`}
          game={game}
          fullText={game.source}
        />
      )
    } else {
      const imgTag = remaining.slice(imgStart, imgEnd + 1)
      parts.push(<span key={`img-${idx}`} dangerouslySetInnerHTML={{ __html: imgTag }} />)
    }

    remaining = remaining.slice(imgEnd + 1)
  })

  // Emit remainder
  if (remaining) {
    parts.push(<span key="tail" dangerouslySetInnerHTML={{ __html: remaining }} />)
  }

  return <div className="prose">{parts}</div>
}

function NormalHtml({ html }: { html: string }) {
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
}

function WebparserResult({ result, mode }: { result: ParsedWebpage; mode: Mode }) {
  if (mode === 'substitution') {
    return (
      <SubstitutionHtml html={result.html} images={result.images} games={result.games} />
    )
  }
  return (
    <>
      <NormalHtml html={result.html} />
      {result.games.map((game, idx) => (
        <InlineGame
          key={idx}
          treeId={`webparser-game-${idx}`}
          game={game}
          fullText={game.source}
        />
      ))}
    </>
  )
}

export default function WebparserView() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<Mode>('normal')
  const { mutate, data, isPending, isError, error } = useParseWebpage()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (url.trim()) mutate(url.trim())
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Web Chess Parser</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/chess-article"
          aria-label="URL"
          className="flex-1 border rounded px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Parsing…' : 'Parse'}
        </button>
      </form>

      {isError && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          {error.message}
        </p>
      )}

      {data && (
        <>
          <div className="flex gap-4 items-center mb-3">
            <span className="text-sm font-medium">Display mode:</span>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="normal"
                checked={mode === 'normal'}
                onChange={() => setMode('normal')}
              />
              Normal
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="substitution"
                checked={mode === 'substitution'}
                onChange={() => setMode('substitution')}
                aria-label="substitution"
              />
              Substitution (replace diagrams)
            </label>
          </div>

          <WebparserResult result={data} mode={mode} />
        </>
      )}
    </div>
  )
}
