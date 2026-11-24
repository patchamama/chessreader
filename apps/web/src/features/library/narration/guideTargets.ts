import { normGuideText } from './guideStore'

/** The elements of the reading pane a guide can belong to: prose paragraphs and the comments quoted from the database. */
export interface GuideParagraph { element: Element; text: string }
export interface GuideQuote { element: Element; textElement: Element; text: string; fen: string }

const MIN_WORDS = 4
const OUT = 'blockquote.human-comment, [data-no-recognition], [data-guide-chips]'

export function guideParagraphs(root: Element): GuideParagraph[] {
  const out: GuideParagraph[] = []
  root.querySelectorAll('p').forEach((element) => {
    if (element.closest(OUT)) return
    const text = normGuideText(element.textContent ?? '')
    if (text.split(' ').length >= MIN_WORDS) out.push({ element, text })
  })
  return out
}

export function guideQuotes(root: Element): GuideQuote[] {
  const out: GuideQuote[] = []
  root.querySelectorAll('blockquote.human-comment[data-comment-fen]').forEach((element) => {
    const textElement = element.querySelector('p')
    const fen = element.getAttribute('data-comment-fen')
    const text = normGuideText(textElement?.textContent ?? '')
    if (textElement && fen && text) out.push({ element, textElement, text, fen })
  })
  return out
}
