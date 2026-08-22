/**
 * The "PK" badge, drawn to a picture the operating system can use as the app's
 * icon.
 *
 * The geometry is the one in `resources/icon.svg`, which is what the installer
 * and the download page use — so an icon rendered here is the same mark, only
 * in the accent the player chose. Keeping the proportions as fractions of the
 * tile means it stays right at 16 px in a taskbar and at 512 px in a dock.
 */

/** The second gradient stop. Fixed: it is the brand's yellow, not a setting. */
const HIGHLIGHT = '#ffe17a'

const INSET = 64 / 1024
const RADIUS = 264 / 1024
const FONT = 369 / 1024
const TRACKING = -11 / 1024

export function drawAppMark(
  ctx: CanvasRenderingContext2D,
  size: number,
  accent: string,
  lettering: string
): void {
  const inset = size * INSET
  const tile = size - inset * 2
  const radius = size * RADIUS

  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  // The inset is what keeps the rounded corners alive under the mask macOS and
  // Windows put over app icons.
  ctx.moveTo(inset + radius, inset)
  ctx.arcTo(inset + tile, inset, inset + tile, inset + tile, radius)
  ctx.arcTo(inset + tile, inset + tile, inset, inset + tile, radius)
  ctx.arcTo(inset, inset + tile, inset, inset, radius)
  ctx.arcTo(inset, inset, inset + tile, inset, radius)
  ctx.closePath()

  const gradient = ctx.createLinearGradient(inset, inset, inset + tile, inset + tile)
  gradient.addColorStop(0, accent)
  gradient.addColorStop(1, HIGHLIGHT)
  ctx.fillStyle = gradient
  ctx.fill()

  ctx.font = `800 ${Math.round(size * FONT)}px Inter, "Segoe UI", system-ui, sans-serif`
  ctx.letterSpacing = `${size * TRACKING}px`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = lettering
  ctx.fillText('PK', size / 2, size / 2)
}

/** A PNG of the badge, at the size the window and dock icons are read at. */
export function appMarkDataUrl(accent: string, lettering: string, size = 256): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  drawAppMark(ctx, size, accent, lettering)
  return canvas.toDataURL('image/png')
}
