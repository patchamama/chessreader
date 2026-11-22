import type { TargetLang } from '../../comments/commentPrompts'

/** Frequent function words of each language: enough to tell chess prose apart. */
const STOP: Record<TargetLang, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'it', 'with', 'for', 'as', 'was', 'be', 'on', 'this', 'which', 'must', 'can', 'his', 'by', 'then', 'now', 'white', 'black'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'con', 'por', 'para', 'del', 'se', 'su', 'al', 'más', 'pero', 'como', 'las', 'blancas', 'negras'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'ein', 'eine', 'zu', 'den', 'dem', 'von', 'auf', 'für', 'es', 'sich', 'auch', 'weiß', 'schwarz', 'muss', 'jetzt'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'un', 'une', 'du', 'que', 'en', 'pour', 'dans', 'qui', 'pas', 'sur', 'avec', 'au', 'blancs', 'noirs', 'maintenant'],
}

/**
 * The language of a prose text (en, es, de or fr) by its function words, or
 * null when there are too few words to tell (moves alone, one word) or two
 * languages are about equally likely.
 */
export function detectLanguage(text: string): TargetLang | null {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? []
  if (words.length < 6) return null
  const score = (lang: TargetLang) => {
    const set = new Set(STOP[lang])
    return words.filter((w) => set.has(w)).length
  }
  const ranked = (Object.keys(STOP) as TargetLang[]).map((l) => ({ l, n: score(l) })).sort((a, b) => b.n - a.n)
  const [first, second] = ranked
  if (first.n < 3 || first.n < second.n * 1.4) return null
  return first.l
}
