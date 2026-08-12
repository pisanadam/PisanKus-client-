package com.opbay.client.content

import android.content.Context
import android.net.Uri
import com.opbay.client.data.ContentKind
import com.opbay.client.data.InstalledContent
import com.opbay.client.data.LoaderId
import com.opbay.client.data.Profile
import com.opbay.client.data.ProjectVersion
import com.opbay.client.data.Store
import com.opbay.client.net.DownloadItem
import com.opbay.client.net.Downloader
import com.opbay.client.net.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Installs store content into a profile. Modpacks take a separate path because
 * they rewrite the profile's version and loader as well as its files.
 */
class ContentInstaller(private val context: Context, private val store: Store) {

    data class Request(
        val profileId: String,
        val projectId: String,
        val versionId: String? = null,
        val kind: ContentKind,
        val name: String,
        val iconUrl: String? = null,
        val withDependencies: Boolean = true
    )

    private suspend fun resolveVersion(
        projectId: String,
        versionId: String?,
        gameVersion: String,
        loader: LoaderId
    ): ProjectVersion {
        val version = versionId?.let { Modrinth.version(it) }
            ?: Modrinth.bestVersion(projectId, gameVersion, loader)
        return version ?: throw IllegalStateException("Bu profil için uyumlu bir sürüm bulunamadı.")
    }

    suspend fun install(
        request: Request,
        onProgress: (label: String, progress: Float?, detail: String?) -> Unit
    ): List<InstalledContent> {
        val profile = store.profile(request.profileId)
            ?: throw IllegalStateException("Profil bulunamadı.")

        val version = resolveVersion(
            request.projectId,
            request.versionId,
            profile.gameVersion,
            profile.loader
        )

        if (request.kind == ContentKind.MODPACK) {
            return installModpack(profile, version, request, onProgress)
        }

        data class Pending(val projectId: String, val version: ProjectVersion, val name: String, val primary: Boolean)

        val queue = mutableListOf(Pending(request.projectId, version, request.name, true))

        if (request.withDependencies && request.kind == ContentKind.MOD) {
            for (dependency in version.dependencies.filter { it.required && it.projectId != null }) {
                val already = profile.content.any { it.projectId == dependency.projectId }
                if (already) continue

                // A dependency that cannot be resolved must not block the main install.
                runCatching {
                    val resolved = resolveVersion(
                        dependency.projectId!!,
                        dependency.versionId,
                        profile.gameVersion,
                        profile.loader
                    )
                    queue += Pending(dependency.projectId, resolved, resolved.name, false)
                }
            }
        }

        val targetDir = store.paths.contentDir(profile, request.kind).apply { mkdirs() }

        onProgress("${request.name} kuruluyor", 0f, null)
        Downloader.downloadAll(
            queue.map { pending ->
                DownloadItem(
                    url = pending.version.fileUrl,
                    destination = File(targetDir, pending.version.fileName),
                    sha1 = pending.version.sha1,
                    size = pending.version.fileSize
                )
            },
            store.settings.concurrentDownloads
        ) { completed, total, current ->
            onProgress("${request.name} kuruluyor", completed.toFloat() / total, "$completed/$total · $current")
        }

        val installed = queue.map { pending ->
            InstalledContent(
                id = "modrinth:${pending.projectId}",
                source = "modrinth",
                projectId = pending.projectId,
                versionId = pending.version.id,
                kind = request.kind,
                name = pending.name,
                fileName = pending.version.fileName,
                iconUrl = if (pending.primary) request.iconUrl else null
            )
        }

        store.updateProfile(profile.id) { current ->
            val ids = installed.map { it.id }.toSet()
            current.copy(content = current.content.filterNot { it.id in ids } + installed)
        }
        return installed
    }

    // ------------------------------------------------------------------ modpacks

    @Serializable
    private data class MrPackIndex(
        val name: String = "",
        val versionId: String = "",
        val dependencies: Map<String, String> = emptyMap(),
        val files: List<PackFile> = emptyList()
    ) {
        @Serializable
        data class PackFile(
            val path: String = "",
            val hashes: Map<String, String> = emptyMap(),
            val downloads: List<String> = emptyList(),
            val fileSize: Long = 0,
            val env: Env? = null
        )

        @Serializable data class Env(val client: String = "required", val server: String = "required")
    }

    private fun loaderFrom(dependencies: Map<String, String>): Pair<LoaderId, String?> = when {
        dependencies.containsKey("fabric-loader") -> LoaderId.FABRIC to dependencies["fabric-loader"]
        dependencies.containsKey("quilt-loader") -> LoaderId.QUILT to dependencies["quilt-loader"]
        dependencies.containsKey("neoforge") -> LoaderId.NEOFORGE to dependencies["neoforge"]
        dependencies.containsKey("forge") -> LoaderId.FORGE to dependencies["forge"]
        else -> LoaderId.VANILLA to null
    }

