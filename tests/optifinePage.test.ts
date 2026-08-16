import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseDownloadLink,
  parseDownloadsPage,
  parseInstallerName
} from '../src/main/minecraft/loaders/optifinePage.ts'

/**
 * A trimmed copy of optifine.net/downloads: two Minecraft sections, a preview
 * row, the mirror link every row carries a second time, and the changelog link
 * that must not be mistaken for a build.
 */
const DOWNLOADS_PAGE = `
<h2>Minecraft 1.21.1</h2>
<table class="downloadTable">
  <tr class="downloadLine downloadLineMain">
    <td class="colFile">OptiFine 1.21.1 HD U J1</td>
    <td class="colDownload"><a href="http://optifine.net/adloadx?f=OptiFine_1.21.1_HD_U_J1.jar">Download</a></td>
    <td class="colChangelog"><a href="changelog?f=OptiFine_1.21.1_HD_U_J1.jar">changelog</a></td>
    <td class="colMirror"><a href="http://optifine.net/adloadx?f=OptiFine_1.21.1_HD_U_J1.jar">(Mirror)</a></td>
  </tr>
  <tr class="downloadLine downloadLinePreview">
    <td class="colFile">OptiFine 1.21.1 HD U J2 pre3</td>
    <td class="colDownload"><a href='adloadx?f=preview_OptiFine_1.21.1_HD_U_J2_pre3.jar'>Download</a></td>
  </tr>
</table>
<h2>Minecraft 1.12.2</h2>
<table class="downloadTable">
  <tr class="downloadLine downloadLineMain">
    <td class="colFile">OptiFine 1.12.2 HD U G5</td>
    <td class="colDownload"><a href="adloadx?f=OptiFine_1.12.2_HD_U_G5.jar">Download</a></td>
  </tr>
</table>
`

test('parseDownloadsPage reads every build once, with its Minecraft version', () => {
  const builds = parseDownloadsPage(DOWNLOADS_PAGE)
  assert.deepEqual(
    builds.map((build) => `${build.gameVersion} ${build.version}`),
    ['1.21.1 HD_U_J1', '1.21.1 HD_U_J2_pre3', '1.12.2 HD_U_G5']
  )
})

test('parseDownloadsPage marks preview builds and makes page links absolute', () => {
  const builds = parseDownloadsPage(DOWNLOADS_PAGE)
  assert.equal(builds[0].preview, false)
  assert.equal(builds[1].preview, true)
  assert.equal(builds[2].pageUrl, 'https://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G5.jar')
})

test('parseDownloadsPage ignores a page it does not recognise', () => {
  assert.deepEqual(parseDownloadsPage('<html><body>Under maintenance</body></html>'), [])
})

test('parseInstallerName rejects names that do not carry a Minecraft version', () => {
  assert.equal(parseInstallerName('OptiFine_HD_U_J1.jar'), undefined)
  assert.equal(parseInstallerName('changelog.txt'), undefined)
  assert.equal(parseInstallerName('OptiFine_1.21.1.jar'), undefined)
})

test('parseInstallerName keeps every field of a build name', () => {
  assert.deepEqual(parseInstallerName('OptiFine_1.7.10_HD_U_E7.jar'), {
    gameVersion: '1.7.10',
    version: 'HD_U_E7',
    fileName: 'OptiFine_1.7.10_HD_U_E7.jar',
    preview: false
  })
})

test('parseDownloadLink resolves the token link and undoes HTML escaping', () => {
  const page = `
    <span id="Download">
      <a href='downloadx?f=OptiFine_1.21.1_HD_U_J1.jar&amp;x=3f9a2b' onclick='onDownload()'>OptiFine</a>
    </span>`
  assert.equal(
    parseDownloadLink(page),
    'https://optifine.net/downloadx?f=OptiFine_1.21.1_HD_U_J1.jar&x=3f9a2b'
  )
})

test('parseDownloadLink reports a page without a download link', () => {
  assert.equal(parseDownloadLink('<span id="Download">Please wait…</span>'), undefined)
})
