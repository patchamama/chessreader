import { boardSvgDataUrl } from '../library/utils/boardSvg'
import { langName } from '../comments/commentPrompts'
import type { HumanComment } from '../library/commentdb/commentLookup'

/** A comment found for a position: diagram, text, source and its translations. */
export default function CommentCard({ comment, fen, onEdit }: { comment: HumanComment; fen: string; onEdit?: (c: HumanComment) => void }) {
  const who = [comment.source.title, comment.source.author, comment.label].filter(Boolean).join(' · ')
  return (
    <li className="flex gap-3 rounded border border-slate-200 bg-white p-2">
      <img src={boardSvgDataUrl(fen)} alt={`Position after ${comment.san}`} width={96} height={96} className="h-24 w-24 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line">{comment.text}</p>
        <p className="mt-1 text-xs text-slate-600"><strong>{who}</strong> · {langName(comment.lang)} · Game {comment.gameId}</p>
        {Object.entries(comment.translations ?? {}).map(([lang, text]) => (
          <p key={lang} className="mt-1 text-xs"><span className="font-semibold">{langName(lang)}:</span> {text}</p>
        ))}
        {onEdit && <p className="mt-1"><button className="rounded border border-slate-300 px-2 py-0.5 text-xs" aria-label={`Edit comment ${comment.id ?? comment.gameId}`} onClick={() => onEdit(comment)}>Edit</button></p>}
      </div>
    </li>
  )
}
