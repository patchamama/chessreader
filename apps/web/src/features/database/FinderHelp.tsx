/** The most frequent moves written in a PGN, with how they are written in English, Spanish and German (S7). */
const ROWS: Array<{ what: string; en: string; es: string; de: string }> = [
  { what: 'Pawn move', en: 'e4', es: 'e4', de: 'e4' },
  { what: 'Knight move', en: 'Nf3', es: 'Cf3', de: 'Sf3' },
  { what: 'Capture', en: 'Nxe5', es: 'Cxe5', de: 'Sxe5' },
  { what: 'Pawn capture', en: 'exd5', es: 'exd5', de: 'exd5' },
  { what: 'Castling, short', en: 'O-O', es: 'O-O', de: 'O-O' },
  { what: 'Castling, long', en: 'O-O-O', es: 'O-O-O', de: 'O-O-O' },
  { what: 'Pawn promotes to a queen', en: 'e8=Q', es: 'e8=D', de: 'e8=D' },
  { what: 'Check', en: 'Qh5+', es: 'Dh5+', de: 'Dh5+' },
  { what: 'Checkmate', en: 'Qxf7#', es: 'Dxf7#', de: 'Dxf7#' },
  { what: 'Two pieces can go there', en: 'Nbd7', es: 'Cbd7', de: 'Sbd7' },
  { what: 'Bishop / rook / king', en: 'Bb5 / Rae1 / Kg1', es: 'Ab5 / Tae1 / Rg1', de: 'Lb5 / Tae1 / Kg1' },
]

export default function FinderHelp() {
  return (
    <details className="rounded border border-slate-200 p-1 text-xs">
      <summary className="cursor-pointer font-medium">Help: how moves are written</summary>
      <p className="mt-1 text-slate-600">
        Move numbers may be written with or without dots, letter case is fixed, and + # ! ? are ignored.
        Pieces: English K Q R B N, Spanish R D T A C, German K D T L S (or the symbols ♔ ♕ ♖ ♗ ♘). The language is detected unless you choose it.
      </p>
      <table className="mt-1 border-collapse">
        <thead>
          <tr className="text-left"><th className="pr-3">Move</th><th className="pr-3">English</th><th className="pr-3">Español</th><th>Deutsch</th></tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.what} className="border-t border-slate-100">
              <td className="pr-3">{r.what}</td>
              <td className="pr-3 font-mono">{r.en}</td>
              <td className="pr-3 font-mono">{r.es}</td>
              <td className="font-mono">{r.de}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
