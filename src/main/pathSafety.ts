import path from 'node:path'

/**
 * Resolves an archive- or service-provided relative path without allowing it to
 * escape the directory the caller owns.
 */
export function resolveInside(root: string, candidate: string, label = 'Dosya yolu'): string {
  if (!candidate || candidate.includes('\0')) throw new Error(`${label} geçersiz.`)

  const portable = candidate.replace(/\\/g, '/')
  const rawSegments = portable.split('/')
  if (
    portable.startsWith('/') ||
    /^[a-zA-Z]:/.test(portable) ||
    rawSegments.some((segment) => segment === '..')
  ) {
    throw new Error(`${label} izin verilen klasörün dışına çıkamaz: ${candidate}`)
  }
  const segments = rawSegments.filter((segment) => segment && segment !== '.')
  if (segments.length === 0) throw new Error(`${label} geçersiz.`)

  const base = path.resolve(root)
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} izin verilen klasörün dışına çıkamaz: ${candidate}`)
  }
  return resolved
}

/** A name supplied over IPC must describe one direct child, not another path. */
export function requireLeafName(candidate: string, label = 'Dosya adı'): string {
  if (
    !candidate ||
    candidate.includes('\0') ||
    candidate === '.' ||
    candidate === '..' ||
    path.basename(candidate) !== candidate
  ) {
    throw new Error(`${label} geçersiz.`)
  }
  return candidate
}

/** Profiles created by the launcher are always direct children of `profiles/`. */
export function requireProfileDirectory(candidate: string): string {
  const resolved = path.resolve(candidate)
  const parent = path.dirname(resolved)
  if (
    resolved === path.parse(resolved).root ||
    resolved === parent ||
    path.basename(parent).toLocaleLowerCase('en-US') !== 'profiles'
  ) {
    throw new Error('Profil klasörü güvenli biçimde doğrulanamadı; dosyalar silinmedi.')
  }
  return resolved
}
