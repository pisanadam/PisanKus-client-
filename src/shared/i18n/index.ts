/**
 * Translation, keyed by the Turkish source text.
 *
 * The launcher was written in Turkish, and every screen still carries that text
 * in the code. Rather than invent a key for each line — and risk a screen going
 * blank because a key was mistyped — the Turkish sentence itself is the key: a
 * string with no translation simply stays as it was written. That makes adding a
 * language a matter of filling in a table, and makes a missing entry harmless.
 */

export interface LanguageInfo {
  code: string
  /** The language's own name, so it is findable without reading another one. */
  label: string
  /** Right-to-left scripts need the document direction flipped. */
  rtl?: boolean
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية', rtl: true },
  { code: 'fa', label: 'فارسی', rtl: true },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'tk', label: 'Türkmençe' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'ky', label: 'Кыргызча' },
  { code: 'uz', label: "O'zbekcha" }
]

export type Language = string

export type Dictionary = Record<string, string>

/** Filled by `registerDictionaries`, so the tables can be code-split later. */
const dictionaries: Record<string, Dictionary> = {}

export function registerDictionaries(tables: Record<string, Dictionary>): void {
  Object.assign(dictionaries, tables)
}

let current = 'tr'

export function setLanguage(language: Language): void {
  current = language
}

export function currentLanguage(): Language {
  return current
}

export function isRtl(language: Language = current): boolean {
  return LANGUAGES.find((entry) => entry.code === language)?.rtl ?? false
}

/**
 * Picks the closest supported language for a system locale.
 *
 * `zh-Hans-CN`, `zh-CN` and `zh` all mean the same shelf here, so only the
 * primary subtag is compared.
 */
export function detectLanguage(locale: string | undefined): Language {
  const primary = (locale ?? '').toLowerCase().split(/[-_]/)[0]
  return LANGUAGES.some((entry) => entry.code === primary) ? primary : 'tr'
}

/**
 * Translates one line, filling `{name}` placeholders.
 *
 * Placeholders travel with the text rather than being concatenated around it:
 * word order differs between languages, and a sentence built by joining pieces
 * can only ever be right in the language it was built for.
 */
export function t(source: string, vars?: Record<string, string | number>): string {
  const table = dictionaries[current]
  let text = (table && table[source]) || source
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}
