import { app, shell } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Profile } from '../shared/types'
import { profileArgument } from './cliArgs'

/**
 * A desktop shortcut that starts one profile.
 *
 * Playing the same profile every evening meant opening the launcher, finding it
 * among the others and pressing play. The shortcut collapses that to a double
 * click: it points at the installed launcher with `--profile=<id>` after it, and
 * the launcher takes it from there.
 *
 * Each platform wants a different file, and none of the three is hard:
 * Windows a `.lnk` (Electron writes those), Linux a `.desktop` entry, macOS a
 * small `.command` script — the Finder runs those on double click and there is
 * no way to make an alias carry arguments.
 */

/** A file name that is safe on all three platforms. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim()
  return cleaned.slice(0, 60) || 'PisanKus'
}

async function desktopDir(): Promise<string> {
  const desktop = app.getPath('desktop')
  await fsp.access(desktop)
  return desktop
}

/**
 * The launcher as something that can be started again.
 *
 * `process.execPath` is the packaged executable in a real install, and the
 * Electron binary in a dev run — where a shortcut to it would launch a blank
 * Electron rather than the launcher, so this is refused there instead of
 * writing something that does not work.
 */
function launcherPath(): string {
  if (!app.isPackaged) {
    throw new Error('Kısayol yalnızca kurulu sürümde oluşturulabilir.')
  }
  return process.execPath
}

export async function createProfileShortcut(profile: Profile): Promise<string> {
  const target = launcherPath()
  const desktop = await desktopDir()
  const argument = profileArgument(profile.id)
  const base = safeFileName(profile.name)

  if (process.platform === 'win32') {
    const file = path.join(desktop, `${base}.lnk`)
    const created = shell.writeShortcutLink(file, 'create', {
      target,
      args: argument,
      // Without this a shortcut started from the desktop runs with the desktop
      // as its working directory.
      cwd: path.dirname(target),
      description: `${profile.name} — PisanKus Client`,
      icon: target,
      iconIndex: 0
    })
    if (!created) throw new Error('Kısayol oluşturulamadı.')
    return file
  }

  if (process.platform === 'darwin') {
    const file = path.join(desktop, `${base}.command`)
    // `open -a` would drop the arguments; the executable inside the bundle is
    // what has to be run, and `exec` keeps no shell hanging around after it.
    const script = `#!/bin/sh\nexec ${JSON.stringify(target)} ${JSON.stringify(argument)}\n`
    await fsp.writeFile(file, script, { mode: 0o755 })
    return file
  }

  const file = path.join(desktop, `${base}.desktop`)
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${profile.name}`,
    `Comment=${profile.name} — PisanKus Client`,
    // Quoted because a launcher installed under a path with a space in it is
    // otherwise read as several arguments.
    `Exec="${target}" ${argument}`,
    'Icon=pisankus-client',
    'Terminal=false',
    'Categories=Game;'
  ].join('\n')

  await fsp.writeFile(file, `${entry}\n`, { mode: 0o755 })
  return file
}
