import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { APP_VERSION } from '../version'
import { useAuthStore } from '../features/auth/store/authStore'
import { isLocalhostHost } from '../shared/env/devMode'
import { useSettingsStore, FONT_FAMILIES } from '../shared/settings/settingsStore'
import SettingsPanel from '../shared/settings/SettingsPanel'
import { NotesPanel } from '../shared/notes/NotesPanel'
import { countPending, useNotesStore } from '../shared/notes/notesStore'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-slate-700 text-white'
      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export default function AppLayout() {
  const { token, user, clear } = useAuthStore()
  const navigate = useNavigate()
  const devMode = isLocalhostHost() && !token
  const [showSettings, setShowSettings] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const notesContent = useNotesStore((s) => s.content)
  const notesPending = countPending(notesContent)
  const showNotesButton = isLocalhostHost() || user?.role === 'admin'

  const settings = useSettingsStore()

  const handleLogout = () => {
    clear()
    navigate('/login')
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: settings.bgColor,
        color: settings.textColor,
        fontFamily: FONT_FAMILIES[settings.fontFamily].css,
        fontSize: `${settings.fontSize}px`,
      }}
    >
      <header data-testid="banner" className="bg-slate-900 text-white shadow-md">
        <div
          className="mx-auto flex max-w-6xl items-center gap-6 py-3"
          style={{ paddingLeft: `${settings.marginH}rem`, paddingRight: `${settings.marginH}rem` }}
        >
          <Link
            to="/library"
            className="flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <span aria-hidden="true">♞</span> Chess Ebook
          </Link>
          <nav className="flex flex-1 items-center gap-1" aria-label="Main">
            <NavLink to="/library" className={navLinkClass}>
              Library
            </NavLink>
            <NavLink to="/webparser" className={navLinkClass}>
              Webparser
            </NavLink>
            {(user?.role === 'admin' || devMode) && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>
          {devMode && (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              dev mode
            </span>
          )}
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
            v{APP_VERSION}
          </span>
          {showNotesButton && (
            <button
              onClick={() => setShowNotes((v) => !v)}
              aria-label="Open notes"
              className="relative rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Notes"
            >
              Notes
              {notesPending > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-amber-500 text-[9px] font-bold text-black leading-none">
                  {notesPending}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Settings"
          >
            ⚙
          </button>
          {token ? (
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Login
            </Link>
          )}
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl py-8"
        style={{ paddingLeft: `${settings.marginH}rem`, paddingRight: `${settings.marginH}rem` }}
      >
        <Outlet />
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showNotes && <NotesPanel onClose={() => setShowNotes(false)} />}
    </div>
  )
}
