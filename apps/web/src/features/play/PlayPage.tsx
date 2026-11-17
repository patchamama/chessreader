import { useState } from 'react'
import ChessBoard from '../../shared/chess/ChessBoard'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { usePlayStore, type PlayMode } from './playStore'
import { LICHESS_PLAY_TOKEN_URL } from './lichessBoard'

const TEXT = {
  en: { title: 'Play with a tutor', mode: 'Opponent', engine: 'The engine', human: 'A person at this board', lichess: 'Someone on Lichess (casual)', color: 'I play', white: 'White', black: 'Black', strength: 'Engine strength', start: 'New game', tutor: 'Tutor', token: 'Lichess token with board:play', create: 'Create a token for playing ↗', thinking: 'The engine is thinking…', you: 'You', opp: 'Opponent' },
  es: { title: 'Jugar con un tutor', mode: 'Rival', engine: 'El motor', human: 'Una persona en este tablero', lichess: 'Alguien en Lichess (amistosa)', color: 'Juego con', white: 'Blancas', black: 'Negras', strength: 'Fuerza del motor', start: 'Nueva partida', tutor: 'Tutor', token: 'Token de Lichess con board:play', create: 'Crear un token para jugar ↗', thinking: 'El motor está pensando…', you: 'Tú', opp: 'Rival' },
  de: { title: 'Spielen mit Trainer', mode: 'Gegner', engine: 'Die Engine', human: 'Eine Person an diesem Brett', lichess: 'Jemand auf Lichess (ungewertet)', color: 'Ich spiele', white: 'Weiß', black: 'Schwarz', strength: 'Engine-Stärke', start: 'Neue Partie', tutor: 'Trainer', token: 'Lichess-Token mit board:play', create: 'Token zum Spielen erstellen ↗', thinking: 'Die Engine denkt…', you: 'Du', opp: 'Gegner' },
}

/** Play against the engine, a person or a Lichess opponent while a tutor comments every move (S27). */
export default function PlayPage() {
  const lang = useSettingsStore((s) => s.language)
  const t = TEXT[lang]
  const p = usePlayStore()
  const [mode, setMode] = useState<PlayMode>('engine')
  const [color, setColor] = useState<'white' | 'black'>('white')
  const [strength, setStrength] = useState(3)
  const [token, setToken] = useState(useSettingsStore.getState().lichessPlayToken)
  const field = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:flex-row">
      <div className="w-full max-w-[480px]">
        <ChessBoard
          fen={p.fen}
          orientation={p.mode === 'human' ? 'white' : p.color}
          lastMove={p.lastMove}
          allowDragging={p.status === 'playing'}
          onPieceDrop={(from, to) => p.move(from, to)}
        />
        <p className="mt-2 text-sm text-slate-600">{p.sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ')}</p>
        {p.status === 'thinking' && <p className="text-xs text-slate-500">{t.thinking}</p>}
        {p.result && <p className="mt-1 font-semibold">{p.result}</p>}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <h1 className="text-xl font-bold text-slate-800">{t.title}</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-slate-600">{t.mode}
            <select aria-label={t.mode} className={field} value={mode} onChange={(e) => setMode(e.target.value as PlayMode)}>
              <option value="engine">{t.engine}</option>
              <option value="human">{t.human}</option>
              <option value="lichess">{t.lichess}</option>
            </select>
          </label>
          {mode === 'engine' && (
            <>
              <label className="flex flex-col text-xs text-slate-600">{t.color}
                <select aria-label={t.color} className={field} value={color} onChange={(e) => setColor(e.target.value as 'white' | 'black')}>
                  <option value="white">{t.white}</option>
                  <option value="black">{t.black}</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-slate-600">{t.strength} ({strength}/8)
                <input aria-label={t.strength} type="range" min={1} max={8} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
              </label>
            </>
          )}
          {mode === 'lichess' && (
            <label className="flex flex-col text-xs text-slate-600">{t.token}
              <input aria-label={t.token} type="password" autoComplete="off" className={field} value={token} onChange={(e) => setToken(e.target.value)} />
              <a className="text-blue-700 underline" href={LICHESS_PLAY_TOKEN_URL} target="_blank" rel="noreferrer">{t.create}</a>
            </label>
          )}
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={mode === 'lichess' && !token.trim()}
            onClick={() => {
              if (mode === 'lichess') useSettingsStore.getState().set({ lichessPlayToken: token.trim() })
              p.start({ mode, color, strength, lang, token: token.trim() })
            }}
          >
            {t.start}
          </button>
        </div>
        {p.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">{p.error}</p>}
        <section aria-label={t.tutor} className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">
          <h2 className="text-sm font-semibold text-slate-700">🎓 {t.tutor}</h2>
          {p.log.map((n, i) => (
            <p key={i} className={`text-sm ${n.who === 'tutor' ? 'text-indigo-800' : n.who === 'opponent' ? 'text-rose-800' : 'text-slate-800'}`}>
              <span className="mr-1 text-xs text-slate-400">{Math.ceil(n.ply / 2)}.</span>
              {n.who === 'opponent' ? `${t.opp}: ` : ''}{n.text}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}
