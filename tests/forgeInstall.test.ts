import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dropEmptyOptions } from '../src/main/minecraft/launchArgs.ts'

/**
 * Forge and NeoForge from 1.17 on do not ship a ready client. Their installer
 * ships a recipe — a chain of Java tools that turn Mojang's client jar into the
 * `-srg`, `-extra` and `-client` jars the loader launches from. The launcher
 * never ran it, so those three files were never created and every Forge profile
 * died before drawing a frame:
 *
 *   java.io.IOException: Invalid paths argument, contained no existing paths:
 *     [... client-1.20.1-20230612.114412-srg.jar, ... -extra.jar, ... -client.jar]
 */
test('the loader recipe runs before the game starts', () => {
  const launcher = readFileSync('src/main/minecraft/launcher.ts', 'utf8')

  const download = launcher.indexOf('await downloadAll(')
  const processors = launcher.indexOf('await runInstallerProcessors(')
  const spawn = launcher.indexOf('spawn(javaPath')

  assert.ok(download > 0 && processors > 0 && spawn > 0)
  // Mojang's client jar is the chain's input, so the download has to come first.
  assert.ok(download < processors, 'istemci jar’ı işlemcilerden önce inmeli')
  assert.ok(processors < spawn, 'işlemciler oyun başlamadan önce çalışmalı')
})

test('a version json without its recipe is not treated as installed', () => {
  const loaders = readFileSync('src/main/minecraft/loaders/index.ts', 'utf8')
  assert.match(loaders, /if \(loader !== 'forge' && loader !== 'neoforge'\) return versionId/)
  assert.match(loaders, /install_profile\.json/)
})

test('only the client half of the recipe runs, and only once', () => {
  const source = readFileSync('src/main/minecraft/loaders/forgeProcessors.ts', 'utf8')

  // A server-only step must not run for a client install.
  assert.match(source, /!processor\.sides \|\| processor\.sides\.includes\('client'\)/)
  // Already-built outputs mean the chain is skipped: it costs minutes.
  assert.match(source, /if \(outputs\.length > 0 && done\.every\(Boolean\)\) return/)
  // A tool that exits 0 without writing anything must fail here, not later as
  // the loader's own crash.
  assert.match(source, /şu dosyalar üretilemedi/)
  // Fabric, Quilt and OptiFine have no such file and must pass straight through.
  assert.match(source, /if \(!profile\?\.processors\?\.length\) return/)
})

/**
 * An option with an empty value is not the same as an absent one. `--xuid ""`
 * makes the client announce an Xbox identity of "", which servers refuse at the
 * join handshake — reported as "it stays on joining world, then disconnects",
 * with a launcher that said the launch succeeded.
 */
test('an argument with no value is left out rather than passed empty', () => {
  const launcher = readFileSync('src/main/minecraft/launcher.ts', 'utf8')
  assert.match(launcher, /dropEmptyOptions\(gameArgs, \['--xuid', '--clientId', '--userProperties'\]\)/)

  const args = ['--username', 'a', '--xuid', '', '--userType', 'msa', '--clientId', '']
  assert.deepEqual(dropEmptyOptions(args, ['--xuid', '--clientId']), ['--xuid', '--clientId'])
  assert.deepEqual(args, ['--username', 'a', '--userType', 'msa'])

  // A real value is never touched, and neither is an unlisted option.
  const kept = ['--xuid', '2535428', '--server', '']
  assert.deepEqual(dropEmptyOptions(kept, ['--xuid']), [])
  assert.deepEqual(kept, ['--xuid', '2535428', '--server', ''])
})
