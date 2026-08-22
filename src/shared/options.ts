/**
 * Reading, writing and describing Minecraft's `options.txt`.
 *
 * The file is a flat `key:value` list. Values are formatted per key rather than
 * per type — `graphicsMode` is a bare int, `renderClouds` is a quoted string,
 * `resourcePacks` is a JSON array — and the exact spelling changes between game
 * versions. So the launcher keeps the user's file as raw text and only rewrites
 * the keys it actually understands, leaving everything else byte for byte as it
 * was. That way importing a file from a real installation never loses a setting
 * this build has never heard of.
 */

import { KEY_BINDS, KEY_BIND_DEFAULTS } from './keys.ts'

export type OptionKind =
  | { kind: 'bool' }
  /** A Minecraft key binding, captured by pressing the key. */
  | { kind: 'keybind' }
  | { kind: 'int'; min: number; max: number; step?: number; unit?: string; maxLabel?: string }
  | { kind: 'float'; min: number; max: number; step?: number; percent?: boolean }
  /** Stored as -1..1 but shown in degrees, the way the game's slider does. */
  | { kind: 'fov' }
  /** Bare integer with named values. */
  | { kind: 'enum'; values: { value: string; label: string }[] }
  /** Same, but written with surrounding quotes. */
  | { kind: 'quoted'; values: { value: string; label: string }[] }
  | { kind: 'text' }

export interface OptionSpec {
  key: string
  /** Translation source text; `{name}` placeholders come from labelVars. */
  label: string
  labelVars?: Record<string, string | number>
  hint?: string
  type: OptionKind
}

export interface OptionGroup {
  title: string
  options: OptionSpec[]
}

const VOLUMES: [string, string][] = [
  ['master', 'Ana ses'],
  ['music', 'Müzik'],
  ['record', 'Müzik kutusu'],
  ['weather', 'Hava durumu'],
  ['block', 'Bloklar'],
  ['hostile', 'Düşman yaratıklar'],
  ['neutral', 'Dost yaratıklar'],
  ['player', 'Oyuncu'],
  ['ambient', 'Ortam'],
  ['voice', 'Ses/konuşma']
]

const MODEL_PARTS: [string, string][] = [
  ['cape', 'Pelerin'],
  ['jacket', 'Ceket'],
  ['left_sleeve', 'Sol kol'],
  ['right_sleeve', 'Sağ kol'],
  ['left_pants_leg', 'Sol paça'],
  ['right_pants_leg', 'Sağ paça'],
  ['hat', 'Şapka']
]

