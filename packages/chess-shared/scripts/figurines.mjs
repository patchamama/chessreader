// Moves inside comments are stored with figurines (♘f3): a notation that needs
// no translation. The reader writes them in its own language when it shows them.
const LETTERS = {
  en: 'KQRBN', es: 'RDTAC', de: 'KDTLS', fr: 'RDTFC',
}
const FIGURINES = '♔♕♖♗♘'
const ORDER = 'KQRBN' // the figurine of each position of LETTERS[lang]

// A piece letter, an optional origin, an optional capture and the target square:
// not inside a word and not followed by a letter or digit.
const MOVE = (letters) => new RegExp(`(?<![\\p{L}\\d])([${letters}])([a-h]?[1-8]?[x:×]?[a-h][1-8])(?![\\p{L}\\d])`, 'gu')

export function toFigurines(text, lang) {
  const letters = LETTERS[lang] ?? LETTERS.en
  return text.replace(MOVE(letters), (_, piece, rest) => `${FIGURINES[letters.indexOf(piece)]}${rest}`)
}

export function fromFigurines(text, lang) {
  const letters = LETTERS[lang] ?? LETTERS.en
  return text.replace(/[♔♕♖♗♘♚♛♜♝♞]/gu, (g) => {
    const white = FIGURINES.indexOf(g)
    const idx = white >= 0 ? white : '♚♛♜♝♞'.indexOf(g)
    return letters[idx]
  })
}

export { ORDER }
