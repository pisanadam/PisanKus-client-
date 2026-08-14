import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as tar from 'tar'
import { downloadFile, fetchJson } from './downloader'
import { currentOs } from './libraries'
import { extractZip } from '../archive'

const ADOPTIUM = 'https://api.adoptium.net/v3'

export interface JavaInfo {
  path: string
  majorVersion: number
  vendor: string
}

const executable = process.platform === 'win32' ? 'javaw.exe' : 'java'

/**
 * Reads `java -version` from stderr, where every JVM prints it. Candidate paths
 * are guesses, so a failure to even start the process is an expected outcome and
 * resolves to null — including the synchronous throw `spawn` produces when a
 * path component is not a directory.
 */
export function probeJava(javaPath: string): Promise<JavaInfo | null> {
  return new Promise((resolve) => {
    // `javaw` is windowless and prints nothing, so probe with `java` instead.
    const probePath = javaPath.replace(/javaw\.exe$/i, 'java.exe')

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(probePath, ['-version'], { windowsHide: true })
    } catch {
      resolve(null)
      return
    }

    let output = ''
    // A hung candidate must not stall the whole scan.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 5000)

    child.stderr?.on('data', (chunk) => (output += String(chunk)))
    child.stdout?.on('data', (chunk) => (output += String(chunk)))
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const match = output.match(/version "(\d+)(?:\.(\d+))?[^"]*"/)
      if (!match) return resolve(null)
      // 1.8.0_xxx reports as 1.8; anything newer leads with the major version.
      const major = match[1] === '1' ? Number(match[2]) : Number(match[1])
      const vendor = output.split('\n')[1]?.trim() ?? 'unknown'
      resolve({ path: javaPath, majorVersion: major, vendor })
    })
  })
}

function candidateRoots(): string[] {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  switch (currentOs()) {
    case 'windows':
      return [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft\\jdk',
        'C:\\Program Files (x86)\\Java',
        path.join(home, '.jdks')
      ]
    case 'osx':
      return ['/Library/Java/JavaVirtualMachines', path.join(home, 'Library/Java/JavaVirtualMachines')]
    default:
      return ['/usr/lib/jvm', '/usr/java', '/opt/java', path.join(home, '.jdks'), path.join(home, '.sdkman/candidates/java')]
  }
}

function binPath(javaHome: string): string {
  return currentOs() === 'osx'
    ? path.join(javaHome, 'Contents', 'Home', 'bin', executable)
    : path.join(javaHome, 'bin', executable)
}

/** Every JVM this machine offers, including managed runtimes downloaded by the launcher. */
export async function discoverJava(dataDir: string): Promise<JavaInfo[]> {
  const candidates = new Set<string>()

  if (process.env.JAVA_HOME) candidates.add(binPath(process.env.JAVA_HOME))
  candidates.add(executable) // whatever is on PATH

  const roots = [...candidateRoots(), path.join(dataDir, 'runtimes')]
  for (const root of roots) {
    let entries: string[]
    try {
      entries = await fsp.readdir(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const home = path.join(root, entry)
      candidates.add(binPath(home))
      // Adoptium archives unpack into a single nested directory.
      try {
        for (const nested of await fsp.readdir(home)) {
          if (nested.startsWith('jdk') || nested.startsWith('jre')) {
            candidates.add(binPath(path.join(home, nested)))
          }
        }
      } catch {
        // Not a directory — the direct candidate above still applies.
      }
    }
  }

  const probed = await Promise.all([...candidates].map(probeJava))
  const found = new Map<string, JavaInfo>()
  for (const info of probed) {
    if (info) found.set(`${info.majorVersion}:${info.path}`, info)
  }
  return [...found.values()].sort((a, b) => b.majorVersion - a.majorVersion)
}

/**
 * Picks an installed JVM matching the version's requirement, downloading a
 * Temurin runtime when nothing suitable is present.
 */
export async function ensureJava(
  dataDir: string,
  majorVersion: number,
  onProgress?: (detail: string) => void
): Promise<string> {
  const installed = await discoverJava(dataDir)
  const match = installed.find((info) => info.majorVersion === majorVersion)
  if (match) return match.path

  onProgress?.(`Java ${majorVersion} indiriliyor…`)
  const targetDir = path.join(dataDir, 'runtimes', `temurin-${majorVersion}`)

  const osName = currentOs() === 'osx' ? 'mac' : currentOs()
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'ia32' ? 'x86' : 'x64'
  const url =
    `${ADOPTIUM}/assets/latest/${majorVersion}/hotspot?` +
    new URLSearchParams({ os: osName, architecture: arch, image_type: 'jre', vendor: 'eclipse' })

  const assets = await fetchJson<
    { binary: { package: { name: string; link: string; checksum: string; size: number } } }[]
  >(url)
  if (assets.length === 0) throw new Error(`Java ${majorVersion} bu platform için bulunamadı.`)

  const pkg = assets[0].binary.package
  const archive = path.join(dataDir, 'runtimes', pkg.name)
  // Adoptium's `checksum` is SHA-256, not SHA-1 — passing it as sha1 made every
  // Java download fail verification and left the game unable to start.
  await downloadFile({ url: pkg.link, destination: archive, sha256: pkg.checksum, size: pkg.size })

  onProgress?.(`Java ${majorVersion} açılıyor…`)
  await fsp.mkdir(targetDir, { recursive: true })
  if (pkg.name.endsWith('.zip')) {
    await extractZip(archive, { dir: targetDir })
  } else {
    await tar.x({ file: archive, cwd: targetDir })
  }
  await fsp.rm(archive, { force: true })

  const rediscovered = await discoverJava(dataDir)
  const downloaded = rediscovered.find((info) => info.majorVersion === majorVersion)
  if (!downloaded) throw new Error(`Java ${majorVersion} kuruldu fakat çalıştırılabilir bulunamadı.`)
  return downloaded.path
}
