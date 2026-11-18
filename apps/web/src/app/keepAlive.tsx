import { useContext, useEffect, useLayoutEffect, useRef, type ContextType, type ReactNode } from 'react'
import { UNSAFE_LocationContext, useLocation, useOutlet } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store/authStore'
import { useStatusStore } from '../shared/layout/statusStore'

/**
 * The main tabs (first path segment) that stay mounted when you leave them, so
 * coming back shows them as they were: inputs, results, open sections, sub-tab
 * and scroll. Other routes (the reader, login…) mount and unmount as usual.
 */
export const KEEP_ALIVE_TABS = ['library', 'analysis', 'search', 'play', 'training', 'database', 'errors', 'webparser', 'admin'] as const

type LocationCtx = ContextType<typeof UNSAFE_LocationContext>
interface KeptTab { element: ReactNode; location: LocationCtx }

const tabOf = (pathname: string): string | null => {
  const seg = pathname.split('/')[1] ?? ''
  return (KEEP_ALIVE_TABS as readonly string[]).includes(seg) ? seg : null
}

/** Renders the routed page like <Outlet/>, but keeps every visited main tab mounted and hides the inactive ones. */
export function KeepAliveOutlet() {
  const outlet = useOutlet()
  const { pathname } = useLocation()
  const location = useContext(UNSAFE_LocationContext)
  const token = useAuthStore((s) => s.token)
  const active = tabOf(pathname)

  const kept = useRef(new Map<string, KeptTab>())
  const session = useRef(token)
  // A new session (logout, another user) must not see the previous one's pages.
  if (session.current !== token) {
    session.current = token
    kept.current.clear()
  }
  if (active) kept.current.set(active, { element: outlet, location })

  // Window scroll per tab: remembered while it is shown, restored when it comes back.
  const scroll = useRef(new Map<string, number>())
  const containers = useRef(new Map<string, HTMLDivElement | null>())
  useEffect(() => {
    if (!active) return
    const onScroll = () => scroll.current.set(active, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [active])
  useLayoutEffect(() => {
    // Focus must not stay inside a page that was just hidden.
    const focused = document.activeElement
    for (const [tab, el] of containers.current) {
      if (tab !== active && el && focused instanceof HTMLElement && el.contains(focused)) focused.blur()
    }
    const top = active ? scroll.current.get(active) ?? 0 : 0
    if (window.scrollY !== top) {
      try {
        window.scrollTo(0, top)
      } catch {
        // Some embedded views do not implement scrolling.
      }
    }
    // The status bar shows only what the page in front publishes.
    useStatusStore.getState().setHiddenScopes(KEEP_ALIVE_TABS.filter((t) => t !== active))
  }, [active])
  useEffect(() => () => useStatusStore.getState().setHiddenScopes([]), [])

  return (
    <>
      {[...kept.current].map(([tab, { element, location: frozen }]) => (
        <div key={tab} data-keep-alive={tab} hidden={tab !== active} ref={(el) => { containers.current.set(tab, el) }}>
          {/* A hidden page keeps reading its own location, not the one of the page in front. */}
          <UNSAFE_LocationContext.Provider value={tab === active ? location : frozen}>{element}</UNSAFE_LocationContext.Provider>
        </div>
      ))}
      {!active && outlet}
    </>
  )
}
