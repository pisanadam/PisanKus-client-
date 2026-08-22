/**
 * The pieces a profile icon is built from: a background and a symbol.
 *
 * The shapes are plain geometry in a 0..1 square rather than image files, so the
 * same table draws an icon at any size without a sprite sheet, and the Android
 * app can carry the identical one (`PisanKusProfileIcon.java`) — an icon made on
 * one of them is the same picture on the other.
 *
 * Only the table lives here; the drawing is in the renderer, which is the side
 * that has a canvas. The main process reads this file to check that an icon it
 * is asked to store was built from pieces that exist.
 */

export interface IconBackground {
  id: string
  /** Vertical gradient, top to bottom. */
  from: string
  to: string
}

export type IconShape =
  | { kind: 'poly'; points: [number, number][]; color: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; color: string }

export interface IconSymbol {
  id: string
  /** Translation source text. */
  label: string
  /** Empty for `initials`, which is drawn from the profile's name instead. */
  shapes: IconShape[]
}

/** What a profile stores, so the editor reopens on the icon it made. */
export interface IconRecipe {
  background: string
  symbol: string
}

export const ICON_BACKGROUNDS: IconBackground[] = [
  { id: 'turquoise', from: '#2ad4d4', to: '#0e8f8f' },
  { id: 'ocean', from: '#4aa8ff', to: '#1f5fd0' },
  { id: 'indigo', from: '#8a7cff', to: '#4b3fc4' },
  { id: 'violet', from: '#c07cf0', to: '#7c3fb8' },
  { id: 'rose', from: '#ff7d9e', to: '#c9385f' },
  { id: 'ember', from: '#ff8a5c', to: '#d1441f' },
  { id: 'amber', from: '#ffc94a', to: '#d18c0f' },
  { id: 'lime', from: '#a8e05a', to: '#5f9c18' },
  { id: 'forest', from: '#4cc47a', to: '#1c7a44' },
  { id: 'mint', from: '#79e6c2', to: '#2a9e7d' },
  { id: 'slate', from: '#8a97a8', to: '#48535f' },
  { id: 'charcoal', from: '#4a5058', to: '#22262b' },
  { id: 'sand', from: '#e8d5a8', to: '#b99a5e' },
  { id: 'cocoa', from: '#b98a63', to: '#7a5436' },
  { id: 'cherry', from: '#e05a5a', to: '#9c2626' },
  { id: 'night', from: '#3a3f6b', to: '#171a30' }
]

