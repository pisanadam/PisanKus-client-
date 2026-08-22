/** Draws a profile icon onto a canvas, from the table in `shared/profileIcon`. */
import {
  ICON_BACKGROUNDS,
  ICON_SYMBOLS,
  initialsFor,
  type IconRecipe,
  type IconShape
} from '../../shared/profileIcon'

const SHADOW = 'rgba(0, 0, 0, 0.27)'
/** Offset of the shadow pass, as a fraction of the icon. */
const SHADOW_X = 0.02
const SHADOW_Y = 0.035

function roundedPath(ctx: CanvasRenderingContext2D, size: number): void {
  const radius = size * 0.22
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.arcTo(size, 0, size, size, radius)
  ctx.arcTo(size, size, 0, size, radius)
  ctx.arcTo(0, size, 0, 0, radius)
  ctx.arcTo(0, 0, size, 0, radius)
  ctx.closePath()
}

function paint(
  ctx: CanvasRenderingContext2D,
  shapes: IconShape[],
  size: number,
  override: string | null,
  dx: number,
  dy: number
): void {
  for (const shape of shapes) {
    ctx.fillStyle = override ?? shape.color
    ctx.beginPath()
    if (shape.kind === 'poly') {
      shape.points.forEach(([x, y], index) => {
        const px = (x + dx) * size
        const py = (y + dy) * size
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
    } else {
      ctx.arc((shape.cx + dx) * size, (shape.cy + dy) * size, shape.r * size, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}

/**
 * Draws one icon, filling the whole context.
 *
 * The symbol is drawn twice: once offset in translucent black, then in its own
 * colours. Without that pass a dark symbol disappears into a dark background,
 * and the player would have to avoid half the combinations.
 */
export function drawProfileIcon(
  ctx: CanvasRenderingContext2D,
  recipe: IconRecipe,
  size: number,
  name: string
): void {
  const background = ICON_BACKGROUNDS.find((entry) => entry.id === recipe.background) ?? ICON_BACKGROUNDS[0]
  const symbol = ICON_SYMBOLS.find((entry) => entry.id === recipe.symbol) ?? ICON_SYMBOLS[0]

  ctx.clearRect(0, 0, size, size)
  ctx.save()
  roundedPath(ctx, size)
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, background.from)
  gradient.addColorStop(1, background.to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  if (symbol.id === 'initials') {
    const text = initialsFor(name)
    ctx.font = `700 ${Math.round(size * 0.44)}px "Segoe UI", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = SHADOW
    ctx.fillText(text, size / 2 + size * SHADOW_X, size / 2 + size * SHADOW_Y)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
    ctx.fillText(text, size / 2, size / 2)
  } else {
    paint(ctx, symbol.shapes, size, SHADOW, SHADOW_X, SHADOW_Y)
    paint(ctx, symbol.shapes, size, null, 0, 0)
  }
  ctx.restore()
}
