package com.opbay.client.minecraft

import com.opbay.client.data.Paths
import com.opbay.client.net.DownloadItem
import com.opbay.client.net.Downloader
import com.opbay.client.net.fetchJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File

private const val RESOURCES = "https://resources.download.minecraft.net"

/** Jars that go on the classpath, plus everything that must be downloaded first. */
data class ResolvedLibraries(
    val classpath: List<File>,
    val downloads: List<DownloadItem>
)

@Serializable
data class AssetIndex(
    val objects: Map<String, Entry> = emptyMap(),
    val virtual: Boolean = false,
    val map_to_resources: Boolean = false
) {
    @Serializable
    data class Entry(val hash: String, val size: Long)
}

object Installer {

    /** Converts `group:artifact:version[:classifier]` into a maven relative path. */
    fun mavenPath(name: String): String {
        val parts = name.split(":")
        val (group, artifact, version) = Triple(parts[0], parts[1], parts[2])
        val classifier = parts.getOrNull(3)
        val fileName = if (classifier != null) "$artifact-$version-$classifier.jar" else "$artifact-$version.jar"
        return group.replace('.', '/') + "/$artifact/$version/$fileName"
    }

    /**
     * Picks the libraries this device needs. Native libraries are skipped
     * entirely: Mojang publishes desktop natives only, and the Android runtime
     * supplies its own LWJGL implementation.
     */
    fun resolveLibraries(version: VersionJson, paths: Paths): ResolvedLibraries {
        val classpath = mutableListOf<File>()
        val downloads = mutableListOf<DownloadItem>()
        val seen = mutableSetOf<String>()

        for (library in version.libraries) {
            if (!Rules.allows(library.rules)) continue
            if (library.natives != null) continue

            // Loader-added libraries repeat with different versions; the first
            // entry wins because overrides are merged in first.
            val key = library.name.split(":").take(2).joinToString(":")
            if (!seen.add(key)) continue

            val artifact = library.downloads?.artifact
            if (artifact != null && artifact.url.isNotEmpty()) {
                val destination = File(paths.libraries, artifact.path ?: mavenPath(library.name))
                downloads += DownloadItem(artifact.url, destination, artifact.sha1.ifEmpty { null }, artifact.size)
                classpath += destination
            } else {
                // Loader manifests often give only a maven repository root.
                val relative = mavenPath(library.name)
                val destination = File(paths.libraries, relative)
                val base = (library.url ?: "https://libraries.minecraft.net/").trimEnd('/')
                downloads += DownloadItem("$base/$relative", destination)
                classpath += destination
            }
        }

        return ResolvedLibraries(classpath, downloads)
    }

    data class ResolvedAssets(val indexId: String, val index: AssetIndex, val downloads: List<DownloadItem>)

    suspend fun resolveAssets(version: VersionJson, paths: Paths): ResolvedAssets {
        val indexId = version.assetIndex?.id ?: version.assets ?: "legacy"
        val reference = version.assetIndex ?: return ResolvedAssets(indexId, AssetIndex(), emptyList())

        val indexFile = File(paths.assets, "indexes/$indexId.json")
        val index = withContext(Dispatchers.IO) {
            if (indexFile.isFile) {
                runCatching { com.opbay.client.net.json.decodeFromString<AssetIndex>(indexFile.readText()) }
                    .getOrNull()
            } else {
                null
            } ?: fetchJson<AssetIndex>(reference.url).also {
                indexFile.parentFile?.mkdirs()
                indexFile.writeText(com.opbay.client.net.json.encodeToString(AssetIndex.serializer(), it))
            }
        }

        val downloads = index.objects.values.map { entry ->
            val prefix = entry.hash.take(2)
            DownloadItem(
                url = "$RESOURCES/$prefix/${entry.hash}",
                destination = File(paths.assets, "objects/$prefix/${entry.hash}"),
                sha1 = entry.hash,
                size = entry.size
            )
        }

        return ResolvedAssets(indexId, index, downloads)
    }

    /**
     * Pre-1.6 versions expect real files instead of the hashed object store, so
     * the objects are copied into `assets/virtual/<index>`.
     */
    suspend fun materialiseVirtualAssets(assets: ResolvedAssets, paths: Paths, gameDir: File) =
        withContext(Dispatchers.IO) {
            if (!assets.index.virtual && !assets.index.map_to_resources) return@withContext

            val target = if (assets.index.map_to_resources) File(gameDir, "resources")
            else File(paths.assets, "virtual/${assets.indexId}")

            for ((name, entry) in assets.index.objects) {
                val source = File(paths.assets, "objects/${entry.hash.take(2)}/${entry.hash}")
                val destination = File(target, name)
                if (destination.isFile && destination.length() == entry.size) continue
                destination.parentFile?.mkdirs()
                runCatching { source.copyTo(destination, overwrite = true) }
            }
        }

    fun assetsRoot(assets: ResolvedAssets, paths: Paths): File =
        if (assets.index.virtual) File(paths.assets, "virtual/${assets.indexId}") else paths.assets

    /**
     * Downloads the client jar, libraries and assets a version needs.
     * Returns the flattened version json so callers can build the command line.
     */
    suspend fun prepare(
        paths: Paths,
        versionId: String,
        /** Vanilla version the profile is based on; the client jar is stored under it. */
        baseVersionId: String,
        gameDir: File,
        concurrency: Int,
        onProgress: (label: String, progress: Float?, detail: String?) -> Unit
    ): Pair<VersionJson, List<File>> {
        onProgress("Sürüm bilgisi çözümleniyor", null, versionId)
        val version = Versions.resolve(paths, versionId)

        val downloads = mutableListOf<DownloadItem>()

        val clientJar = paths.clientJar(baseVersionId)
        version.downloads?.get("client")?.let { client ->
            downloads += DownloadItem(client.url, clientJar, client.sha1.ifEmpty { null }, client.size)
        }

        val libraries = resolveLibraries(version, paths)
        downloads += libraries.downloads

        onProgress("Varlık listesi alınıyor", null, null)
        val assets = resolveAssets(version, paths)
        downloads += assets.downloads

        onProgress("Dosyalar indiriliyor", 0f, "${downloads.size} dosya")
        Downloader.downloadAll(downloads, concurrency) { completed, total, current ->
            onProgress("Dosyalar indiriliyor", completed.toFloat() / total, "$completed/$total · $current")
        }

        materialiseVirtualAssets(assets, paths, gameDir)

        return version to (libraries.classpath + clientJar)
    }
}
