import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_RECIPE,
  ICON_BACKGROUNDS,
  ICON_SYMBOLS,
  randomRecipe,
  type IconRecipe
} from '../../shared/profileIcon'
import { drawProfileIcon } from '../lib/drawProfileIcon'
import { t } from '../../shared/i18n'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** The size the saved picture is rendered at; the editor previews are smaller. */
const OUTPUT = 128

/**
 * One icon, drawn on its own canvas.
 *
 * Every swatch and every grid cell is a real drawing rather than a coloured box,
 * so what the player picks from is what they get — including the initials, which
 * change with the profile's name.
 */
function IconCanvas({
  recipe,
  name,
  size,
  className
}: {
  recipe: IconRecipe
  name: string
  size: number
  className?: string
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    // Drawn at the device's pixel density: at 24 px a blurry icon is the only
    // thing anyone would notice about it.
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(size * ratio)
    element.height = Math.round(size * ratio)
    const context = element.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    drawProfileIcon(context, recipe, size, name)
  }, [recipe, name, size])

  return <canvas ref={canvas} className={className} style={{ width: size, height: size }} />
}

export function IconEditor({
  name,
  initial,
  recents,
  onCancel,
  onSave
}: {
  /** The profile's name, which is what the `initials` symbol draws. */
  name: string
  initial?: IconRecipe
  recents: IconRecipe[]
  onCancel: () => void
  onSave: (dataUrl: string, recipe: IconRecipe) => Promise<void> | void
}): JSX.Element {
  const [recipe, setRecipe] = useState<IconRecipe>(initial ?? DEFAULT_RECIPE)
  const [saving, setSaving] = useState(false)

  const symbols = useMemo(() => ICON_SYMBOLS, [])

  const save = async (): Promise<void> => {
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const context = canvas.getContext('2d')
    if (!context) return
    drawProfileIcon(context, recipe, OUTPUT, name)
    setSaving(true)
    try {
      await onSave(canvas.toDataURL('image/png'), recipe)
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <>
      <span className="faint" style={{ marginRight: 'auto' }}>
        {t('Bir arka plan ve bir simge seçin; ikisi birleşip profilin simgesi olur.')}
      </span>
      <button className="btn" onClick={onCancel} disabled={saving}>
        {t('Vazgeç')}
      </button>
      <button className="btn btn--primary" onClick={() => void save()} disabled={saving}>
        {saving ? <div className="spinner" /> : <Icon name="check" size={16} />}
        {t('Simgeyi kaydet')}
      </button>
    </>
  )

  return (
    <Modal title={t('Simge düzenleyici')} onClose={onCancel} wide footer={footer}>
      <div className="icon-editor">
        <div className="icon-editor__preview">
          <IconCanvas recipe={recipe} name={name} size={116} className="icon-editor__hero" />
          <div className="icon-editor__sizes">
            <IconCanvas recipe={recipe} name={name} size={44} className="icon-editor__sample" />
            <IconCanvas recipe={recipe} name={name} size={30} className="icon-editor__sample" />
            <IconCanvas recipe={recipe} name={name} size={20} className="icon-editor__sample" />
          </div>
          <button className="btn btn--sm btn--block" onClick={() => setRecipe(randomRecipe())}>
            <Icon name="refresh" size={14} />
            {t('Rastgele')}
          </button>

          {recents.length > 0 && (
            <>
              <div className="icon-editor__heading">{t('Son kullanılanlar')}</div>
              <div className="icon-editor__recents">
                {recents.map((entry) => (
                  <button
                    key={`${entry.background}:${entry.symbol}`}
                    className="icon-editor__cell"
                    aria-pressed={entry.background === recipe.background && entry.symbol === recipe.symbol}
                    onClick={() => setRecipe(entry)}
                  >
                    <IconCanvas recipe={entry} name={name} size={30} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="icon-editor__choices">
          <div className="icon-editor__heading">{t('Arka plan')}</div>
          <div className="icon-editor__row">
            {ICON_BACKGROUNDS.map((background) => (
              <button
                key={background.id}
                className="icon-editor__cell"
                aria-pressed={background.id === recipe.background}
                onClick={() => setRecipe({ ...recipe, background: background.id })}
              >
                <IconCanvas
                  recipe={{ background: background.id, symbol: recipe.symbol }}
                  name={name}
                  size={40}
                />
              </button>
            ))}
          </div>

          <div className="icon-editor__heading">{t('Simge')}</div>
          <div className="icon-editor__grid">
            {symbols.map((symbol) => (
              <button
                key={symbol.id}
                className="icon-editor__cell"
                aria-pressed={symbol.id === recipe.symbol}
                title={t(symbol.label)}
                onClick={() => setRecipe({ ...recipe, symbol: symbol.id })}
              >
                <IconCanvas
                  recipe={{ background: recipe.background, symbol: symbol.id }}
                  name={name}
                  size={44}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
