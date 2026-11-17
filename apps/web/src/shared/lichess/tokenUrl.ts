/**
 * The token page of Lichess with the permissions already ticked: Lichess fills
 * its form from `scopes[]` and `description` in the address.
 */
export function lichessTokenUrl(scopes: string[], description: string): string {
  const q = [...scopes.map((s) => `scopes[]=${s}`), `description=${encodeURIComponent(description).replace(/%20/g, '+')}`]
  return `https://lichess.org/account/oauth/token/create?${q.join('&')}`
}

/**
 * One token for everything the app does on Lichess: the masters explorer and
 * the user's own games need no permission; playing needs board:play (a seek)
 * and challenge:write (the Lichess AI); study:read opens private studies.
 */
export const LICHESS_ALL_SCOPES = ['board:play', 'challenge:write', 'study:read']

/** The token form with those permissions ticked. */
export const LICHESS_TOKEN_URL = lichessTokenUrl(LICHESS_ALL_SCOPES, 'Chess reader')