    private suspend fun installModpack(
        profile: Profile,
        version: ProjectVersion,
        request: Request,
        onProgress: (String, Float?, String?) -> Unit
    ): List<InstalledContent> = withContext(Dispatchers.IO) {
        val work = File(store.paths.cache, "pack-${System.currentTimeMillis()}").apply { mkdirs() }
        try {
            onProgress("${request.name} indiriliyor", null, version.fileName)
            val archive = File(work, version.fileName.ifEmpty { "pack.zip" })
            Downloader.download(DownloadItem(version.fileUrl, archive, version.sha1, version.fileSize))

            val unpacked = File(work, "unpacked").apply { mkdirs() }
            unzip(archive, unpacked)

            val profileDir = store.paths.profileDir(profile).apply { mkdirs() }

            val mrpack = File(unpacked, "modrinth.index.json")
            if (!mrpack.isFile) {
                throw IllegalStateException("Tanınmayan mod paketi biçimi: arşivde modrinth.index.json yok.")
            }
            listOf(applyMrPack(profile, profileDir, unpacked, mrpack, request, onProgress))
        } finally {
            work.deleteRecursively()
        }
    }

    private suspend fun applyMrPack(
        profile: Profile,
        profileDir: File,
        unpacked: File,
        indexFile: File,
        request: Request,
        onProgress: (String, Float?, String?) -> Unit
    ): InstalledContent {
        val index = json.decodeFromString<MrPackIndex>(indexFile.readText())
        val (loader, loaderVersion) = loaderFrom(index.dependencies)
        val gameVersion = index.dependencies["minecraft"]
            ?: throw IllegalStateException("Mod paketi hangi Minecraft sürümünü kullandığını belirtmiyor.")

        val downloads = index.files
            .filter { it.env?.client != "unsupported" && it.downloads.isNotEmpty() }
            .map { file ->
                DownloadItem(
                    url = file.downloads.first(),
                    // `path` is pack-relative and already includes mods/, config/ …
                    destination = File(profileDir, file.path),
                    sha1 = file.hashes["sha1"],
                    size = file.fileSize
                )
            }

        Downloader.downloadAll(downloads, store.settings.concurrentDownloads) { completed, total, current ->
            onProgress(index.name.ifEmpty { request.name }, completed.toFloat() / total, "$completed/$total · $current")
        }

        // overrides/ carries configs, keybinds and sometimes bundled worlds.
        for (name in listOf("overrides", "client-overrides")) {
            val source = File(unpacked, name)
            if (source.isDirectory) source.copyRecursively(profileDir, overwrite = true)
        }

        val installed = InstalledContent(
            id = "modrinth:${request.projectId}",
            source = "modrinth",
            projectId = request.projectId,
            versionId = index.versionId,
            kind = ContentKind.MODPACK,
            name = index.name.ifEmpty { request.name },
            fileName = "${index.name}-${index.versionId}",
            iconUrl = request.iconUrl
        )

        store.updateProfile(profile.id) { current ->
            current.copy(
                gameVersion = gameVersion,
                loader = loader,
                loaderVersion = loaderVersion,
                content = current.content.filterNot { it.id == installed.id } + installed
            )
        }
        return installed
    }

    // -------------------------------------------------------------- maintenance

    fun setEnabled(profileId: String, contentId: String, enabled: Boolean) {
        val profile = store.profile(profileId) ?: return
        val entry = profile.content.firstOrNull { it.id == contentId } ?: return
        if (entry.enabled == enabled) return

        val dir = store.paths.contentDir(profile, entry.kind)
        val from = File(dir, if (entry.enabled) entry.fileName else "${entry.fileName}.disabled")
        val to = File(dir, if (enabled) entry.fileName else "${entry.fileName}.disabled")
        if (from.exists()) from.renameTo(to)

        store.updateProfile(profileId) { current ->
            current.copy(content = current.content.map {
                if (it.id == contentId) it.copy(enabled = enabled) else it
            })
        }
    }

    fun remove(profileId: String, contentId: String) {
        val profile = store.profile(profileId) ?: return
        val entry = profile.content.firstOrNull { it.id == contentId } ?: return
        val dir = store.paths.contentDir(profile, entry.kind)

        when (entry.kind) {
            ContentKind.WORLD -> File(dir, entry.fileName).deleteRecursively()
            ContentKind.MODPACK -> Unit // Files stay; only the record is dropped.
            else -> {
                File(dir, entry.fileName).delete()
                File(dir, "${entry.fileName}.disabled").delete()
            }
        }

        store.updateProfile(profileId) { current ->
            current.copy(content = current.content.filterNot { it.id == contentId })
        }
    }

