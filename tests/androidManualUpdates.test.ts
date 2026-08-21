import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..', 'android', 'app_pojavlauncher', 'src', 'main')

test('Android shows an update badge only for a tracked installed version', async () => {
  const fragment = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/fragments/PisanModsFragment.java'),
    'utf8'
  )
  assert.match(fragment, /installed != null && hit\.latestVersionNumber != null/)
  assert.match(fragment, /!hit\.latestVersionNumber\.equals\(installed\.versionNumber\)/)
  assert.match(fragment, /mUpdate\.setVisibility\(update \? View\.VISIBLE : View\.GONE\)/)
})

test('Android updates require explicit confirmation and display the orange risk warning below it', async () => {
  const fragment = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/fragments/PisanModsFragment.java'),
    'utf8'
  )
  assert.match(fragment, /showUpdateConfirmation\(hit, version, installed\)/)
  assert.match(fragment, /setTextColor\(ContextCompat\.getColor\(requireContext\(\), R\.color\.warning\)\)/)
  assert.match(fragment, /\.setView\(warning\)/)
  assert.match(fragment, /R\.string\.pisan_mods_update_anyway/)
})

test('Android keeps the installed jar until its replacement is complete and recorded', async () => {
  const fragment = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/fragments/PisanModsFragment.java'),
    'utf8'
  )
  const modrinth = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/PisanKusModrinth.java'),
    'utf8'
  )
  const download = fragment.indexOf('downloadPrimaryFile(version, target)')
  const record = fragment.indexOf('mInstalled.put(')
  const removeOld = fragment.indexOf('new File(target, previousDiskName).delete()')
  assert.ok(download >= 0 && record > download && removeOld > record)
  assert.match(modrinth, /\.pisankus-download/)
  assert.match(modrinth, /Os\.rename\(temporary\.getAbsolutePath\(\), destination\.getAbsolutePath\(\)\)/)
})

test('Android can disable an installed mod by renaming it instead of deleting it', async () => {
  const registry = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/PisanKusInstalledContent.java'),
    'utf8'
  )
  const fragment = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/fragments/PisanModsFragment.java'),
    'utf8'
  )
  assert.match(registry, /entry\.fileName \+ "\.disabled"/)
  assert.match(registry, /setEnabled\(String projectId, boolean enabled\)/)
  assert.match(fragment, /mInstalled\.setEnabled\(hit\.projectId, enabled\)/)
})

test('Android profile editor stores per-profile RAM, resolution and control scales', async () => {
  const profile = await fsp.readFile(
    path.join(root, 'java/net/kdt/pojavlaunch/value/launcherprofiles/MinecraftProfile.java'),
    'utf8'
  )
  const activity = await fsp.readFile(path.join(root, 'java/net/kdt/pojavlaunch/MainActivity.java'), 'utf8')
  assert.match(profile, /Integer memoryMb/)
  assert.match(profile, /Integer resolutionScale/)
  assert.match(profile, /Integer buttonScale/)
  assert.match(activity, /minecraftProfile\.memoryMb/)
  assert.match(activity, /minecraftProfile\.resolutionScale/)
})
