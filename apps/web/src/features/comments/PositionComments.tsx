import { useState } from 'react'
import { useSettingsStore, type AppLanguage } from '../../shared/settings/settingsStore'
import LinkedText from '../../shared/ui/LinkedText'
import CommentDetailsModal from '../database/CommentDetailsModal'
import { commentSource, commentTextFor, type HumanComment } from '../library/commentdb/commentLookup'
import { commentInNotation } from '../library/commentdb/commentNotation'
import { figurinesOn } from '../training/trapNotation'
import { usePositionComments } from './usePositionComments'
import { toEntry } from './toEntry'

const T: Record<AppLanguage, { one: string; many: (n: number) => string; edit: string; title: string }> = {
  en: { one: '1 comment for this position', many: (n) => `${n} comments for this position`, edit: 'Edit', title: 'Comments for this position' },
  es: { one: '1 comentario para esta posición', many: (n) => `${n} comentarios para esta posición`, edit: 'Edit', title: 'Comentarios de esta posición' },
  de: { one: '1 Kommentar zu dieser Stellung', many: (n) => `${n} Kommentare zu dieser Stellung`, edit: 'Edit', title: 'Kommentare zu dieser Stellung' },
}

/** The text of a comment in a language: its own text, or a translation; empty when it has none in it. */
const textIn = (c: HumanComment, lang: string) => (c.translations?.[lang] || c.lang === lang ? commentTextFor(c, lang) : '')

/**
 * The comments of the database for the position on the board, in the board's
 * language (else English), each one editable in the same editor as the
 * Details of the Comments tab. Renders nothing while there are none.
 */
export default function PositionComments({ fen }: { fen: string }) {
  const lang = useSettingsStore((s) => s.language)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const t = T[lang] ?? T.en
  const all = usePositionComments(fen)
  const [editing, setEditing] = useState<HumanComment | null>(null)

  const inLang = all.filter((c) => textIn(c, lang))
  const shown = (inLang.length ? inLang : all.filter((c) => textIn(c, 'en'))).map((c) => ({ c, text: textIn(c, inLang.length ? lang : 'en') }))
  if (!shown.length) return null
  return (
    <section data-testid="position-comments" aria-label={t.title} className="flex flex-col gap-1 rounded border border-sky-200 bg-sky-50 p-2 text-sm text-sky-950">
      <h2 className="text-sm font-semibold"><span aria-hidden="true">📚 </span><span>{shown.length === 1 ? t.one : t.many(shown.length)}</span></h2>
      {shown.map(({ c, text }, i) => (
        <div key={c.id ?? i} className="flex items-start gap-2">
          <p className="min-w-0 flex-1"><LinkedText text={commentInNotation(text, lang, figurines)} /> <span className="text-xs text-sky-700">— {commentSource(c)}</span></p>
          <button type="button" className="shrink-0 rounded border border-sky-300 bg-white px-2 py-0.5 text-xs" onClick={() => setEditing(c)}>{t.edit}</button>
        </div>
      ))}
      {editing && <CommentDetailsModal comment={toEntry(editing, fen)} onClose={() => setEditing(null)} />}
    </section>
  )
}