    /** Flags installed content that has a newer version for this profile. */
    suspend fun checkUpdates(profileId: String) {
        val profile = store.profile(profileId) ?: return
        val flagged = profile.content.map { entry ->
            if (entry.source == "local" || entry.projectId == null) return@map entry
            val latest = runCatching {
                Modrinth.bestVersion(entry.projectId, profile.gameVersion, profile.loader)
            }.getOrNull()
            entry.copy(updateAvailable = latest?.id?.takeIf { it != entry.versionId })
        }
        store.updateProfile(profileId) { it.copy(content = flagged) }
    }

    suspend fun update(
        profileId: String,
        contentId: String,
        onProgress: (String, Float?, String?) -> Unit
    ): List<InstalledContent> {
        val profile = store.profile(profileId) ?: throw IllegalStateException("Profil bulunamadı.")
        val entry = profile.content.firstOrNull { it.id == contentId }
            ?: throw IllegalStateException("İçerik bulunamadı.")
        if (entry.projectId == null || entry.source == "local") {
            throw IllegalStateException("Bu içerik güncellenemiyor.")
        }

        remove(profileId, contentId)
        return install(
            Request(
                profileId = profileId,
                projectId = entry.projectId,
                versionId = entry.updateAvailable,
                kind = entry.kind,
                name = entry.name,
                iconUrl = entry.iconUrl
            ),
            onProgress
        )
    }

    /**
     * Imports a file the player picked. Worlds arrive as zips and are unpacked
     * into `saves/`; everything else is copied as-is.
     */
    suspend fun importLocal(
        profileId: String,
        uri: Uri,
        displayName: String,
        kind: ContentKind
    ): InstalledContent = withContext(Dispatchers.IO) {
        val profile = store.profile(profileId) ?: throw IllegalStateException("Profil bulunamadı.")
        val targetDir = store.paths.contentDir(profile, kind).apply { mkdirs() }

        val fileName = if (kind == ContentKind.WORLD) {
            importWorld(uri, displayName, targetDir)
        } else {
            context.contentResolver.openInputStream(uri).use { input ->
                requireNotNull(input) { "Dosya okunamadı." }
                File(targetDir, displayName).outputStream().use { input.copyTo(it) }
            }
            displayName
        }

        val entry = InstalledContent(
            id = "local:${fileName.hashCode()}",
            source = "local",
            kind = kind,
            name = fileName.removeSuffix(".jar").removeSuffix(".zip"),
            fileName = fileName
        )

        store.updateProfile(profileId) { current ->
            current.copy(content = current.content.filterNot { it.id == entry.id } + entry)
        }
        entry
    }

    /**
     * World archives may or may not have a top-level folder, so the location of
     * level.dat decides where the world root actually is.
     */
    private fun importWorld(uri: Uri, displayName: String, savesDir: File): String {
        val staging = File(store.paths.cache, "world-${System.currentTimeMillis()}").apply { mkdirs() }
        try {
            context.contentResolver.openInputStream(uri).use { input ->
                requireNotNull(input) { "Dosya okunamadı." }
                unzipStream(input, staging)
            }

            val root = if (File(staging, "level.dat").isFile) {
                staging
            } else {
                staging.listFiles()?.firstOrNull { it.isDirectory && File(it, "level.dat").isFile }
                    ?: throw IllegalStateException("Arşiv geçerli bir Minecraft dünyası içermiyor (level.dat yok).")
            }

            val base = displayName.removeSuffix(".zip")
            var folder = base
            var suffix = 2
            while (File(savesDir, folder).exists()) folder = "$base ($suffix)".also { suffix++ }

            root.copyRecursively(File(savesDir, folder), overwrite = true)
            return folder
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun unzip(archive: File, target: File) =
        archive.inputStream().use { unzipStream(it, target) }

    private fun unzipStream(input: java.io.InputStream, target: File) {
        ZipInputStream(input.buffered()).use { zip ->
            val targetPath = target.canonicalPath + File.separator
            while (true) {
                val entry = zip.nextEntry ?: break
                val file = File(target, entry.name)
                // Reject entries that would escape the target directory.
                if (!file.canonicalPath.startsWith(targetPath)) continue
                if (entry.isDirectory) {
                    file.mkdirs()
                } else {
                    file.parentFile?.mkdirs()
                    file.outputStream().use { zip.copyTo(it) }
                }
            }
        }
    }
}
