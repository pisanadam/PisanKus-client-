// Renders resources/icon.svg into the PNGs electron-builder packages.
//
// The icons are committed, so CI never runs this — it only needs running after
// resources/icon.svg changes. Playwright is not a project dependency because it
// would cost every CI install several hundred megabytes for a file that changes
// about once a year; install it on demand:
//
//   npx -y playwright@1 install --with-deps chromium
//   node scripts/icons.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'resources', 'icon.svg')

// 1024 is what macOS and Windows want; the rest are the hicolor sizes Linux
// desktops look for. Each is laid out at its final size rather than downscaled,
// which keeps the letterforms crisp in the small ones.
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

// Sizes that go into the Windows .ico. Left to itself electron-builder converts
// the png into a single 256px entry and lets Windows downscale that into every
// 16px Explorer slot, which turns the wordmark to mush.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Packs PNGs into an .ico. Windows has read PNG-compressed entries since Vista. */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const directory = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0) // 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette colours
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...directory, ...images.map((image) => image.png)])
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('playwright bulunamadı. Kurulum: npx -y playwright@1 install --with-deps chromium')
  process.exit(1)
}

const svg = await readFile(source, 'utf8')
await mkdir(path.join(root, 'resources', 'icons'), { recursive: true })

const browser = await chromium.launch()
const rendered = new Map()
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    )
    const png = await page.screenshot({ omitBackground: true })
    await page.close()

    rendered.set(size, png)
    await writeFile(path.join(root, 'resources', 'icons', `${size}x${size}.png`), png)
    // electron-builder derives the .icns from this one.
    if (size === 1024) await writeFile(path.join(root, 'resources', 'icon.png'), png)
    console.log(`${size}x${size}.png`)
  }
} finally {
  await browser.close()
}

const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: rendered.get(size) })))
await writeFile(path.join(root, 'resources', 'icon.ico'), ico)
console.log(`icon.ico (${ICO_SIZES.join(', ')})`)
