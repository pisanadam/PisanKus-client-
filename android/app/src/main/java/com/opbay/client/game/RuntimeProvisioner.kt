package com.opbay.client.game

import android.content.Context
import com.opbay.client.data.Paths
import com.opbay.client.net.DownloadItem
import com.opbay.client.net.Downloader
import com.opbay.client.net.HttpException
import com.opbay.client.net.fetchJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.File

/**
 * Installs a Java runtime for the version a profile needs, without the player
 * having to find one themselves.
 *
 * Android ships no JVM, and no vendor publishes Android JRE builds through a
 * versioned API the way Adoptium does for desktops. What exists are community
 * builds attached to GitHub releases, whose file names change between
 * publishers and over time.
 *
 * So nothing here hardcodes a download URL. The provisioner reads the release
 * listing and *matches* an asset against the Java version and CPU architecture
 * it needs. A repository that stops publishing a matching build produces a
 * message naming what was looked for, instead of a 404 on a guessed path.
 */
object RuntimeProvisioner {

    class ProvisioningException(message: String) : Exception(message)

    @Serializable
    internal data class Release(
        @SerialName("tag_name") val tagName: String = "",
        val prerelease: Boolean = false,
        val assets: List<Asset> = emptyList()
    ) {
        @Serializable
        data class Asset(
            val name: String = "",
            @SerialName("browser_download_url") val url: String = "",
            val size: Long = 0
        )
    }

    /** Archive extensions the importer can unpack. */
    private val SUPPORTED = listOf(".tar.xz", ".txz", ".tar.gz", ".tgz", ".zip")

    /**
     * Tokens that identify this device's CPU, most specific first. `arm64-v8a`
     * maps to the aarch64/arm64 names these archives use.
     */
    private fun archTokens(): List<String> = when {
        android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" } -> listOf("aarch64", "arm64")
        android.os.Build.SUPPORTED_ABIS.any { it == "x86_64" } -> listOf("x86_64", "x64", "amd64")
        android.os.Build.SUPPORTED_ABIS.any { it.startsWith("armeabi") } -> listOf("arm32", "armhf", "arm")
        else -> listOf("x86", "i386")
    }

    /**
     * Picks the asset for [major] on this device. Returns null when the release
     * carries nothing suitable, so the caller can report what was missing.
     */
    internal fun matchAsset(
        assets: List<Release.Asset>,
        major: Int,
        archTokens: List<String>
    ): Release.Asset? {
        val usable = assets.filter { asset ->
            val name = asset.name.lowercase()
            SUPPORTED.any { name.endsWith(it) } &&
                // `jre17-...`, `jdk-17-...`, `java17...` all appear in the wild;
                // requiring the digits next to a java word avoids matching the
                // "17" inside an unrelated build number.
                Regex("(jre|jdk|java)[-_]?$major(?![0-9])").containsMatchIn(name)
        }

        // Prefer the most specific architecture name the device reports.
        for (token in archTokens) {
            usable.firstOrNull { Regex("(^|[-_.])$token([-_.]|$)").containsMatchIn(it.name.lowercase()) }
                ?.let { return it }
        }
        // A single-architecture release may not name the architecture at all.
        return usable.singleOrNull()
    }

    /**
     * Ensures a runtime for [major] exists and returns it, downloading one when
     * it does not. Already-installed runtimes are returned untouched.
     */
    suspend fun provision(
        context: Context,
        paths: Paths,
        source: String,
        major: Int,
        onProgress: (label: String, progress: Float?, detail: String?) -> Unit
    ): InstalledRuntime = withContext(Dispatchers.IO) {
        JavaRuntime.list(paths).firstOrNull { it.majorVersion == major }?.let { return@withContext it }

        onProgress("Java $major aranıyor", null, source)

        val releases: List<Release> = try {
            fetchJson("https://api.github.com/repos/$source/releases?per_page=30")
        } catch (error: HttpException) {
            throw ProvisioningException(
                if (error.code == 404) {
                    "Çalışma zamanı kaynağı bulunamadı: $source. Ayarlar → Java bölümünden kaynağı düzeltin."
                } else {
                    "Çalışma zamanı listesi alınamadı (${error.code}). İnternet bağlantınızı kontrol edin " +
                        "ya da bir JRE arşivini elle içe aktarın."
                }
            )
        }

        val tokens = archTokens()
        val match = releases
            .sortedBy { it.prerelease }
            .firstNotNullOfOrNull { release ->
                matchAsset(release.assets, major, tokens)?.let { release to it }
            }
            ?: throw ProvisioningException(
                "Java $major için ${tokens.first()} mimarisine uygun bir yapı bulunamadı ($source). " +
                    "Ayarlar → Java bölümünden başka bir kaynak seçebilir ya da bir arşivi elle " +
                    "içe aktarabilirsiniz."
            )

        val (release, asset) = match
        val archive = File(paths.cache, asset.name)

        onProgress("Java $major indiriliyor", 0f, "${asset.name} · ${asset.size / 1_000_000} MB")
        try {
            Downloader.download(DownloadItem(asset.url, archive, size = asset.size.takeIf { it > 0 }))
        } catch (error: Exception) {
            throw ProvisioningException("Java $major indirilemedi: ${error.message}")
        }

        try {
            onProgress("Java $major kuruluyor", null, release.tagName)
            JavaRuntime.importArchive(paths, archive, "java$major-${tokens.first()}") { detail ->
                onProgress("Java $major kuruluyor", null, detail)
            }
        } finally {
            archive.delete()
        }
    }
}
