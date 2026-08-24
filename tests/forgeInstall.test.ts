import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dropEmptyOptions } from '../src/main/minecraft/launchArgs.ts'
import { mavenPath } from '../src/main/minecraft/libraries.ts'

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

/**
 * A maven coordinate can name its file extension after an `@`, and Forge's
 * installer relies on it: `de.oceanlabs.mcp:mcp_config:1.20.1-…@zip` and
 * `net.minecraft:client:1.20.1-…:mappings@txt`. Treating the suffix as part of
 * the version built a path into a directory named `…@zip` holding a `.jar`
 * nothing had written, and the very first tool in the chain stopped with
 * "Input does not exist".
 */
test('a maven coordinate may name its own extension', () => {
  assert.equal(
    mavenPath('de.oceanlabs.mcp:mcp_config:1.20.1-20230612.114412@zip').replace(/\\/g, '/'),
    'de/oceanlabs/mcp/mcp_config/1.20.1-20230612.114412/mcp_config-1.20.1-20230612.114412.zip'
  )
  assert.equal(
    mavenPath('net.minecraft:client:1.20.1-20230612.114412:mappings@txt').replace(/\\/g, '/'),
    'net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-mappings.txt'
  )

  // Everything without an `@` keeps the jar it always had.
  assert.equal(
    mavenPath('net.minecraftforge:forge:1.20.1-47.4.10:client').replace(/\\/g, '/'),
    'net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-client.jar'
  )
  assert.equal(
    mavenPath('org.ow2.asm:asm:9.8').replace(/\\/g, '/'),
    'org/ow2/asm/asm/9.8/asm-9.8.jar'
  )
})

/**
 * Forge from 1.17 on launches from the jars its installer builds, not Mojang's.
 * Adding the untouched client jar alongside them put `net.minecraft.server` on
 * the module path twice, and Java refused to build the layer — with a message
 * that named neither Minecraft nor the loader:
 *
 *   java.lang.module.ResolutionException: Modules _1._20._1 and minecraft
 *   export package net.minecraft.server to module …kotlinforforge.kfflib
 *
 * (`_1._20._1` is what Java calls a jar named `1.20.1.jar`.)
 */
test('the vanilla client jar stays off a patched loader’s classpath', () => {
  const launcher = readFileSync('src/main/minecraft/launcher.ts', 'utf8')
  assert.match(
    launcher,
    /const classpath = patchedByLoader \? libraries\.classpath : \[\.\.\.libraries\.classpath, clientJar\]/
  )
  // Decided by whether the installer shipped a recipe, so old Forge — which does
  // run out of Mojang's jar — still gets it.
  assert.match(launcher, /profile\.loader === 'forge' \|\| profile\.loader === 'neoforge'/)

  const processors = readFileSync('src/main/minecraft/loaders/forgeProcessors.ts', 'utf8')
  assert.match(processors, /export async function loaderPatchesClient/)
  assert.match(processors, /return \(profile\?\.processors\?\.length \?\? 0\) > 0/)
})

/**
 * A curated list is written as names, and a name does not say which folder the
 * file belongs in. Installing everything as a mod put this pack's four texture
 * packs into `mods/`.
 */
test('a pack entry is installed as whatever Modrinth says it is', () => {
  const curated = readFileSync('src/main/content/curated.ts', 'utf8')
  assert.match(curated, /kind: entry\.kind,/)
  assert.doesNotMatch(curated, /kind: 'mod',/)
  // A resource pack lists `minecraft` as its loader, so the pack's mod loader
  // must not be used to narrow it.
  assert.match(curated, /if \(!loaderApplies\(kind\)\) \{/)

  const modrinth = readFileSync('src/main/content/modrinth.ts', 'utf8')
  assert.match(modrinth, /kind: kindOfProjectType\(project\.project_type\)/)
})

test('the pack does not ship an addon whose base mod it cannot install', () => {
  const pack = readFileSync('src/shared/curatedPack.ts', 'utf8')
  // Requires Twilight Forest, which is not on Modrinth at all — Forge stopped
  // at startup with "Mod ID: 'twilightforest' … [MISSING]".
  assert.doesNotMatch(pack, /slug: 'the-twilight-forest-dungeons-villages'/)
  // "embeddiumplus" does not exist; the nearest real project is a modpack.
  assert.doesNotMatch(pack, /slug: 'embeddiumplus'/)
})