export const ICON_SYMBOLS: IconSymbol[] = [
  {
    id: 'grass',
    label: 'Çim bloğu',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#7cc25a' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#9c6f4a' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#7a5537' }
    ]
  },
  {
    id: 'dirt',
    label: 'Toprak',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#a97a52' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#8b6242' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#6c4a30' }
    ]
  },
  {
    id: 'stone',
    label: 'Taş',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#b4b4b4' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#949494' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#767676' }
    ]
  },
  {
    id: 'oak',
    label: 'Meşe',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#d2ac74' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#b08a54' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#8a6a3e' }
    ]
  },
  {
    id: 'sand',
    label: 'Kum',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#f0e0ae' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#d8c68e' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#b5a271' }
    ]
  },
  {
    id: 'gold',
    label: 'Altın',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#ffdc5e' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#e6b52f' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#b8891a' }
    ]
  },
  {
    id: 'iron',
    label: 'Demir',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#e8e8e8' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#c4c4c4' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#9d9d9d' }
    ]
  },
  {
    id: 'diamond',
    label: 'Elmas',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#7cf0e4' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#4fc9be' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#329a91' }
    ]
  },
  {
    id: 'emerald',
    label: 'Zümrüt',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#5ce68a' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#38bd62' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#238a44' }
    ]
  },
  {
    id: 'redstone',
    label: 'Kızıltaş',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#ff6161' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#d13c3c' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#a22828' }
    ]
  },
  {
    id: 'lapis',
    label: 'Lapis',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#5a80e8' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#3a58b5' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#2a4285' }
    ]
  },
  {
    id: 'amethyst',
    label: 'Ametist',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#c69af5' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#9c6ad8' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#7548a8' }
    ]
  },
  {
    id: 'copper',
    label: 'Bakır',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#ef9a66' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#c4713f' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#96502a' }
    ]
  },
  {
    id: 'ice',
    label: 'Buz',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#c6ecff' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#96cdf2' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#6fa9d2' }
    ]
  },
  {
    id: 'netherite',
    label: 'Netherit',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#7a6862' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#574845' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#3c3130' }
    ]
  },
  {
    id: 'obsidian',
    label: 'Obsidyen',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.14], [0.9, 0.36], [0.5, 0.58], [0.1, 0.36]], color: '#4a3f6b' },
      { kind: 'poly', points: [[0.1, 0.36], [0.5, 0.58], [0.5, 0.86], [0.1, 0.64]], color: '#372d52' },
      { kind: 'poly', points: [[0.9, 0.36], [0.9, 0.64], [0.5, 0.86], [0.5, 0.58]], color: '#241d38' }
    ]
  },
  {
    id: 'star',
    label: 'Yıldız',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.12], [0.6, 0.382], [0.88, 0.396], [0.662, 0.573], [0.735, 0.844], [0.5, 0.69], [0.265, 0.844], [0.338, 0.573], [0.12, 0.396], [0.4, 0.382]], color: '#ffd766' },
      { kind: 'poly', points: [[0.5, 0.3], [0.556, 0.443], [0.709, 0.452], [0.59, 0.549], [0.629, 0.698], [0.5, 0.615], [0.371, 0.698], [0.41, 0.549], [0.291, 0.452], [0.444, 0.443]], color: '#ffefb0' }
    ]
  },
  {
    id: 'heart',
    label: 'Kalp',
    shapes: [
      { kind: 'circle', cx: 0.335, cy: 0.375, r: 0.195, color: '#ff6b81' },
      { kind: 'circle', cx: 0.665, cy: 0.375, r: 0.195, color: '#ff6b81' },
      { kind: 'poly', points: [[0.145, 0.44], [0.855, 0.44], [0.5, 0.9]], color: '#ff6b81' },
      { kind: 'circle', cx: 0.335, cy: 0.345, r: 0.075, color: '#ffa8b6' }
    ]
  },
  {
    id: 'sword',
    label: 'Kılıç',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.08], [0.61, 0.24], [0.61, 0.6], [0.39, 0.6], [0.39, 0.24]], color: '#dbe4ee' },
      { kind: 'poly', points: [[0.5, 0.08], [0.61, 0.24], [0.5, 0.24]], color: '#a9b7c6' },
      { kind: 'poly', points: [[0.5, 0.24], [0.61, 0.24], [0.61, 0.6], [0.5, 0.6]], color: '#b9c5d2' },
      { kind: 'poly', points: [[0.26, 0.6], [0.74, 0.6], [0.74, 0.69], [0.26, 0.69]], color: '#c9973f' },
      { kind: 'poly', points: [[0.44, 0.69], [0.56, 0.69], [0.56, 0.88], [0.44, 0.88]], color: '#7a5537' },
      { kind: 'circle', cx: 0.5, cy: 0.9, r: 0.075, color: '#c9973f' }
    ]
  },
  {
    id: 'potion',
    label: 'İksir',
    shapes: [
      { kind: 'circle', cx: 0.5, cy: 0.63, r: 0.27, color: '#dbe4ee' },
      { kind: 'poly', points: [[0.41, 0.24], [0.59, 0.24], [0.59, 0.46], [0.41, 0.46]], color: '#dbe4ee' },
      { kind: 'circle', cx: 0.5, cy: 0.67, r: 0.2, color: '#c455e0' },
      { kind: 'poly', points: [[0.37, 0.13], [0.63, 0.13], [0.63, 0.27], [0.37, 0.27]], color: '#9c6f4a' },
      { kind: 'circle', cx: 0.41, cy: 0.56, r: 0.055, color: '#f0d8f7' }
    ]
  },
  {
    id: 'gem',
    label: 'Değerli taş',
    shapes: [
      { kind: 'poly', points: [[0.5, 0.12], [0.22, 0.38], [0.5, 0.38]], color: '#8ff0e6' },
      { kind: 'poly', points: [[0.5, 0.12], [0.78, 0.38], [0.5, 0.38]], color: '#5fd6c8' },
      { kind: 'poly', points: [[0.22, 0.38], [0.5, 0.38], [0.5, 0.9]], color: '#48bdb0' },
      { kind: 'poly', points: [[0.78, 0.38], [0.5, 0.38], [0.5, 0.9]], color: '#2f9a8f' }
    ]
  },
  {
    id: 'bolt',
    label: 'Şimşek',
    shapes: [
      { kind: 'poly', points: [[0.6, 0.08], [0.26, 0.55], [0.45, 0.55], [0.38, 0.92], [0.74, 0.43], [0.53, 0.43]], color: '#ffd766' },
      { kind: 'poly', points: [[0.6, 0.08], [0.53, 0.43], [0.74, 0.43]], color: '#ffefb0' }
    ]
  },
  {
    id: 'initials',
    label: 'Baş harfler',
    shapes: []
  }
]

export const DEFAULT_RECIPE: IconRecipe = { background: 'turquoise', symbol: 'grass' }

/** Up to two letters for the `initials` symbol, from the profile's name. */
export function initialsFor(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('tr')
  return (words[0][0] + words[1][0]).toLocaleUpperCase('tr')
}

export function randomRecipe(): IconRecipe {
  const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
  return { background: pick(ICON_BACKGROUNDS).id, symbol: pick(ICON_SYMBOLS).id }
}
