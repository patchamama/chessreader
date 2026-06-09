const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]']

export function isLocalhostHost(): boolean {
  return LOCAL_HOSTNAMES.includes(window.location.hostname)
}

/** True when running on GitHub Pages (*.github.io) or localhost — both run demo mode. */
export function isDemoHost(): boolean {
  const h = window.location.hostname
  return isLocalhostHost() || h.endsWith('.github.io') || h === 'demo.chessreader.app'
}
