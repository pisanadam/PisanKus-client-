package com.opbay.client.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger

data class DownloadItem(
    val url: String,
    val destination: File,
    val sha1: String? = null,
    val size: Long? = null
)

object Downloader {

    fun sha1Of(file: File): String {
        val digest = MessageDigest.getInstance("SHA-1")
        file.inputStream().use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /** True when the file on disk already matches the expected hash and size. */
    private fun upToDate(item: DownloadItem): Boolean {
        val file = item.destination
        if (!file.isFile) return false
        if (item.size != null && file.length() != item.size) return false
        if (item.sha1 != null) return runCatching { sha1Of(file) == item.sha1 }.getOrDefault(false)
        return file.length() > 0
    }

    /** Downloads one file, verifying the hash and retrying transient failures. */
    suspend fun download(item: DownloadItem) = withContext(Dispatchers.IO) {
        if (upToDate(item)) return@withContext

        item.destination.parentFile?.mkdirs()
        val temp = File(item.destination.parentFile, "${item.destination.name}.part")

        var lastError: Exception? = null
        repeat(3) { attempt ->
            try {
                http.await(requestBuilder(item.url).header("Accept", "*/*").build()).use { response ->
                    if (!response.isSuccessful) {
                        throw HttpException(response.code, "", item.url)
                    }
                    val body = response.body ?: throw IOException("Boş yanıt: ${item.url}")
                    temp.outputStream().use { output -> body.byteStream().copyTo(output, 128 * 1024) }
                }

                if (item.sha1 != null && sha1Of(temp) != item.sha1) {
                    throw IOException("Sağlama toplamı uyuşmuyor: ${item.destination.name}")
                }

                item.destination.delete()
                if (!temp.renameTo(item.destination)) {
                    // renameTo fails across mounts; fall back to a copy.
                    temp.copyTo(item.destination, overwrite = true)
                    temp.delete()
                }
                return@withContext
            } catch (error: Exception) {
                lastError = error
                temp.delete()
                if (attempt < 2) delay(400L shl attempt)
            }
        }
        throw lastError ?: IOException("İndirme başarısız: ${item.url}")
    }

    /**
     * Downloads everything with a bounded number of concurrent requests,
     * reporting completed/total as it goes.
     */
    suspend fun downloadAll(
        items: List<DownloadItem>,
        concurrency: Int = 6,
        onProgress: (completed: Int, total: Int, current: String) -> Unit = { _, _, _ -> }
    ) = coroutineScope {
        if (items.isEmpty()) return@coroutineScope

        val gate = Semaphore(concurrency.coerceAtLeast(1))
        val completed = AtomicInteger(0)
        val failures = mutableListOf<Exception>()

        items.map { item ->
            async {
                gate.withPermit {
                    try {
                        download(item)
                    } catch (error: Exception) {
                        synchronized(failures) { failures += error }
                    }
                    onProgress(completed.incrementAndGet(), items.size, item.destination.name)
                }
            }
        }.awaitAll()

        if (failures.isNotEmpty()) {
            throw IOException("${failures.size} dosya indirilemedi. İlk hata: ${failures.first().message}")
        }
    }
}
