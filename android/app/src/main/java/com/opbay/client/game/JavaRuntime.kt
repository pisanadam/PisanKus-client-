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
     * Picks a runtime for a version's Java requirement, preferring an exact
     * match and otherwise the newest runtime that is at least as new.
     */
    fun select(paths: Paths, preferred: String?, requiredMajor: Int): InstalledRuntime? {
        val installed = list(paths)
        byName(paths, preferred)?.let { return it }
        return installed.firstOrNull { it.majorVersion == requiredMajor }
            ?: installed.firstOrNull { it.majorVersion >= requiredMajor }
            ?: installed.firstOrNull()
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

    /**
     * Unpacks a runtime archive the player picked. `.tar.xz`, `.tar.gz` and
     * `.zip` are accepted because the community runtimes ship in all three.
     */
    suspend fun import(
        context: Context,
        paths: Paths,
        uri: Uri,
        displayName: String,
        onProgress: (String) -> Unit
    ): InstalledRuntime = withContext(Dispatchers.IO) {
        val name = displayName
            .substringBeforeLast(".tar")
            .substringBeforeLast('.')
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .ifEmpty { "runtime-${System.currentTimeMillis()}" }

        val target = File(paths.runtimes, name)
        target.deleteRecursively()
        target.mkdirs()

        onProgress("$name açılıyor…")

        context.contentResolver.openInputStream(uri)?.use { raw ->
            val buffered = BufferedInputStream(raw)
            when {
                displayName.endsWith(".zip", true) -> extractZip(buffered, target)
                displayName.endsWith(".tar.xz", true) || displayName.endsWith(".txz", true) ->
                    extractTar(XZCompressorInputStream(buffered), target)
                displayName.endsWith(".tar.gz", true) || displayName.endsWith(".tgz", true) ->
                    extractTar(GzipCompressorInputStream(buffered), target)
                else -> throw IllegalArgumentException(
                    "Desteklenmeyen arşiv biçimi: $displayName (.tar.xz, .tar.gz veya .zip bekleniyor)."
                )
            }
        } ?: throw IllegalStateException("Dosya okunamadı.")

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

        InstalledRuntime(name, home, binary, readMajorVersion(home))
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
