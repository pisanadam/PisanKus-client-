/**
 * The launcher's own support strip — no ad network, no third-party script, no
 * tracking. Everything here is a plain link the player has to click, opened in
 * the system browser.
 *
 * Mojang's usage guidelines treat any money-making around Minecraft as
 * "commercial", and they explicitly do not authorise using Minecraft to promote
 * unrelated products. Two rules follow from that, and the UI is built to keep
 * them true:
 *
 *   1. Donating buys nothing. There is no supporter tier, badge or unlocked
 *      feature anywhere in the launcher — "you don't offer the donor something
 *      that only they can use".
 *   2. Nothing here carries Minecraft or Mojang branding, and the strip states
 *      plainly that the launcher is unaffiliated.
 */

/** Shown wherever the launcher links outwards, and in Ayarlar. */
export const DISCLAIMER = 'Opbay Client bağımsız bir projedir; Mojang veya Microsoft ile bağlantılı değildir.'

export interface SupportLink {
  id: string
  label: string
  url: string
  /** Icon name from the renderer's own set. */
  icon: 'compass' | 'sparkle' | 'heart'
}

/** Links that ship with the launcher, both to the project itself. */
export const COMMUNITY_LINKS: SupportLink[] = [
  {
    id: 'modrinth',
    label: 'Modrinth',
    url: 'https://modrinth.com/user/pisankusgaming',
    icon: 'compass'
  },
  {
    id: 'github',
    label: 'Kaynak kodu',
    url: 'https://github.com/pisanadam/opbay-client-',
    icon: 'sparkle'
  }
]

/** A donation address is only accepted as a plain https link. */
export function isUsableSupportUrl(url: string): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
