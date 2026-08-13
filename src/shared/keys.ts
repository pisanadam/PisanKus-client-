/**
 * Translation between browser key events and the key names Minecraft writes
 * into options.txt (`key_key.jump:key.keyboard.space`).
 *
 * The game's names come from GLFW, lowercased with dots for word breaks —
 * `key.keyboard.left.shift`, `key.keyboard.page.up`, `key.keyboard.keypad.0`.
 * A browser's `KeyboardEvent.code` is the right thing to read: it names the
 * physical key, so a Turkish layout still reports `KeyW` for the key the game
 * knows as `w`.
 */

/** Minecraft's name for "nothing bound". */
export const UNBOUND = 'key.keyboard.unknown'

/** Codes whose Minecraft name is not just the lowercased code. */
const SPECIAL: Record<string, string> = {
  Space: 'space',
  Enter: 'enter',
  Tab: 'tab',
  Escape: 'escape',
  Backspace: 'backspace',
  CapsLock: 'caps.lock',
  NumLock: 'num.lock',
  ScrollLock: 'scroll.lock',
  PrintScreen: 'print.screen',
  Pause: 'pause',
  Insert: 'insert',
  Delete: 'delete',
  Home: 'home',
  End: 'end',
  PageUp: 'page.up',
  PageDown: 'page.down',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ShiftLeft: 'left.shift',
  ShiftRight: 'right.shift',
  ControlLeft: 'left.control',
  ControlRight: 'right.control',
  AltLeft: 'left.alt',
  AltRight: 'right.alt',
  MetaLeft: 'left.win',
  MetaRight: 'right.win',
  ContextMenu: 'menu',
  Minus: 'minus',
  Equal: 'equal',
  BracketLeft: 'left.bracket',
  BracketRight: 'right.bracket',
  Backslash: 'backslash',
  Semicolon: 'semicolon',
  Quote: 'apostrophe',
  Backquote: 'grave.accent',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
  NumpadAdd: 'keypad.add',
  NumpadSubtract: 'keypad.subtract',
  NumpadMultiply: 'keypad.multiply',
  NumpadDivide: 'keypad.divide',
  NumpadDecimal: 'keypad.decimal',
  NumpadEnter: 'keypad.enter',
  NumpadEqual: 'keypad.equal'
}

/** Converts a `KeyboardEvent.code` into Minecraft's key name. */
export function keyFromCode(code: string): string {
  const special = SPECIAL[code]
  if (special) return `key.keyboard.${special}`

  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return `key.keyboard.${letter[1].toLowerCase()}`

  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return `key.keyboard.${digit[1]}`

  const numpad = /^Numpad(\d)$/.exec(code)
  if (numpad) return `key.keyboard.keypad.${numpad[1]}`

  const fn = /^F(\d{1,2})$/.exec(code)
  if (fn) return `key.keyboard.f${fn[1]}`

  return UNBOUND
}

/** Converts a `MouseEvent.button` into Minecraft's key name. */
export function keyFromMouseButton(button: number): string {
  if (button === 0) return 'key.mouse.left'
  if (button === 1) return 'key.mouse.middle'
  if (button === 2) return 'key.mouse.right'
  // GLFW counts from zero, Minecraft's names for the extra buttons from one.
  return `key.mouse.${button + 1}`
}

const DISPLAY: Record<string, string> = {
  space: 'Boşluk',
  enter: 'Enter',
  tab: 'Tab',
  escape: 'Esc',
  backspace: 'Backspace',
  'caps.lock': 'Caps Lock',
  'num.lock': 'Num Lock',
  'scroll.lock': 'Scroll Lock',
  'print.screen': 'Print Screen',
  pause: 'Pause',
  insert: 'Insert',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  'page.up': 'Page Up',
  'page.down': 'Page Down',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  'left.shift': 'Sol Shift',
  'right.shift': 'Sağ Shift',
  'left.control': 'Sol Ctrl',
  'right.control': 'Sağ Ctrl',
  'left.alt': 'Sol Alt',
  'right.alt': 'Sağ Alt',
  'left.win': 'Sol Win',
  'right.win': 'Sağ Win',
  menu: 'Menü',
  minus: '-',
  equal: '=',
  'left.bracket': '[',
  'right.bracket': ']',
  backslash: '\\',
  semicolon: ';',
  apostrophe: "'",
  'grave.accent': '`',
  comma: ',',
  period: '.',
  slash: '/',
  unknown: 'Atanmadı'
}

