import { useEffect, useState, type ReactNode } from 'react'
import { useSettingsStore, type AppLanguage } from '../settings/settingsStore'
import { wikipediaSummary } from '../../features/database/resources'
import { themeInfo } from './themeInfo'

export type InfoTopic = 'puzzle' | 'pattern' | 'trap' | 'traps' | 'ideas'

const T: Record<AppLanguage, {
  about: Record<InfoTopic, string>; intro: Partial<Record<InfoTopic, string>>
  patterns: string; opening: string; idea: string; more: string; chess: string; lichessTheme: (n: string) => string; practice: string
}> = {
  en: {
    about: { puzzle: 'About this puzzle', pattern: 'About this pattern', trap: 'About this trap', traps: 'About traps', ideas: 'About these ideas' },
    intro: {
      puzzle: 'Puzzles train calculation: look first at checks, then captures, then threats — for both sides.',
      pattern: 'Recognising tactical patterns lets you see winning moves at a glance; solving many puzzles of one theme fixes it in memory.',
      traps: 'An opening trap is a line where a natural-looking move loses material or the game. Knowing them helps you set them and avoid them.',
      ideas: 'Ideas for your move: the opening you are in, weak points of the opponent, and tactics that are close.',
    },
    patterns: 'Patterns', opening: 'Opening', idea: 'The idea', more: 'Learn more', chess: 'chess',
    lichessTheme: (n) => `${n} puzzles on Lichess`, practice: 'Lichess practice',
  },
  es: {
    about: { puzzle: 'Sobre este ejercicio', pattern: 'Sobre este patrón', trap: 'Sobre esta celada', traps: 'Sobre las celadas', ideas: 'Sobre estas ideas' },
    intro: {
      puzzle: 'Los ejercicios entrenan el cálculo: mira primero los jaques, luego las capturas y después las amenazas, de los dos bandos.',
      pattern: 'Reconocer los patrones tácticos permite ver las jugadas ganadoras de un vistazo; resolver muchos ejercicios de un tema lo fija en la memoria.',
      traps: 'Una celada de apertura es una línea en la que una jugada de aspecto natural pierde material o la partida. Conocerlas ayuda a tenderlas y a evitarlas.',
      ideas: 'Ideas para tu jugada: la apertura en la que estás, los puntos débiles del rival y las tácticas que están cerca.',
    },
    patterns: 'Patrones', opening: 'Apertura', idea: 'La idea', more: 'Para saber más', chess: 'ajedrez',
    lichessTheme: (n) => `Ejercicios de ${n} en Lichess`, practice: 'Práctica de Lichess',
  },
  de: {
    about: { puzzle: 'Über diese Aufgabe', pattern: 'Über dieses Motiv', trap: 'Über diese Falle', traps: 'Über Eröffnungsfallen', ideas: 'Über diese Ideen' },
    intro: {
      puzzle: 'Aufgaben trainieren das Rechnen: zuerst Schachs, dann Schlagzüge, dann Drohungen prüfen — für beide Seiten.',
      pattern: 'Wer taktische Motive erkennt, sieht Gewinnzüge auf einen Blick; viele Aufgaben zu einem Motiv prägen es ein.',
      traps: 'Eine Eröffnungsfalle ist eine Variante, in der ein natürlich wirkender Zug Material oder die Partie verliert. Wer sie kennt, kann sie stellen und vermeiden.',
      ideas: 'Ideen für deinen Zug: die Eröffnung, Schwächen des Gegners und nahe Taktiken.',
    },
    patterns: 'Motive', opening: 'Eröffnung', idea: 'Die Idee', more: 'Mehr erfahren', chess: 'Schach',
    lichessTheme: (n) => `${n}-Aufgaben auf Lichess`, practice: 'Lichess-Übungen',
  },
}

const wikiSearch = (lang: AppLanguage, term: string) => `https://${lang}.wikipedia.org/w/index.php?search=${encodeURIComponent(term)}`

/**
 * A collapsible "ℹ About…" section that teaches the patterns and moves of a
 * part of the app, in the language chosen in Settings: what each tactical
 * theme means, the idea of a trap, the opening (with its Wikipedia summary,
 * asked for only when the section is opened and never stored), and links to
 * learn more on Wikipedia and Lichess.
 */
export function InfoSection({ topic, themes = [], opening, idea, children, testId = 'info-section' }: {
  topic: InfoTopic; themes?: string[]; opening?: string | null; idea?: string; children?: ReactNode; testId?: string
}) {
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const [open, setOpen] = useState(false)
  const [wiki, setWiki] = useState<{ key: string; extract: string; url: string } | null>(null)
  const wikiKey = opening ? `${lang}:${opening}` : ''

  useEffect(() => {
    if (!open || !opening || wiki?.key === wikiKey) return
    let live = true
    wikipediaSummary(opening, lang).then(
      (s) => { if (live && s) setWiki({ key: wikiKey, extract: s.extract, url: s.url }) },
      () => { /* no summary: the link is enough */ },
    )
    return () => { live = false }
  }, [open, opening, lang, wikiKey, wiki?.key])

  const known = themes.map((x) => ({ raw: x, info: themeInfo(x, lang) }))
  const summary = wiki?.key === wikiKey ? wiki : null
  const link = 'text-blue-700 underline'

  return (
    <details data-testid={testId} open={open} className="rounded border border-sky-200 bg-sky-50/60 px-2 py-1 text-xs text-slate-700">
      <summary className="cursor-pointer select-none font-medium text-sky-900" onClick={(e) => { e.preventDefault(); setOpen((o) => !o) }}>
        ℹ {t.about[topic]}
      </summary>
      {open && (
        <div className="mt-1 flex flex-col gap-1.5">
          {t.intro[topic] && <p>{t.intro[topic]}</p>}
          {idea && <p><strong>{t.idea}:</strong> <span>{idea}</span></p>}
          {children}
          {known.length > 0 && (
            <div>
              <p className="font-semibold">{t.patterns}</p>
              <dl className="ml-1">
                {known.map(({ raw, info }) => (
                  <div key={raw} className="mt-0.5">
                    <dt className="font-medium">{info?.name ?? raw}</dt>
                    {info && <dd className="ml-2 text-slate-600">{info.text}</dd>}
                  </div>
                ))}
              </dl>
            </div>
          )}
          {opening && (
            <div>
              <p className="font-semibold">{t.opening}: <span className="font-normal">{opening}</span></p>
              {summary && <p className="text-slate-600">{summary.extract}</p>}
            </div>
          )}
          <div>
            <p className="font-semibold">{t.more}</p>
            <ul className="ml-3 list-disc">
              {opening && <li><a className={link} href={summary?.url || wikiSearch(lang, `${opening} ${t.chess}`)} target="_blank" rel="noreferrer">Wikipedia: {opening}</a></li>}
              {known.map(({ raw, info }) => (
                <li key={raw}>
                  <a className={link} href={wikiSearch(lang, `${info?.name ?? raw} ${t.chess}`)} target="_blank" rel="noreferrer">Wikipedia: {info?.name ?? raw}</a>
                  {info?.lichess && <> · <a className={link} href={`https://lichess.org/training/${info.key}`} target="_blank" rel="noreferrer">{t.lichessTheme(info.name)}</a></>}
                </li>
              ))}
              <li><a className={link} href="https://lichess.org/practice" target="_blank" rel="noreferrer">{t.practice}</a></li>
            </ul>
          </div>
        </div>
      )}
    </details>
  )
}
