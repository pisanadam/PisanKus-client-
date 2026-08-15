/**
 * Marking the errors only a fresh sign-in can clear.
 *
 * An error thrown in the main process crosses the IPC boundary as a plain
 * string — the class, the code and every extra field are lost on the way. So
 * the marker travels inside the message itself and is stripped again before the
 * text is shown.
 */

const MARKER = 'PISANKUS_REAUTH::'

/** Wraps a message so the renderer knows to offer "Tekrar oturum aç". */
export function reauthError(message: string): string {
  return MARKER + message
}

/** Whether this failure is one signing in again would fix. */
export function needsSignIn(message: string): boolean {
  return message.includes(MARKER)
}

/** The message without the marker, safe to show as-is. */
export function cleanMessage(message: string): string {
  return message.replace(MARKER, '').trim()
}
