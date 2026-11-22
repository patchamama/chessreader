import { describe, it, expect } from 'vitest'
import { detectLanguage } from './detectLanguage'

describe('detectLanguage', () => {
  it('recognises the four languages of the app from chess prose', () => {
    expect(detectLanguage('White must now move one of the Bishops, so as to force the Black King to go back and the game is won.')).toBe('en')
    expect(detectLanguage('Las blancas deben mover ahora uno de los alfiles para obligar al rey negro a retroceder, y la partida está ganada.')).toBe('es')
    expect(detectLanguage('Weiß muss jetzt einen der Läufer ziehen, um den schwarzen König zum Rückzug zu zwingen und die Partie ist gewonnen.')).toBe('de')
    expect(detectLanguage('Les blancs doivent maintenant déplacer un des fous pour obliger le roi noir à reculer, et la partie est gagnée.')).toBe('fr')
  })

  it('ignores the moves: only the words count', () => {
    expect(detectLanguage('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7')).toBeNull()
  })

  it('gives null for text too short or too mixed to tell', () => {
    expect(detectLanguage('Mate')).toBeNull()
    expect(detectLanguage('')).toBeNull()
  })
})
