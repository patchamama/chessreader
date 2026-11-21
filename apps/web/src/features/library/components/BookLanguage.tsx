import { useState } from 'react'

const KEY = 'library.language'

/** "en" → "English"; the code itself when the runtime does not know it. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** A small "EN" badge naming the language; nothing when the language is unknown. */
export function LanguageBadge({ language }: { language?: string }) {
  if (!language) return null
  return (
    <span
      aria-label={`Language: ${languageName(language)}`}
      title={languageName(language)}
      className="inline-block self-start rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
    >
      {language.toUpperCase()}
    </span>
  )
}

function readChoice(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The chosen language filter ('' = all), remembered in localStorage. */
export function useLanguageChoice(): [string, (code: string) => void] {
  const [choice, setChoice] = useState(readChoice)
  const set = (code: string) => {
    setChoice(code)
    try {
      localStorage.setItem(KEY, code)
    } catch { /* no storage: the choice lasts for this visit */ }
  }
  return [choice, set]
}

/** The languages present, with how many books speak each (sorted by name). */
export function languageCounts(languages: (string | undefined)[]): { code: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const l of languages) if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => languageName(a.code).localeCompare(languageName(b.code)))
}

/** A select above the grid: All plus each language present with its count. Hidden when no book has a language. */
export function LanguageFilter({ languages, value, onChange }: { languages: (string | undefined)[]; value: string; onChange: (code: string) => void }) {
  const options = languageCounts(languages)
  if (options.length === 0) return null
  return (
    <div className="flex items-center gap-2 px-4 pt-3 text-sm">
      <label htmlFor="library-language-filter" className="text-slate-600">Language</label>
      <select
        id="library-language-filter"
        aria-label="Filter by language"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1"
      >
        <option value="">All ({languages.length})</option>
        {options.map((o) => <option key={o.code} value={o.code}>{languageName(o.code)} ({o.count})</option>)}
      </select>
    </div>
  )
}
