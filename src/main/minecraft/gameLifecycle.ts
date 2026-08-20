/** Pure lifecycle rule kept isolated so SIGTERM/SIGKILL regressions stay testable. */
export function classifyGameExit(
  code: number | null,
  _signal: NodeJS.Signals | null,
  stopRequested: boolean
): 'exited' | 'crashed' {
  if (stopRequested || code === 0) return 'exited'
  return 'crashed'
}
