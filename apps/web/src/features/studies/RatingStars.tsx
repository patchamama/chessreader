/** 1-5 stars; clicking the current rating clears it. */
export default function RatingStars({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <span role="group" aria-label={label} className="whitespace-nowrap">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={value !== null && n <= value}
          className={value !== null && n <= value ? 'text-amber-500' : 'text-slate-300'}
          onClick={() => onChange(value === n ? null : n)}>{value !== null && n <= value ? '★' : '☆'}</button>
      ))}
    </span>
  )
}
