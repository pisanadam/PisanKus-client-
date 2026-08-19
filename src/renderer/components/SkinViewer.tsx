import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Texture } from '../../preload'
import { useTexture } from '../lib/useTexture'
import { t } from '../../shared/i18n'

/**
 * Renders a Minecraft skin as a real 3D model out of CSS-transformed boxes.
 * Faces are cut straight out of the 64×64 texture with background-position, so
 * no canvas is involved and cross-origin skin urls render fine.
 */

interface Box {
  /** Size in skin pixels. */
  width: number
  height: number
  depth: number
  /** Texture origin of the box's face group. */
  u: number
  v: number
  /** Centre offset from the model origin (top of the head), in skin pixels. */
  x: number
  y: number
  z: number
  /** Overlay boxes are drawn slightly larger so they sit on top of the base layer. */
  inflate?: number
  className?: string
  /** Rotation of the whole box about its own centre, in degrees. */
  spinX?: number
  spinY?: number
  /** Which texture the box samples. Defaults to the skin. */
  source?: 'skin' | 'cape'
  /** Flips the box, so a legacy skin's single arm can serve both sides. */
  mirror?: boolean
}

type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

/**
 * Standard Minecraft UV unwrap for a box: the four sides sit in one row with
 * top/bottom above them.
 */
function faceUv(box: Box, face: FaceName): { u: number; v: number; w: number; h: number } {
  const { width: w, height: h, depth: d, u, v } = box
  switch (face) {
    case 'top':
      return { u: u + d, v, w, h: d }
    case 'bottom':
      return { u: u + d + w, v, w, h: d }
    case 'right':
      return { u, v: v + d, w: d, h }
    case 'front':
      return { u: u + d, v: v + d, w, h }
    case 'left':
      return { u: u + d + w, v: v + d, w: d, h }
    case 'back':
      return { u: u + d + w + d, v: v + d, w, h }
  }
}

const FACES: FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back']

/**
 * The player's right side faces the viewer's left, so the `right` texture is
 * placed on the -X face.
 */
function faceTransform(face: FaceName, w: number, h: number, d: number): string {
  const centre = 'translate(-50%, -50%)'
  switch (face) {
    case 'front':
      return `${centre} translateZ(${d / 2}px)`
    case 'back':
      return `${centre} rotateY(180deg) translateZ(${d / 2}px)`
    case 'right':
      return `${centre} rotateY(-90deg) translateZ(${w / 2}px)`
    case 'left':
      return `${centre} rotateY(90deg) translateZ(${w / 2}px)`
    case 'top':
      return `${centre} rotateX(90deg) translateZ(${h / 2}px)`
    case 'bottom':
      return `${centre} rotateX(-90deg) translateZ(${h / 2}px)`
  }
}

function faceSize(face: FaceName, w: number, h: number, d: number): [number, number] {
  switch (face) {
    case 'front':
    case 'back':
      return [w, h]
    case 'right':
    case 'left':
      return [d, h]
    case 'top':
    case 'bottom':
      return [w, d]
  }
}

function BoxPart({ box, texture, scale }: { box: Box; texture: Texture; scale: number }): JSX.Element {
  const inflate = box.inflate ?? 0
  const w = (box.width + inflate * 2) * scale
  const h = (box.height + inflate * 2) * scale
  const d = (box.depth + inflate * 2) * scale

  const spin =
    (box.spinY ? ` rotateY(${box.spinY}deg)` : '') +
    (box.spinX ? ` rotateX(${box.spinX}deg)` : '') +
    (box.mirror ? ' scaleX(-1)' : '')

  return (
    <div
      className={`skin-part ${box.className ?? ''}`}
      style={{
        width: 0,
        height: 0,
        left: '50%',
        top: 0,
        transform: `translate3d(${box.x * scale}px, ${box.y * scale}px, ${box.z * scale}px)${spin}`
      }}
    >
      {FACES.map((face) => {
        const uv = faceUv(box, face)
        const [faceW, faceH] = faceSize(face, w, h, d)
        // The texture is sampled at the un-inflated size, then stretched to the
        // inflated face so overlays stay pixel-aligned with the base layer.
        const pixel = faceW / uv.w
        const pixelV = faceH / uv.h

        const style: CSSProperties = {
          width: faceW,
          height: faceH,
          transform: faceTransform(face, w, h, d),
          backgroundImage: `url(${texture.dataUrl})`,
          // Scaled from the texture's real size: skins are 64×64 but capes are
          // 64×32, and a hardcoded 64 would misplace every cape face.
          backgroundSize: `${texture.width * pixel}px ${texture.height * pixelV}px`,
          backgroundPosition: `${-uv.u * pixel}px ${-uv.v * pixelV}px`
        }
        return <div key={face} className="skin-face" style={style} />
      })}
    </div>
  )
}

