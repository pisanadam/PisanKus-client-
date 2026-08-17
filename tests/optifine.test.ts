import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDownloadPage, parseOptiFineDownloads } from '../src/main/minecraft/loaders/optifineSite.ts'

/** Trimmed from optifine.net/downloads, keeping every quirk of the real markup. */
const PAGE = `
  <h2>Minecraft 1.21.4</h2>
  <table class='downloadTable'>
    <tr class='downloadLine downloadLinePreview'>
      <td class='colFile'>OptiFine HD U J4 pre2</td>
      <td class='colDownload'><a href="http://adfoc.us/serve/sitelinks/?id=475250&url=http://optifine.net/adloadx?f=preview_OptiFine_1.21.4_HD_U_J4_pre2.jar&x=e0fa">Download</a></td>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=preview_OptiFine_1.21.4_HD_U_J4_pre2.jar">(Mirror)</a></td>
      <td class='colChangelog'><a href='changelog?f=preview_OptiFine_1.21.4_HD_U_J4_pre2.jar'>Changelog</a></td>
    </tr>
  </table>
  <table class='downloadTable mainTable'>
    <tr class='downloadLine downloadLineMain'>
      <td class='colFile'>OptiFine HD U J3</td>
      <td class='colDownload'><a href="http://adfoc.us/serve/sitelinks/?id=475250&url=http://optifine.net/adloadx?f=OptiFine_1.21.4_HD_U_J3.jar&x=e0fa">Download</a></td>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.21.4_HD_U_J3.jar">(Mirror)</a></td>
    </tr>
  </table>
  <h2>Minecraft 1.8.9</h2>
  <table class='downloadTable mainTable'>
    <tr class='downloadLine downloadLineMain'>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.8.9_HD_U_M6.jar">(Mirror)</a></td>
    </tr>
  </table>
  <h2>Minecraft 1.8</h2>
  <table class='downloadTable mainTable'>
    <tr class='downloadLine downloadLineMain'>
      <td class='colMirror'><a href="http://optifine.net/adloadx?f=OptiFine_1.8.0_HD_U_I7.jar">(Mirror)</a></td>
    </tr>
  </table>
`

test('download table yields one release per build, ad broker links deduped', () => {
  const releases = parseOptiFineDownloads(PAGE)
  assert.deepEqual(releases, [
    { gameVersion: '1.21.4', version: 'HD_U_J4_pre2', preview: true, fileName: 'preview_OptiFine_1.21.4_HD_U_J4_pre2.jar' },
    { gameVersion: '1.21.4', version: 'HD_U_J3', preview: false, fileName: 'OptiFine_1.21.4_HD_U_J3.jar' },
    { gameVersion: '1.8.9', version: 'HD_U_M6', preview: false, fileName: 'OptiFine_1.8.9_HD_U_M6.jar' },
    { gameVersion: '1.8', version: 'HD_U_I7', preview: false, fileName: 'OptiFine_1.8.0_HD_U_I7.jar' }
  ])
})

test('a game version matches only its own builds', () => {
  const releases = parseOptiFineDownloads(PAGE)
  // `1.8.0` is OptiFine's spelling of Minecraft `1.8`; `1.8.9` must not fold
  // into it, or picking either version would install the other.
  assert.deepEqual(
    releases.filter((release) => release.gameVersion === '1.8').map((release) => release.version),
    ['HD_U_I7']
  )
  assert.deepEqual(
    releases.filter((release) => release.gameVersion === '1.8.9').map((release) => release.version),
    ['HD_U_M6']
  )
})

test('an unreadable page yields nothing rather than junk releases', () => {
  assert.deepEqual(parseOptiFineDownloads('<html><body>Service unavailable</body></html>'), [])
})

/** The ad page, as optifine.net serves it: a relative href over plain http. */
const AD_PAGE = `
  <span id="Download">
    <img src="images/download.png" style="vertical-align: middle">
    <a href='downloadx?f=OptiFine_1.21.4_HD_U_J3.jar&amp;x=e0fa4e0f18ec763839f9d61326bc9558' onclick='onDownload()'>OptiFine 1.21.4 HD U J3</a>
  </span>
`

test('the ad page yields an absolute, https download link', () => {
  assert.equal(
    parseDownloadPage(AD_PAGE),
    'https://optifine.net/downloadx?f=OptiFine_1.21.4_HD_U_J3.jar&x=e0fa4e0f18ec763839f9d61326bc9558'
  )
})

test('a download link that is not there is reported as missing', () => {
  assert.equal(parseDownloadPage('<span id="Download">Coming soon</span>'), undefined)
})
