import { useEffect, useMemo, useRef, useState } from 'react'
import {
  OPTION_GROUPS,
  defaultOptionsText,
  degreesToFov,
  fovToDegrees,
  parseOptions,
  readOption,
  serialiseOptions,
  writeOption,
  type OptionSpec
} from '../../shared/options'
import { KEY_BIND_DEFAULTS, UNBOUND, keyFromCode, keyFromMouseButton, keyLabel } from '../../shared/keys'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { t } from '../../shared/i18n'

/**
 * Editor for the options.txt template.
 *
 * It works on the raw text rather than a parsed object so that keys the
 * launcher does not model — key bindings, resource pack lists, the game's own
 * `version` stamp — survive an edit untouched.
 */
export function OptionsEditor({
  value,
  onSave,
  onClose,
  notify
}: {
  value: string
  onSave: (text: string) => Promise<void>
  onClose: () => void
  notify: (message: unknown, kind?: 'info' | 'error') => void
}): JSX.Element {
  const [text, setText] = useState(() => value.trim() || defaultOptionsText())
  const [raw, setRaw] = useState(false)
  const [saving, setSaving] = useState(false)

  const lines = useMemo(() => parseOptions(text), [text])

  const set = (key: string, next: string): void => {
    setText(serialiseOptions(writeOption(lines, key, next)))
  }

  /** Keys present in the file that no group covers — shown as a count only. */
  const extraCount = useMemo(() => {
    const known = new Set(OPTION_GROUPS.flatMap((group) => group.options.map((option) => option.key)))
    return lines.filter((line) => !('raw' in line) && !known.has(line.key)).length
  }, [lines])

  const footer = (
    <>
      <button className="btn" onClick={onClose} disabled={saving}>
        {t('Vazgeç')}
      </button>
      <button
        className="btn btn--primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            await onSave(text)
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? <div className="spinner" /> : <Icon name="check" size={16} />}
        Kaydet
      </button>
    </>
  )

  return (
    <Modal title={t('Minecraft ayarları')} onClose={onClose} wide footer={footer}>
      <div className="options">
        <div className="options__bar">
          <button
            className="btn btn--sm"
            onClick={async () => {
              try {
                const imported = await api.options.importFile()
                if (imported) {
                  setText(imported)
                  notify(t('options.txt içe aktarıldı.'))
                }
              } catch (error) {
                notify(error, 'error')
              }
            }}
          >
            <Icon name="download" size={15} />
            {t('Dosyadan içe aktar')}
          </button>

          <button className="btn btn--sm" onClick={() => setText(defaultOptionsText())}>
            <Icon name="refresh" size={15} />
            {t('Varsayılanlar')}
          </button>

          <div className="topbar__spacer" />

          <button className="btn btn--sm" aria-pressed={raw} onClick={() => setRaw(!raw)}>
            <Icon name="terminal" size={15} />
            {t('Ham dosya')}
          </button>
        </div>

        {raw ? (
          <>
            <textarea
              className="textarea options__raw"
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <p className="faint">
              {t('Doğrudan options.txt biçimi. Her satır')} <code>{t('anahtar:değer')}</code>.
            </p>
          </>
        ) : (
          <div className="options__groups">
            {OPTION_GROUPS.map((group) => (
              <section key={group.title} className="settings-group">
                <div className="section-title">{t(group.title)}</div>
                {group.options.map((option) => (
                  <OptionRow
                    key={option.key}
                    spec={option}
                    value={readOption(lines, option.key)}
                    onChange={(next) => set(option.key, next)}
                  />
                ))}
              </section>
            ))}

            {extraCount > 0 && (
              <p className="faint">
                {t(
                  'Dosyada burada gösterilmeyen {count} ayar daha var (tuş atamaları, kaynak paketleri gibi). Bunlara dokunulmuyor, olduğu gibi korunuyor.',
                  { count: extraCount }
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function OptionRow({
  spec,
  value,
  onChange
}: {
  spec: OptionSpec
  value: string | undefined
  onChange: (next: string) => void
}): JSX.Element {
  const type = spec.type

  return (
    <div className="settings-row">
      <div>
        <div className="settings-row__label">{t(spec.label, spec.labelVars)}</div>
        {spec.hint && <div className="faint">{t(spec.hint)}</div>}
      </div>
      <div className="options__control">
        {type.kind === 'bool' && (
          <div className="chips">
            <button className="chip" aria-pressed={value === 'true'} onClick={() => onChange('true')}>
              {t('Açık')}
            </button>
            <button className="chip" aria-pressed={value !== 'true'} onClick={() => onChange('false')}>
              {t('Kapalı')}
            </button>
          </div>
        )}

        {type.kind === 'int' && (
          <Slider
            min={type.min}
            max={type.max}
            step={type.step ?? 1}
            value={Number.parseInt(value ?? '', 10) || type.min}
            format={(n) =>
              n >= type.max && type.maxLabel ? type.maxLabel : `${n}${type.unit ? ` ${type.unit}` : ''}`
            }
            onChange={(n) => onChange(String(n))}
          />
        )}

        {type.kind === 'float' && (
          <Slider
            min={type.min}
            max={type.max}
            step={type.step ?? 0.05}
            value={Number.parseFloat(value ?? '') || type.min}
            format={(n) => (type.percent ? `%${Math.round(n * 100)}` : n.toFixed(2))}
            onChange={(n) => onChange(type.percent ? n.toFixed(2) : String(n))}
          />
        )}

        {type.kind === 'fov' && (
          <Slider
            min={30}
            max={110}
            step={1}
            value={fovToDegrees(value ?? '0.0')}
            format={(n) => `${n}°`}
            onChange={(n) => onChange(degreesToFov(n))}
          />
        )}

        {(type.kind === 'enum' || type.kind === 'quoted') && (
          <select
            className="select"
            value={type.kind === 'quoted' ? (value ?? '').replace(/"/g, '') : (value ?? '')}
            onChange={(event) =>
              onChange(type.kind === 'quoted' ? `"${event.target.value}"` : event.target.value)
            }
          >
            {type.values.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(entry.label)}
              </option>
            ))}
          </select>
        )}

        {type.kind === 'keybind' && (
          /* A key the file does not mention is not unbound — the game falls back
             to its own default, so the editor shows that rather than "Atanmadı". */
          <KeyBindButton value={value ?? KEY_BIND_DEFAULTS[spec.key]} onChange={onChange} />
        )}

        {type.kind === 'text' && (
          <input
            className="input"
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Captures a key binding. While listening, events are taken in the capture phase
 * and stopped there — otherwise Escape would reach the modal's own handler and
 * close the dialog instead of cancelling the capture.
 */
function KeyBindButton({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (next: string) => void
}): JSX.Element {
  const [listening, setListening] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!listening) return

    const finish = (next?: string): void => {
      setListening(false)
      if (next) onChange(next)
    }

    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      // Escape backs out without changing the binding, as the game does.
      finish(event.code === 'Escape' ? undefined : keyFromCode(event.code))
    }

    const onMouse = (event: MouseEvent): void => {
      // The click that started listening must not immediately bind left mouse.
      if (event.target === button.current) return
      event.preventDefault()
      event.stopPropagation()
      finish(keyFromMouseButton(event.button))
    }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('contextmenu', preventDefault, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('contextmenu', preventDefault, true)
    }
  }, [listening, onChange])

  const unbound = !value || value === UNBOUND

  return (
    <div className="keybind">
      <button
        ref={button}
        className={listening ? 'btn btn--sm keybind__key keybind__key--listening' : 'btn btn--sm keybind__key'}
        aria-pressed={listening}
        onClick={() => setListening((current) => !current)}
      >
        {listening ? t('Bir tuşa basın…') : keyLabel(value)}
      </button>
      <button
        className="btn btn--sm btn--ghost btn--icon"
        aria-label={t('Atamayı kaldır')}
        disabled={unbound}
        onClick={() => onChange(UNBOUND)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

function preventDefault(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}

function Slider({
  min,
  max,
  step,
  value,
  format,
  onChange
}: {
  min: number
  max: number
  step: number
  value: number
  format: (value: number) => string
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="slider">
      <input
        className="slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider__value">{format(value)}</span>
    </div>
  )
}
