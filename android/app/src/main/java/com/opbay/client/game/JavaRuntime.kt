package com.opbay.client.game

import android.content.Context
import android.net.Uri
import com.opbay.client.data.Paths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * A Java runtime installed into the app's private storage.
 *
 * Android ships no JVM that can run Minecraft, so one has to be supplied. The
 * launcher does not build or bundle a runtime: the player imports an Android
 * JRE archive (the ones distributed for PojavLauncher work — they are built for
 * the same `android-aarch64` target), and it is unpacked here.
 */
data class InstalledRuntime(
    val name: String,
    val home: File,
    val javaBinary: File,
    val majorVersion: Int
)

object JavaRuntime {

    /** Directory names that indicate a JRE root rather than a wrapper folder. */
    private val MARKERS = listOf("bin", "lib")

    fun list(paths: Paths): List<InstalledRuntime> {
        val roots = paths.runtimes.listFiles()?.filter { it.isDirectory }.orEmpty()
        return roots.mapNotNull { candidate ->
            val home = findJavaHome(candidate) ?: return@mapNotNull null
            val binary = File(home, "bin/java")
            if (!binary.exists()) return@mapNotNull null
            InstalledRuntime(
                name = candidate.name,
                home = home,
                javaBinary = binary,
                majorVersion = readMajorVersion(home)
            )
        }.sortedByDescending { it.majorVersion }
    }

    fun byName(paths: Paths, name: String?): InstalledRuntime? =
        name?.let { wanted -> list(paths).firstOrNull { it.name == wanted } }

    /**
     * Picks the runtime for a version's Java requirement.
     *
     * The match is exact: Mojang pins a major version per game version, and
     * running on a different one fails deep inside the game with an error that
     * points nowhere near the cause. A preferred runtime is honoured only when
     * its version is the one required.
     */
    fun select(paths: Paths, preferred: String?, requiredMajor: Int): InstalledRuntime? {
        byName(paths, preferred)?.takeIf { it.majorVersion == requiredMajor }?.let { return it }
        return list(paths).firstOrNull { it.majorVersion == requiredMajor }
    }

    /** Archives may nest the JRE one level down; find the directory holding bin/. */
    private fun findJavaHome(root: File): File? {
        if (MARKERS.all { File(root, it).isDirectory }) return root
        val children = root.listFiles()?.filter { it.isDirectory }.orEmpty()
        return children.firstOrNull { child -> MARKERS.all { File(child, it).isDirectory } }
    }

    /** `release` files carry JAVA_VERSION; fall back to parsing the folder name. */
    private fun readMajorVersion(home: File): Int {
        val release = File(home, "release")
        if (release.isFile) {
            val line = release.readLines().firstOrNull { it.startsWith("JAVA_VERSION=") }
            val raw = line?.substringAfter('=')?.trim('"', ' ')
            val major = raw?.let { value ->
                val parts = value.split(".")
                if (parts.firstOrNull() == "1") parts.getOrNull(1)?.toIntOrNull() else parts.firstOrNull()?.toIntOrNull()
            }
            if (major != null) return major
        }
        return Regex("(\\d+)").findAll(home.name).lastOrNull()?.value?.toIntOrNull() ?: 0
    }

    /** Unpacks a runtime archive the player picked from storage. */
    suspend fun import(
        context: Context,
        paths: Paths,
        uri: Uri,
        displayName: String,
        onProgress: (String) -> Unit
    ): InstalledRuntime = withContext(Dispatchers.IO) {
        val stream = context.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Dosya okunamadı.")
        stream.use { unpack(paths, it, displayName, runtimeName(displayName), onProgress) }
    }

    /** Unpacks an archive already on disk, such as a downloaded runtime. */
    suspend fun importArchive(
        paths: Paths,
        archive: File,
        name: String,
        onProgress: (String) -> Unit
    ): InstalledRuntime = withContext(Dispatchers.IO) {
        archive.inputStream().use { unpack(paths, it, archive.name, name, onProgress) }
    }

