package com.opbay.client.game

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
 * How a version's rendering reaches the screen on Android.
 *
 * Minecraft 26.2 added Vulkan (`org.lwjgl:lwjgl-vulkan`), and Android has had a
 * system Vulkan loader since 7.0 — so those versions need no API translation at
 * all. Older versions call desktop OpenGL, which Android does not implement, and
 * need a translator such as gl4es.
 */
enum class RendererKind {
    /** Uses the device's own Vulkan driver; nothing to translate. */
    VULKAN,

    /** Desktop OpenGL translated to OpenGL ES. */
    GL_TRANSLATED;

    val label: String
        get() = when (this) {
            VULKAN -> "Vulkan (yerel)"
            GL_TRANSLATED -> "OpenGL çevirisi"
        }
}

data class InstalledRenderer(val name: String, val directory: File, val libraries: List<File>)

object RendererProvisioner {

    class ProvisioningException(message: String) : Exception(message)

    /**
     * Which path a version takes. `lwjgl-vulkan` in the library list is the
     * signal — it is exactly what Mojang added when the Vulkan backend shipped.
     */
    fun kindFor(libraryNames: List<String>): RendererKind =
        if (libraryNames.any { it.startsWith("org.lwjgl:lwjgl-vulkan") }) RendererKind.VULKAN
        else RendererKind.GL_TRANSLATED

    /** True when the device exposes a Vulkan loader for the native path. */
    fun deviceHasVulkan(): Boolean = File("/system/lib64/libvulkan.so").exists() ||
        File("/system/lib/libvulkan.so").exists() ||
        File("/vendor/lib64/libvulkan.so").exists()

    fun list(paths: Paths): List<InstalledRenderer> =
        paths.renderers.listFiles()?.filter { it.isDirectory }.orEmpty().mapNotNull { directory ->
            val libraries = directory.walkTopDown().filter { it.isFile && it.name.endsWith(".so") }.toList()
            if (libraries.isEmpty()) null else InstalledRenderer(directory.name, directory, libraries)
        }

    fun byName(paths: Paths, name: String?): InstalledRenderer? =
        name?.let { wanted -> list(paths).firstOrNull { it.name == wanted } }

    fun remove(paths: Paths, name: String) {
        File(paths.renderers, name).deleteRecursively()
    }

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

    /**
     * Picks the renderer build for this device. Unlike the Java runtime there is
     * no version to match — only the architecture — so a release carrying one
     * archive per ABI resolves by ABI alone.
     */
    internal fun matchAsset(
        assets: List<Release.Asset>,
        archTokens: List<String>
    ): Release.Asset? {
        val usable = assets.filter { asset ->
            val name = asset.name.lowercase()
            DeviceAbi.ARCHIVES.any { name.endsWith(it) } &&
                // Debug symbol bundles are large and useless here.
                !name.contains("symbols") && !name.contains("debug")
        }
        DeviceAbi.pickForDevice(usable, archTokens) { it.name }?.let { return it }
        return usable.singleOrNull()
    }

    /** Downloads and unpacks a renderer for this device. */
    suspend fun provision(
        paths: Paths,
        source: String,
        onProgress: (label: String, progress: Float?, detail: String?) -> Unit
    ): InstalledRenderer = withContext(Dispatchers.IO) {
        onProgress("Grafik bileşeni aranıyor", null, source)

        val releases: List<Release> = try {
            fetchJson("https://api.github.com/repos/$source/releases?per_page=30")
        } catch (error: HttpException) {
            throw ProvisioningException(
                if (error.code == 404) {
                    "Grafik bileşeni kaynağı bulunamadı: $source. Ayarlar → Grafik bölümünden düzeltin."
                } else {
                    "Grafik bileşeni listesi alınamadı (${error.code})."
                }
            )
        }

        val tokens = DeviceAbi.tokens
        val match = releases
            .sortedBy { it.prerelease }
            .firstNotNullOfOrNull { release -> matchAsset(release.assets, tokens)?.let { release to it } }
            ?: throw ProvisioningException(
                "${tokens.first()} mimarisi için bir grafik bileşeni bulunamadı ($source). " +
                    "Ayarlar → Grafik bölümünden başka bir kaynak seçin ya da bir arşivi elle içe aktarın."
            )

        val (release, asset) = match
        val archive = File(paths.cache, asset.name)

        onProgress("Grafik bileşeni indiriliyor", 0f, "${asset.name} · ${asset.size / 1_000_000} MB")
        Downloader.download(DownloadItem(asset.url, archive, size = asset.size.takeIf { it > 0 }))

        try {
            onProgress("Grafik bileşeni kuruluyor", null, release.tagName)
            unpack(paths, archive, "renderer-${tokens.first()}")
        } finally {
            archive.delete()
        }
    }

    /** Unpacks an archive of `.so` files into the renderer directory. */
    fun unpack(paths: Paths, archive: File, name: String): InstalledRenderer {
        val target = File(paths.renderers, name)
        target.deleteRecursively()
        target.mkdirs()

        Archives.extract(archive, target)

        val libraries = target.walkTopDown().filter { it.isFile && it.name.endsWith(".so") }.toList()
        if (libraries.isEmpty()) {
            target.deleteRecursively()
            throw ProvisioningException("Arşivde .so kütüphanesi bulunamadı: ${archive.name}")
        }
        libraries.forEach { it.setReadable(true, false) }
        return InstalledRenderer(name, target, libraries)
    }
}
