/**
 * Telling "the network is not there" apart from "the server said no".
 *
 * The launcher falls back to an offline launch on the first and must not on the
 * second: a refused token is a refusal, and quietly starting the game without a
 * session would turn a fixable sign-in problem into a game that cannot join a
 * single server, with nothing on screen to explain why.
 */
const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

export function isNetworkFailure(error: unknown): boolean {
  // fetch reports the real reason one level down, in `cause`, and sometimes two.
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== 'object') break
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (typeof candidate.code === 'string' && OFFLINE_CODES.has(candidate.code)) return true
    if (typeof candidate.message === 'string' && /fetch failed|getaddrinfo|network|ağ/i.test(candidate.message)) {
      return true
    }
    current = candidate.cause
  }
  return false
}
