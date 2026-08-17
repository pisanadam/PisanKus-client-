import assert from 'node:assert/strict'
import test from 'node:test'
import { optiFineVersionId, parseDownloadsPage } from '../src/main/minecraft/loaders/optifine.ts'

/**
 * A trimmed copy of optifine.net/downloads, keeping the parts the parser reads:
 * the version headings, a main row, a preview row and an older row inside the
 * "+ More" block. OptiFine has no API, so the page's shape is the contract —
 * a test against real markup is what tells us when it changes.
 */
const PAGE = `
<h2>Minecraft 1.21.11</h2>
  <table class='downloadTable mainTable'>
    <tr class='downloadLine downloadLineMain'>
      <td class='colFile'>OptiFine HD U J9</td>
      <td class='colDownload'><a href="http://adfoc.us/serve/sitelinks/?id=475250&url=http://optifine.net/adloadx?f=OptiFine_1.21.11_HD_U_J9.jar&x=395d">Download</a></td>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.21.11_HD_U_J9.jar">(Mirror)</a></td>
      <td class='colDate'>05.02.2026</td>
    </tr>
  </table>
  <div id='more1'>
    <table class='downloadTable'>
      <tr class='downloadLine downloadLineMore'>
        <td class='colFile'>OptiFine HD U J8</td>
        <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.21.11_HD_U_J8.jar">(Mirror)</a></td>
      </tr>
    </table>
  </div>
<h2>Minecraft 1.12.2</h2>
  <table class='downloadTable mainTable'>
    <tr class='downloadLine downloadLinePreview'>
      <td class='colFile'>OptiFine HD U G6 pre1</td>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=preview_OptiFine_1.12.2_HD_U_G6_pre1.jar">(Mirror)</a></td>
    </tr>
    <tr class='downloadLine downloadLineMain'>
      <td class='colFile'>OptiFine HD U G5</td>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G5.jar">(Mirror)</a></td>
    </tr>
  </table>
`

test('the downloads page yields one build per row, grouped by game version', () => {
  const builds = parseDownloadsPage(PAGE)
  assert.deepEqual(
    builds.map((build) => `${build.gameVersion}/${build.patch}`),
    ['1.21.11/HD_U_J9', '1.21.11/HD_U_J8', '1.12.2/HD_U_G6_pre1', '1.12.2/HD_U_G5']
  )
})

test('builds link to the mirror page over https, not the ad redirect', () => {
  const [newest] = parseDownloadsPage(PAGE)
  assert.equal(newest.pageUrl, 'https://optifine.net/adloadx?f=OptiFine_1.21.11_HD_U_J9.jar')
})

test('preview builds are marked so they are never picked automatically', () => {
  const builds = parseDownloadsPage(PAGE)
  assert.deepEqual(
    builds.map((build) => build.preview),
    [false, false, true, false]
  )
})

test('the version id matches what OptiFine names its own installs', () => {
  assert.equal(optiFineVersionId('1.21.11', 'HD_U_J9'), '1.21.11-OptiFine_HD_U_J9')
})
