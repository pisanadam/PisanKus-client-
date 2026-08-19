import { cleanMessage, needsSignIn } from '../../shared/authErrors'
import { t } from '../../shared/i18n'

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
const relative = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

export function formatCount(value: number): string {
  return compact.format(value)
}

export function formatDate(value: number | string | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600e3],
  ['month', 30 * 24 * 3600e3],
  ['day', 24 * 3600e3],
  ['hour', 3600e3],
  ['minute', 60e3]
]

export function formatRelative(value: number | string | undefined): string {
  if (!value) return t('hiç')
  const elapsed = new Date(value).getTime() - Date.now()
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return relative.format(Math.round(elapsed / ms), unit)
  }
  return t('az önce')
}

export function formatPlaytime(ms: number): string {
  const hours = ms / 3600e3
  if (hours < 1) return `${Math.round(ms / 60e3)} dk`
  return `${hours.toFixed(1)} sa`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(1)} ${units[index]}`
}

const LOADER_LABELS: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge',
  optifine: 'OptiFine'
}

export function loaderLabel(loader: string): string {
  return LOADER_LABELS[loader] ?? loader
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Electron prefixes IPC errors with the invoke frame; strip it for readability.
    // The re-auth marker is internal too and never belongs on screen.
    return cleanMessage(error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''))
  }
  return cleanMessage(String(error))
}

/** Whether this failure is one the player can clear by signing in again. */
export function isSignInError(error: unknown): boolean {
  return needsSignIn(error instanceof Error ? error.message : String(error))
}
