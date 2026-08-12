import { useEffect, useRef, useState, type CSSProperties } from 'react'

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

function BoxPart({ box, skinUrl, scale }: { box: Box; skinUrl: string; scale: number }): JSX.Element {
  const inflate = box.inflate ?? 0
  const w = (box.width + inflate * 2) * scale
  const h = (box.height + inflate * 2) * scale
  const d = (box.depth + inflate * 2) * scale

  return (
    <div
      className={`skin-part ${box.className ?? ''}`}
      style={{
        width: 0,
        height: 0,
        left: '50%',
        top: 0,
        transform: `translate3d(${box.x * scale}px, ${box.y * scale}px, ${box.z * scale}px)`
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
          backgroundImage: `url(${skinUrl})`,
          backgroundSize: `${64 * pixel}px ${64 * pixelV}px`,
          backgroundPosition: `${-uv.u * pixel}px ${-uv.v * pixelV}px`
        }
        return <div key={face} className="skin-face" style={style} />
      })}
    </div>
  )
}

function buildModel(slim: boolean): Box[] {
  const armWidth = slim ? 3 : 4
  const armOffset = 4 + armWidth / 2

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
  slim?: boolean
  /** Pixels per skin pixel. */
  scale?: number
  className?: string
  /** Distinguishes "still fetching" from "there is nothing to show". */
  loading?: boolean
}

export function SkinViewer({
  skinUrl,
  slim = false,
  scale = 9,
  className,
  loading = false
}: SkinViewerProps): JSX.Element {
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

  if (!skinUrl) {
    return (
      <div className={`skin-stage ${className ?? ''}`}>
        <div className="empty" style={{ border: 'none' }}>
          <div className="empty__icon">🧍</div>
          <div className="muted">{loading ? 'Skin yükleniyor…' : 'Bu hesapta özel skin yok.'}</div>
        </div>
      </div>
    )
  }

  const boxes = buildModel(slim)
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
          <BoxPart key={index} box={box} skinUrl={skinUrl} scale={scale} />
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
  if (!skinUrl) {
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
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        position: 'relative',
        backgroundImage: `url(${skinUrl})`,
        backgroundSize: `${64 * pixel}px ${64 * pixel}px`,
        backgroundPosition: `${-8 * pixel}px ${-8 * pixel}px`,
        imageRendering: 'pixelated'
      }}
    >
      {/* Hat layer on top of the face. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${skinUrl})`,
          backgroundSize: `${64 * pixel}px ${64 * pixel}px`,
          backgroundPosition: `${-40 * pixel}px ${-8 * pixel}px`,
          imageRendering: 'pixelated'
        }}
      />
    </div>
  )
}
