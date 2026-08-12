package com.opbay.client.game

import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * Unpacking shared by the Java runtime and the renderer installers. Both take
 * whatever archive format their publisher happened to use.
 */
object Archives {

    fun extract(archive: File, target: File) =
        archive.inputStream().use { extract(it, archive.name, target) }

    fun extract(input: InputStream, archiveName: String, target: File) {
        val buffered = BufferedInputStream(input)
        when {
            archiveName.endsWith(".zip", true) -> extractZip(buffered, target)
            archiveName.endsWith(".tar.xz", true) || archiveName.endsWith(".txz", true) ->
                extractTar(XZCompressorInputStream(buffered), target)
            archiveName.endsWith(".tar.gz", true) || archiveName.endsWith(".tgz", true) ->
                extractTar(GzipCompressorInputStream(buffered), target)
            else -> throw IllegalArgumentException(
                "Desteklenmeyen arşiv biçimi: $archiveName (.tar.xz, .tar.gz veya .zip bekleniyor)."
            )
        }
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
    internal fun safeChild(target: File, name: String): File? {
        val file = File(target, name)
        val targetPath = target.canonicalPath + File.separator
        return if (file.canonicalPath.startsWith(targetPath)) file else null
    }
}