    private fun runtimeName(displayName: String): String = displayName
        .substringBeforeLast(".tar")
        .substringBeforeLast('.')
        .replace(Regex("[^A-Za-z0-9._-]"), "_")
        .ifEmpty { "runtime-${System.currentTimeMillis()}" }

    /**
     * `.tar.xz`, `.tar.gz` and `.zip` are all accepted because the community
     * runtimes ship in all three.
     */
    private fun unpack(
        paths: Paths,
        input: InputStream,
        archiveName: String,
        name: String,
        onProgress: (String) -> Unit
    ): InstalledRuntime {
        val target = File(paths.runtimes, name)
        target.deleteRecursively()
        target.mkdirs()

        onProgress("$name açılıyor…")

        val buffered = BufferedInputStream(input)
        when {
            archiveName.endsWith(".zip", true) -> extractZip(buffered, target)
            archiveName.endsWith(".tar.xz", true) || archiveName.endsWith(".txz", true) ->
                extractTar(XZCompressorInputStream(buffered), target)
            archiveName.endsWith(".tar.gz", true) || archiveName.endsWith(".tgz", true) ->
                extractTar(GzipCompressorInputStream(buffered), target)
            else -> {
                target.deleteRecursively()
                throw IllegalArgumentException(
                    "Desteklenmeyen arşiv biçimi: $archiveName (.tar.xz, .tar.gz veya .zip bekleniyor)."
                )
            }
        }

        val home = findJavaHome(target)
            ?: run {
                target.deleteRecursively()
                throw IllegalStateException(
                    "Arşiv bir Java çalışma zamanı içermiyor (bin/ ve lib/ klasörleri bulunamadı)."
                )
            }

        // Everything under bin/ and lib/jspawnhelper must be executable.
        File(home, "bin").listFiles()?.forEach { it.setExecutable(true, false) }
        File(home, "lib").walkTopDown().filter { it.name == "jspawnhelper" }.forEach {
            it.setExecutable(true, false)
        }

        val binary = File(home, "bin/java")
        if (!binary.exists()) {
            target.deleteRecursively()
            throw IllegalStateException("Arşivde bin/java bulunamadı.")
        }

        return InstalledRuntime(name, home, binary, readMajorVersion(home))
    }

    fun remove(paths: Paths, name: String) {
        File(paths.runtimes, name).deleteRecursively()
    }

    private fun extractZip(input: InputStream, target: File) {
        ZipInputStream(input).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val file = safeChild(target, entry.name) ?: continue
                if (entry.isDirectory) {
                    file.mkdirs()
                } else {
                    file.parentFile?.mkdirs()
                    file.outputStream().use { zip.copyTo(it) }
                }
            }
        }
    }

    private fun extractTar(input: InputStream, target: File) {
        TarArchiveInputStream(input).use { tar ->
            while (true) {
                val entry = tar.nextEntry ?: break
                val file = safeChild(target, entry.name) ?: continue
                when {
                    entry.isDirectory -> file.mkdirs()
                    entry.isSymbolicLink -> {
                        // Runtimes symlink e.g. lib/server/libjvm.so; copy the target
                        // instead, since app storage may not permit symlinks.
                        file.parentFile?.mkdirs()
                        val linked = File(file.parentFile, entry.linkName)
                        if (linked.isFile) runCatching { linked.copyTo(file, overwrite = true) }
                    }
                    else -> {
                        file.parentFile?.mkdirs()
                        file.outputStream().use { tar.copyTo(it) }
                        if (entry.mode and 0b001_000_000 != 0) file.setExecutable(true, false)
                    }
                }
            }
        }
    }

    /** Rejects archive entries that would escape the target directory (zip slip). */
    private fun safeChild(target: File, name: String): File? {
        val file = File(target, name)
        val targetPath = target.canonicalPath + File.separator
        return if (file.canonicalPath.startsWith(targetPath)) file else null
    }
}
