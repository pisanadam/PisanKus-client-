package com.opbay.client.minecraft

import com.opbay.client.data.LoaderId
import com.opbay.client.data.Paths
import com.opbay.client.net.DownloadItem
import com.opbay.client.net.Downloader
import com.opbay.client.net.fetchJson
import com.opbay.client.net.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.util.zip.ZipFile

data class LoaderVersion(val version: String, val stable: Boolean)

/**
 * Installs a mod loader by writing its version json into `versions/`, so the
 * ordinary resolve → download → launch path treats it like any other version.
 */
object Loaders {

    private const val FABRIC_META = "https://meta.fabricmc.net/v2"
    private const val QUILT_META = "https://meta.quiltmc.org/v3"
    private const val NEOFORGE_LIST =
        "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"
    private const val NEOFORGE_MAVEN = "https://maven.neoforged.net/releases/net/neoforged/neoforge"
    private const val FORGE_PROMOS =
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
    private const val FORGE_MAVEN = "https://maven.minecraftforge.net/net/minecraftforge/forge"

    @Serializable
    private data class FabricLoaderEntry(val loader: Loader) {
        @Serializable data class Loader(val version: String, val stable: Boolean = false)
    }

    @Serializable
    private data class MavenVersions(val versions: List<String> = emptyList())

    @Serializable
    private data class ForgePromos(val promos: Map<String, String> = emptyMap())

    suspend fun listVersions(loader: LoaderId, gameVersion: String): List<LoaderVersion> = when (loader) {
        LoaderId.VANILLA -> emptyList()

        LoaderId.FABRIC, LoaderId.QUILT -> {
            val meta = if (loader == LoaderId.FABRIC) FABRIC_META else QUILT_META
            fetchJson<List<FabricLoaderEntry>>("$meta/versions/loader/$gameVersion")
                .map { LoaderVersion(it.loader.version, it.loader.stable) }
        }

        LoaderId.NEOFORGE -> {
            // NeoForge versions are <minor>.<patch>.<build> derived from 1.<minor>.<patch>.
            val parts = gameVersion.split(".")
            val prefix = "${parts.getOrNull(1) ?: return emptyList()}.${parts.getOrNull(2) ?: "0"}."
            fetchJson<MavenVersions>(NEOFORGE_LIST).versions
                .filter { it.startsWith(prefix) }
                .reversed()
                .map { LoaderVersion(it, !it.contains("beta")) }
        }

        LoaderId.FORGE -> {
            val promos = fetchJson<ForgePromos>(FORGE_PROMOS).promos
            buildList {
                promos["$gameVersion-recommended"]?.let { add(LoaderVersion("$gameVersion-$it", true)) }
                promos["$gameVersion-latest"]?.let { latest ->
                    if (latest != promos["$gameVersion-recommended"]) {
                        add(LoaderVersion("$gameVersion-$latest", false))
                    }
                }
            }
        }
    }

    /** The version id a profile launches, e.g. `fabric-loader-0.16.9-1.21.4`. */
    fun versionId(loader: LoaderId, gameVersion: String, loaderVersion: String): String = when (loader) {
        LoaderId.VANILLA -> gameVersion
        LoaderId.FABRIC -> "fabric-loader-$loaderVersion-$gameVersion"
        LoaderId.QUILT -> "quilt-loader-$loaderVersion-$gameVersion"
        LoaderId.NEOFORGE -> "neoforge-$loaderVersion"
        LoaderId.FORGE -> "$loaderVersion-forge"
    }

    /**
     * Ensures the loader's version json exists on disk and returns the version
     * id to launch. Vanilla profiles pass straight through.
     */
    suspend fun install(
        paths: Paths,
        loader: LoaderId,
        gameVersion: String,
        requestedVersion: String?,
        onProgress: (String) -> Unit = {}
    ): String {
        if (loader == LoaderId.VANILLA) return gameVersion

        val resolved = requestedVersion ?: listVersions(loader, gameVersion)
            .let { available -> available.firstOrNull { it.stable } ?: available.firstOrNull() }
            ?.version
            ?: throw IllegalStateException(
                "${loader.label} için $gameVersion sürümünde yükleyici bulunamadı."
            )

        val id = versionId(loader, gameVersion, resolved)
        val file = paths.versionJson(id)
        if (file.isFile) return id

        onProgress("${loader.label} $resolved kuruluyor…")

        val text = when (loader) {
            LoaderId.FABRIC, LoaderId.QUILT -> {
                val meta = if (loader == LoaderId.FABRIC) FABRIC_META else QUILT_META
                fetchJson<JsonObject>("$meta/versions/loader/$gameVersion/$resolved/profile/json").toString()
            }

            LoaderId.NEOFORGE -> extractInstallerJson(
                paths,
                "$NEOFORGE_MAVEN/$resolved/neoforge-$resolved-installer.jar",
                id
            )

            LoaderId.FORGE -> extractInstallerJson(
                paths,
                "$FORGE_MAVEN/$resolved/forge-$resolved-installer.jar",
                id
            )

            LoaderId.VANILLA -> error("unreachable")
        }

        // Force the id and parent so the resolver can always find its way back
        // to the vanilla version.
        val patched = json.parseToJsonElement(text).let { element ->
            buildJsonObject {
                element.let { it as JsonObject }.forEach { (key, value) ->
                    if (key != "id" && key != "inheritsFrom") put(key, value)
                }
                put("id", id)
                put("inheritsFrom", gameVersion)
            }
        }

        withContext(Dispatchers.IO) {
            file.parentFile?.mkdirs()
            file.writeText(patched.toString())
        }
        return id
    }

    /**
     * Forge and NeoForge ship their version json inside the installer jar. Only
     * `version.json` is needed; the bundled maven tree is copied out too so the
     * downloader does not have to re-fetch artifacts that are not on a public
     * repository.
     */
    private suspend fun extractInstallerJson(paths: Paths, url: String, versionId: String): String =
        withContext(Dispatchers.IO) {
            val installer = File(paths.cache, "$versionId-installer.jar")
            Downloader.download(DownloadItem(url, installer))

            try {
                ZipFile(installer).use { zip ->
                    val entry = zip.getEntry("version.json")
                        ?: throw IllegalStateException(
                            "Yükleyici paketinde version.json yok ($versionId). " +
                                "Bu sürüm için otomatik kurulum desteklenmiyor olabilir."
                        )

                    // Copy `maven/` out of the installer into the shared library tree.
                    zip.entries().asSequence()
                        .filter { !it.isDirectory && it.name.startsWith("maven/") }
                        .forEach { bundled ->
                            val target = File(paths.libraries, bundled.name.removePrefix("maven/"))
                            if (!target.isFile) {
                                target.parentFile?.mkdirs()
                                zip.getInputStream(bundled).use { input ->
                                    target.outputStream().use { output -> input.copyTo(output) }
                                }
                            }
                        }

                    zip.getInputStream(entry).bufferedReader().readText()
                }
            } finally {
                installer.delete()
            }
        }
}