/**
 * The cape box. Its texture is a separate 64×32 image whose standard unwrap
 * happens to be exactly `faceUv` at u=0, v=0 for a 10×16×1 box.
 *
 * It hangs off the player's back, and the decorated side is the one you see
 * from behind — which is the `back` face in world terms but the `front` face of
 * the unwrap, so the box is spun 180° about Y. The 8° tilt is the lean the game
 * gives a cape at rest.
 */
const CAPE: Box = {
  width: 10,
  height: 16,
  depth: 1,
  u: 0,
  v: 0,
  x: 0,
  y: 16,
  z: -3,
  spinY: 180,
  spinX: -8,
  source: 'cape',
  className: 'cape'
}

/**
 * Builds the box list for a skin.
 *
 * `legacy` covers the original 64×32 texture, which a fair number of old
 * accounts still have. It carries no left arm, left leg, or body overlays — the
 * right limbs are mirrored onto the left — so a modern model laid over it would
 * sample empty space for half the body.
 */
function buildModel(slim: boolean, legacy: boolean): Box[] {
  const armWidth = slim ? 3 : 4
  const armOffset = 4 + armWidth / 2

  if (legacy) {
    return [
      { width: 8, height: 8, depth: 8, u: 0, v: 0, x: 0, y: 4, z: 0 },
      { width: 8, height: 12, depth: 4, u: 16, v: 16, x: 0, y: 14, z: 0 },
      { width: armWidth, height: 12, depth: 4, u: 40, v: 16, x: -armOffset, y: 14, z: 0, className: 'arm arm--right' },
      {
        width: armWidth,
        height: 12,
        depth: 4,
        u: 40,
        v: 16,
        x: armOffset,
        y: 14,
        z: 0,
        mirror: true,
        className: 'arm arm--left'
      },
      { width: 4, height: 12, depth: 4, u: 0, v: 16, x: -2, y: 26, z: 0, className: 'leg leg--right' },
      { width: 4, height: 12, depth: 4, u: 0, v: 16, x: 2, y: 26, z: 0, mirror: true, className: 'leg leg--left' },
      // The hat is the one overlay the old format does have.
      { width: 8, height: 8, depth: 8, u: 32, v: 0, x: 0, y: 4, z: 0, inflate: 0.5, className: 'skin-part--overlay' }
    ]
  }

  return [
    // Base layer
    { width: 8, height: 8, depth: 8, u: 0, v: 0, x: 0, y: 4, z: 0 },
    { width: 8, height: 12, depth: 4, u: 16, v: 16, x: 0, y: 14, z: 0 },
    { width: armWidth, height: 12, depth: 4, u: 40, v: 16, x: -armOffset, y: 14, z: 0, className: 'arm arm--right' },
    { width: armWidth, height: 12, depth: 4, u: 32, v: 48, x: armOffset, y: 14, z: 0, className: 'arm arm--left' },
    { width: 4, height: 12, depth: 4, u: 0, v: 16, x: -2, y: 26, z: 0, className: 'leg leg--right' },
    { width: 4, height: 12, depth: 4, u: 16, v: 48, x: 2, y: 26, z: 0, className: 'leg leg--left' },

    // Overlay layer (hat, jacket, sleeves, trousers)
    { width: 8, height: 8, depth: 8, u: 32, v: 0, x: 0, y: 4, z: 0, inflate: 0.5, className: 'skin-part--overlay' },
    { width: 8, height: 12, depth: 4, u: 16, v: 32, x: 0, y: 14, z: 0, inflate: 0.28, className: 'skin-part--overlay' },
    {
      width: armWidth,
      height: 12,
      depth: 4,
      u: 40,
      v: 32,
      x: -armOffset,
      y: 14,
      z: 0,
      inflate: 0.28,
      className: 'skin-part--overlay arm arm--right'
    },
    {
      width: armWidth,
      height: 12,
      depth: 4,
      u: 48,
      v: 48,
      x: armOffset,
      y: 14,
      z: 0,
      inflate: 0.28,
      className: 'skin-part--overlay arm arm--left'
    },
    {
      width: 4,
      height: 12,
      depth: 4,
      u: 0,
      v: 32,
      x: -2,
      y: 26,
      z: 0,
      inflate: 0.28,
      className: 'skin-part--overlay leg leg--right'
    },
    {
      width: 4,
      height: 12,
      depth: 4,
      u: 0,
      v: 48,
      x: 2,
      y: 26,
      z: 0,
      inflate: 0.28,
      className: 'skin-part--overlay leg leg--left'
    }
  ]
}