/** Grouped the way the in-game menus are, with the game's own value ranges. */
export const OPTION_GROUPS: OptionGroup[] = [
  {
    title: 'Grafikler',
    options: [
      {
        key: 'renderDistance',
        label: 'Görüş mesafesi',
        type: { kind: 'int', min: 2, max: 32, unit: 'yığın' }
      },
      {
        key: 'simulationDistance',
        label: 'Benzetim mesafesi',
        type: { kind: 'int', min: 5, max: 32, unit: 'yığın' }
      },
      {
        key: 'maxFps',
        label: 'Azami kare hızı',
        // The game treats the top of the slider as unlimited.
        type: { kind: 'int', min: 10, max: 260, step: 10, unit: 'FPS', maxLabel: 'Sınırsız' }
      },
      {
        key: 'graphicsMode',
        label: 'Grafikler',
        type: {
          kind: 'enum',
          values: [
            { value: '0', label: 'Hızlı' },
            { value: '1', label: 'Şık' },
            { value: '2', label: 'Muhteşem' }
          ]
        }
      },
      { key: 'fov', label: 'Görüş açısı', type: { kind: 'fov' } },
      { key: 'gamma', label: 'Parlaklık', type: { kind: 'float', min: 0, max: 1, percent: true } },
      {
        key: 'guiScale',
        label: 'Arayüz ölçeği',
        type: {
          kind: 'enum',
          values: [
            { value: '0', label: 'Otomatik' },
            { value: '1', label: '1x' },
            { value: '2', label: '2x' },
            { value: '3', label: '3x' },
            { value: '4', label: '4x' }
          ]
        }
      },
      {
        key: 'particles',
        label: 'Parçacıklar',
        type: {
          kind: 'enum',
          values: [
            { value: '0', label: 'Tümü' },
            { value: '1', label: 'Azaltılmış' },
            { value: '2', label: 'En az' }
          ]
        }
      },
      {
        key: 'renderClouds',
        label: 'Bulutlar',
        type: {
          kind: 'quoted',
          values: [
            { value: 'true', label: 'Şık' },
            { value: 'fast', label: 'Hızlı' },
            { value: 'false', label: 'Kapalı' }
          ]
        }
      },
      { key: 'ao', label: 'Yumuşak aydınlatma', type: { kind: 'bool' } },
      { key: 'enableVsync', label: 'Dikey eşitleme', type: { kind: 'bool' } },
      { key: 'entityShadows', label: 'Varlık gölgeleri', type: { kind: 'bool' } },
      { key: 'bobView', label: 'Yürürken sallanma', type: { kind: 'bool' } },
      { key: 'fullscreen', label: 'Tam ekran', type: { kind: 'bool' } },
      {
        key: 'biomeBlendRadius',
        label: 'Biyom geçiş yumuşatma',
        type: { kind: 'int', min: 0, max: 7 }
      },
      {
        key: 'entityDistanceScaling',
        label: 'Varlık görüş çarpanı',
        type: { kind: 'float', min: 0.5, max: 5, step: 0.25 }
      }
    ]
  },
  {
    title: 'Ses',
    options: VOLUMES.map(([key, label]) => ({
      key: `soundCategory_${key}`,
      label,
      type: { kind: 'float', min: 0, max: 1, percent: true } as OptionKind
    }))
  },
  {
    title: 'Kontroller',
    options: [
      {
        key: 'mouseSensitivity',
        label: 'Fare hassasiyeti',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      { key: 'invertYMouse', label: 'Fareyi ters çevir', type: { kind: 'bool' } },
      { key: 'autoJump', label: 'Otomatik zıplama', type: { kind: 'bool' } },
      { key: 'toggleCrouch', label: 'Eğilme: aç/kapa', type: { kind: 'bool' } },
      { key: 'toggleSprint', label: 'Koşma: aç/kapa', type: { kind: 'bool' } }
    ]
  },
  // The game lists key bindings as part of Controls, so they follow it here.
  ...KEY_BINDS.map((group) => ({
    title: `Tuşlar · ${group.title}`,
    options: group.binds.map((bind) => ({
      key: bind.key,
      label: bind.label,
      labelVars: bind.labelVars,
      type: { kind: 'keybind' } as OptionKind
    }))
  })),
  {
    title: 'Sohbet ve dil',
    options: [
      { key: 'lang', label: 'Oyun dili', hint: 'Örnek: tr_tr, en_us', type: { kind: 'text' } },
      { key: 'chatScale', label: 'Sohbet ölçeği', type: { kind: 'float', min: 0, max: 1, percent: true } },
      { key: 'chatOpacity', label: 'Sohbet saydamlığı', type: { kind: 'float', min: 0, max: 1, percent: true } },
      { key: 'showSubtitles', label: 'Altyazılar', type: { kind: 'bool' } }
    ]
  },
  {
    title: 'Erişilebilirlik',
    options: [
      {
        key: 'narrator',
        label: 'Anlatıcı',
        type: {
          kind: 'enum',
          values: [
            { value: '0', label: 'Kapalı' },
            { value: '1', label: 'Her şeyi oku' },
            { value: '2', label: 'Yalnızca sohbet' },
            { value: '3', label: 'Yalnızca sistem' }
          ]
        }
      },
      { key: 'highContrast', label: 'Yüksek karşıtlık', type: { kind: 'bool' } },
      {
        key: 'textBackgroundOpacity',
        label: 'Yazı arka planı',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'backgroundForChatOnly',
        label: 'Arka plan yalnızca sohbette',
        type: { kind: 'bool' }
      },
      {
        key: 'notificationDisplayTime',
        label: 'Bildirim süresi',
        type: { kind: 'float', min: 0.5, max: 10, step: 0.5 }
      },
      { key: 'hideLightningFlashes', label: 'Şimşek parlamalarını gizle', type: { kind: 'bool' } },
      { key: 'darkMojangStudiosBackground', label: 'Koyu açılış ekranı', type: { kind: 'bool' } },
      {
        key: 'damageTiltStrength',
        label: 'Hasar sarsıntısı',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'screenEffectScale',
        label: 'Bozulma efektleri',
        hint: 'Nether portalı ve benzeri ekran bozulmaları',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'fovEffectScale',
        label: 'Görüş açısı efekti',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'darknessEffectScale',
        label: 'Karanlık efekti',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'glintSpeed',
        label: 'Büyü parıltısı hızı',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'glintStrength',
        label: 'Büyü parıltısı şiddeti',
        type: { kind: 'float', min: 0, max: 1, percent: true }
      },
      {
        key: 'panoramaScrollSpeed',
        label: 'Menü arka planı hızı',
        type: { kind: 'float', min: 0.1, max: 10, step: 0.1 }
      },
      {
        key: 'menuBackgroundBlurriness',
        label: 'Menü arka planı bulanıklığı',
        type: { kind: 'int', min: 0, max: 10 }
      }
    ]
  },
  {
    title: 'Karakter görünümü',
    options: MODEL_PARTS.map(([key, label]) => ({
      key: `modelPart_${key}`,
      label,
      type: { kind: 'bool' } as OptionKind
    }))
  }
]

export const OPTION_SPECS: Record<string, OptionSpec> = Object.fromEntries(
  OPTION_GROUPS.flatMap((group) => group.options).map((option) => [option.key, option])
)

/** The game's own defaults, so a fresh template starts somewhere sensible. */
export const OPTION_DEFAULTS: Record<string, string> = {
  ...KEY_BIND_DEFAULTS,
  renderDistance: '12',
  simulationDistance: '12',
  maxFps: '120',
  graphicsMode: '1',
  fov: '0.0',
  gamma: '0.5',
  guiScale: '0',
  particles: '0',
  renderClouds: '"true"',
  ao: 'true',
  enableVsync: 'true',
  entityShadows: 'true',
  bobView: 'true',
  fullscreen: 'false',
  biomeBlendRadius: '2',
  entityDistanceScaling: '1.0',
  mouseSensitivity: '0.5',
  invertYMouse: 'false',
  autoJump: 'false',
  toggleCrouch: 'false',
  toggleSprint: 'false',
  lang: 'tr_tr',
  chatScale: '1.0',
  chatOpacity: '1.0',
  showSubtitles: 'false',
  narrator: '0',
  highContrast: 'false',
  textBackgroundOpacity: '0.50',
  backgroundForChatOnly: 'true',
  notificationDisplayTime: '1.0',
  hideLightningFlashes: 'false',
  darkMojangStudiosBackground: 'false',
  damageTiltStrength: '1.00',
  screenEffectScale: '1.00',
  fovEffectScale: '1.00',
  darknessEffectScale: '1.00',
  glintSpeed: '0.50',
  glintStrength: '0.75',
  panoramaScrollSpeed: '1.0',
  menuBackgroundBlurriness: '5',
  ...Object.fromEntries(VOLUMES.map(([key]) => [`soundCategory_${key}`, '1.0'])),
  ...Object.fromEntries(MODEL_PARTS.map(([key]) => [`modelPart_${key}`, 'true']))
}

/**
 * Splits the file into key/value pairs, keeping the original line order.
 *
 * Anything unparseable (blank lines, a stray comment) is preserved as a
 * positional entry so serialising round-trips the file.
 */
export type OptionLine = { key: string; value: string } | { raw: string }

export function parseOptions(text: string): OptionLine[] {
  return text
    .split(/\r?\n/)
    .filter((line, index, all) => line.length > 0 || index < all.length - 1)
    .map((line) => {
      const separator = line.indexOf(':')
      if (separator <= 0) return { raw: line }
      return { key: line.slice(0, separator), value: line.slice(separator + 1) }
    })
}

export function serialiseOptions(lines: OptionLine[]): string {
  return lines.map((line) => ('raw' in line ? line.raw : `${line.key}:${line.value}`)).join('\n') + '\n'
}

/**
 * Reads a single key out of parsed lines.
 *
 * The last occurrence wins, because that is the one Minecraft uses: it loads
 * the file into a map one line at a time, so a repeated key overwrites the
 * earlier value. Reading the first instead would show the player a number the
 * game is going to ignore — and a file with a repeated key is not exotic, it is
 * what a hand-edit or a modpack's own options.txt can easily leave behind.
 */
export function readOption(lines: OptionLine[], key: string): string | undefined {
  let found: string | undefined
  for (const line of lines) if (!('raw' in line) && line.key === key) found = line.value
  return found
}

/**
 * Collapses a repeated key down to one line, keeping the value the game would
 * have used.
 *
 * Leaving duplicates in place means the launcher and the game can be looking at
 * different values in the same file, with nothing on screen to say so.
 */
export function dedupeOptions(lines: OptionLine[]): OptionLine[] {
  const last = new Map<string, string>()
  for (const line of lines) if (!('raw' in line)) last.set(line.key, line.value)

  const written = new Set<string>()
  const output: OptionLine[] = []
  for (const line of lines) {
    if ('raw' in line) {
      output.push(line)
      continue
    }
    if (written.has(line.key)) continue
    written.add(line.key)
    output.push({ key: line.key, value: last.get(line.key)! })
  }
  return output
}

/** Sets a key in place, appending it if the file does not have it yet. */
export function writeOption(lines: OptionLine[], key: string, value: string): OptionLine[] {
  let found = false
  const next = lines.map((line) => {
    if ('raw' in line || line.key !== key) return line
    found = true
    return { key, value }
  })
  return found ? next : [...next, { key, value }]
}

/** Builds a complete template from the game's defaults. */
export function defaultOptionsText(): string {
  return serialiseOptions(
    Object.entries(OPTION_DEFAULTS).map(([key, value]) => ({ key, value }))
  )
}

// --- value coercion, so the UI can work in natural units -------------------

export function fovToDegrees(value: string): number {
  // options.txt stores -1..1; the game's slider reads 30°..110°.
  return Math.round(70 + (Number.parseFloat(value) || 0) * 40)
}

export function degreesToFov(degrees: number): string {
  return ((degrees - 70) / 40).toFixed(4).replace(/0+$/, '0')
}
