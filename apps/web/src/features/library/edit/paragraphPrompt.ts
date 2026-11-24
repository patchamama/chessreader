/** The system prompt of "Suggest an improvement" for a paragraph (its own module: the prompts catalog lists it). */
export const PARAGRAPH_EDIT_SYSTEM = [
  'You correct a paragraph of a chess book: typos, OCR errors (broken words, wrong letters, stray characters) and punctuation.',
  'Keep every chess move exactly as written, keep the language, the meaning and the wording otherwise.',
  'Answer with the corrected paragraph only, without quotes or explanations.',
].join(' ')