export interface SkinViewerProps {
  skinUrl?: string
  /** Already-loaded texture, used to preview a file before it is applied. */
  skinTexture?: Texture
  /** Texture of the cape to hang on the model, if any. */
  capeUrl?: string
  slim?: boolean
  /** Pixels per skin pixel. */
  scale?: number
  className?: string
  /** Distinguishes "still fetching" from "there is nothing to show". */
  loading?: boolean
}

export function SkinViewer({
  skinUrl,
  skinTexture,
  capeUrl,
  slim = false,
  scale = 9,
  className,
  loading = false
}: SkinViewerProps): JSX.Element {
  const fetched = useTexture(skinTexture ? undefined : skinUrl)
  const skin = skinTexture ?? fetched
  const cape = useTexture(capeUrl)
  const [rotation, setRotation] = useState({ x: -12, y: 22 })
  const [dragging, setDragging] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!dragging) return

    const move = (event: PointerEvent): void => {
      if (!last.current) {
        last.current = { x: event.clientX, y: event.clientY }
        return
      }
      const dx = event.clientX - last.current.x
      const dy = event.clientY - last.current.y
      last.current = { x: event.clientX, y: event.clientY }
      setRotation((current) => ({
        // Clamping the pitch keeps the model from tumbling upside down.
        x: Math.max(-60, Math.min(60, current.x + dy * 0.4)),
        y: current.y + dx * 0.5
      }))
    }
    const up = (): void => {
      setDragging(false)
      last.current = null
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging])

  if (!skin) {
    const fetching = loading || Boolean(skinUrl)
    return (
      <div className={`skin-stage ${className ?? ''}`}>
        <div className="empty" style={{ border: 'none' }}>
          <div className="empty__icon">🧍</div>
          <div className="muted">{fetching ? t('Skin yükleniyor…') : t('Bu hesapta özel skin yok.')}</div>
        </div>
      </div>
    )
  }

  // A 64×32 texture is the legacy layout; 64×64 is the modern one.
  const boxes = buildModel(slim, skin.height < 64)
  if (cape) boxes.push(CAPE)
  const modelHeight = 32 * scale

  return (
    <div
      ref={stage}
      className={`skin-stage ${className ?? ''}`}
      onPointerDown={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      style={{ perspective: `${900}px` }}
    >
      <div
        className={dragging ? 'skin-model' : 'skin-model skin-model--idle'}
        style={{
          width: 0,
          height: modelHeight,
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`
        }}
      >
        {boxes.map((box, index) => (
          <BoxPart
            key={index}
            box={box}
            texture={box.source === 'cape' ? cape! : skin}
            scale={scale}
          />
        ))}
      </div>
    </div>
  )
}

/** Flat 2D head render, used for avatars in lists. */
export function SkinHead({
  skinUrl,
  size = 32,
  name
}: {
  skinUrl?: string
  size?: number
  /** Falls back to this player's initial, so the slot is never blank. */
  name?: string
}): JSX.Element {
  const skin = useTexture(skinUrl)

  // Shown while the texture is still being fetched too, so the slot never sits
  // empty the way it did when a stale http url silently failed to load.
  if (!skin) {
    return (
      <div
        className="avatar"
        style={{
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          fontSize: size * 0.45,
          fontWeight: 700
        }}
        aria-hidden="true"
      >
        {name?.trim()?.charAt(0)?.toLocaleUpperCase('tr') ?? ''}
      </div>
    )
  }

  const pixel = size / 8
  const sheet = {
    backgroundImage: `url(${skin.dataUrl})`,
    backgroundSize: `${skin.width * pixel}px ${skin.height * pixel}px`,
    imageRendering: 'pixelated' as const
  }

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        position: 'relative',
        ...sheet,
        backgroundPosition: `${-8 * pixel}px ${-8 * pixel}px`
      }}
    >
      {/* Hat layer on top of the face. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          ...sheet,
          backgroundPosition: `${-40 * pixel}px ${-8 * pixel}px`
        }}
      />
    </div>
  )
}