/** A label for the binding, for the button face. */
export function keyLabel(key: string | undefined): string {
  if (!key) return 'Atanmadı'

  const mouse = /^key\.mouse\.(.+)$/.exec(key)
  if (mouse) {
    if (mouse[1] === 'left') return 'Sol tık'
    if (mouse[1] === 'right') return 'Sağ tık'
    if (mouse[1] === 'middle') return 'Orta tık'
    return `Fare ${mouse[1]}`
  }

  const keyboard = /^key\.keyboard\.(.+)$/.exec(key)
  if (!keyboard) return key

  const name = keyboard[1]
  const known = DISPLAY[name]
  if (known) return known

  const keypad = /^keypad\.(.+)$/.exec(name)
  if (keypad) return `Num ${keypad[1]}`

  // Single characters and function keys read fine uppercased.
  return name.toUpperCase()
}

export interface KeyBindSpec {
  /** The options.txt key, e.g. `key_key.jump`. */
  key: string
  label: string
  /** The game's own default, used when building a fresh template. */
  default: string
}

/** The bindings the game's Controls screen lists, in its own order. */
export const KEY_BINDS: { title: string; binds: KeyBindSpec[] }[] = [
  {
    title: 'Hareket',
    binds: [
      { key: 'key_key.forward', label: 'İleri', default: 'key.keyboard.w' },
      { key: 'key_key.left', label: 'Sola', default: 'key.keyboard.a' },
      { key: 'key_key.back', label: 'Geri', default: 'key.keyboard.s' },
      { key: 'key_key.right', label: 'Sağa', default: 'key.keyboard.d' },
      { key: 'key_key.jump', label: 'Zıpla', default: 'key.keyboard.space' },
      { key: 'key_key.sneak', label: 'Eğil', default: 'key.keyboard.left.shift' },
      { key: 'key_key.sprint', label: 'Koş', default: 'key.keyboard.left.control' }
    ]
  },
  {
    title: 'Oyun',
    binds: [
      { key: 'key_key.attack', label: 'Saldır / kır', default: 'key.mouse.left' },
      { key: 'key_key.use', label: 'Kullan / yerleştir', default: 'key.mouse.right' },
      { key: 'key_key.pickItem', label: 'Blok seç', default: 'key.mouse.middle' },
      { key: 'key_key.drop', label: 'Eşya at', default: 'key.keyboard.q' },
      { key: 'key_key.inventory', label: 'Envanter', default: 'key.keyboard.e' },
      { key: 'key_key.swapOffhand', label: 'Eller arası değiştir', default: 'key.keyboard.f' },
      { key: 'key_key.chat', label: 'Sohbet', default: 'key.keyboard.t' },
      { key: 'key_key.command', label: 'Komut', default: 'key.keyboard.slash' },
      { key: 'key_key.playerlist', label: 'Oyuncu listesi', default: 'key.keyboard.tab' },
      { key: 'key_key.advancements', label: 'İlerlemeler', default: 'key.keyboard.l' },
      { key: 'key_key.socialInteractions', label: 'Sosyal etkileşimler', default: 'key.keyboard.p' }
    ]
  },
  {
    title: 'Görünüm',
    binds: [
      { key: 'key_key.togglePerspective', label: 'Bakış açısı', default: 'key.keyboard.f5' },
      { key: 'key_key.smoothCamera', label: 'Sinematik kamera', default: UNBOUND },
      { key: 'key_key.fullscreen', label: 'Tam ekran', default: 'key.keyboard.f11' },
      { key: 'key_key.screenshot', label: 'Ekran görüntüsü', default: 'key.keyboard.f2' },
      { key: 'key_key.spectatorOutlines', label: 'İzleyici ana hatları', default: UNBOUND }
    ]
  },
  {
    title: 'Eşya çubuğu',
    binds: [
      ...Array.from({ length: 9 }, (_, index) => ({
        key: `key_key.hotbar.${index + 1}`,
        label: `Yuva ${index + 1}`,
        default: `key.keyboard.${index + 1}`
      })),
      { key: 'key_key.saveToolbarActivator', label: 'Çubuğu kaydet', default: 'key.keyboard.c' },
      { key: 'key_key.loadToolbarActivator', label: 'Çubuğu yükle', default: 'key.keyboard.x' }
    ]
  }
]

export const KEY_BIND_DEFAULTS: Record<string, string> = Object.fromEntries(
  KEY_BINDS.flatMap((group) => group.binds).map((bind) => [bind.key, bind.default])
)
