// Builds books/errors.json of the resources repository: the recognition errors
// of every book of books/manifest.json, computed with the same code the Errors
// page runs (textBookChapters + chapterErrors), so the page can fill its table
// from the start instead of analysing every book in the browser.
// Usage (from apps/web, vite-node ships with vitest):
//   node ../../node_modules/.pnpm/node_modules/vite-node/vite-node.mjs scripts/build-errors.ts <resources repo dir>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import type { GameErrors } from '../src/features/errors/bookErrors'
import type { RepoBook } from '../src/features/errors/repoBooks'
import type { ErrorsFile } from '../src/features/errors/errorsSummary'

// The page reads chapters with the browser's DOM: give Node the same one (jsdom,
// as the tests do) before loading the app code.
const { window } = new JSDOM('', { url: 'http://localhost/' })
Object.assign(globalThis, { window, document: window.document, DOMParser: window.DOMParser, Node: window.Node, localStorage: window.localStorage })
const { chapterErrors } = await import('../src/features/errors/bookErrors')
const { textBookChapters } = await import('../src/features/errors/repoBooks')
const { summarise } = await import('../src/features/errors/errorsSummary')
const { APP_VERSION } = await import('../src/version')

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: build-errors.ts <resources repo dir>')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(dir, 'books', 'manifest.json'), 'utf8')) as RepoBook[]
const generatedAt = new Date().toISOString()
const file: ErrorsFile = { generatedAt, version: APP_VERSION, books: [] }
for (const book of manifest) {
  let text: string
  try {
    text = readFileSync(join(dir, 'books', 'text', `${book.id}.txt`), 'utf8')
  } catch {
    console.warn(`skip ${book.id}: no text`)
    continue
  }
  const { chapters } = textBookChapters(text, book.title)
  const games: GameErrors[] = chapters.flatMap((c, i) => chapterErrors(book.id, i + 1, c.html))
  const summary = summarise(book.id, book.title, games, generatedAt)
  file.books.push(summary)
  console.log(`${book.title}: ${summary.games} games, ${summary.errors} errors`)
}
writeFileSync(join(dir, 'books', 'errors.json'), JSON.stringify(file))
console.log(`books/errors.json: ${file.books.length} books (app ${APP_VERSION})`)
