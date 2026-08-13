import { safeStorage } from 'electron'

/**
 * Encryption for the tokens kept in the launcher's database.
 *
 * Electron's `safeStorage` hands the work to the operating system's own
 * credential store — DPAPI on Windows, Keychain on macOS, libsecret or
 * kwallet on Linux. The key is tied to the logged-in user account, so a copied
 * `opbay-client.json` is useless on another machine or under another user.
 *
 * This is deliberately not what the official Minecraft launcher does: it keeps
 * its access and refresh tokens in plain JSON, which is exactly the thing worth
 * improving on.
 */

/** Marks a value this module wrote, so plaintext from older files is spotted. */
const PREFIX = 'enc.v1:'

/**
 * Whether the operating system offered a real backend.
 *
 * On a Linux box with no keyring running, Electron falls back to a
 * "basic_text" backend that is obfuscation rather than encryption. Treating
 * that as encrypted would be a false promise, so it is reported separately.
 */
export function encryptionStatus(): { available: boolean; backend: string } {
  if (!safeStorage.isEncryptionAvailable()) return { available: false, backend: 'yok' }

  const backend =
    process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform
  return { available: backend !== 'basic_text', backend }
}

/**
 * Encrypts a token for storage. Returns the value unchanged when the system has
 * nowhere safe to put the key — a launcher that refused to sign in on such a
 * machine would be worse than one that stores the token as the official
 * launcher already does.
 */
export function protect(value: string | undefined): string | undefined {
  if (!value) return value
  if (value.startsWith(PREFIX)) return value
  if (!encryptionStatus().available) return value

  try {
    return PREFIX + safeStorage.encryptString(value).toString('base64')
  } catch {
    return value
  }
}

/** Reverses `protect`. Plain values pass through, which is how old files migrate. */
export function reveal(value: string | undefined): string | undefined {
  if (!value?.startsWith(PREFIX)) return value

  try {
    return safeStorage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64'))
  } catch {
    // Written under a different OS user or a reset keyring: the token cannot be
    // recovered, and an empty one simply asks the player to sign in again.
    return undefined
  }
}
