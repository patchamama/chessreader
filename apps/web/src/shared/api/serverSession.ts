import { isDemoHost, isLocalhostHost } from '../env/devMode'
import { useAuthStore } from '../../features/auth/store/authStore'

/**
 * Whether the app can ask its own server: there is a session, or it runs on
 * localhost, where login is optional (the dev API accepts tokenless requests).
 * The demo has no server.
 */
export function hasServerSession(): boolean {
  if (isDemoHost()) return false
  return !!useAuthStore.getState().token || isLocalhostHost()
}
