package com.opbay.client.content

import com.opbay.client.data.ContentKind
import com.opbay.client.data.LoaderId
import com.opbay.client.data.ProjectVersion
import com.opbay.client.data.SearchResult
import com.opbay.client.net.HttpException
import com.opbay.client.net.fetchJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.net.URLEncoder

private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

/** Free-text search parameters shared by both stores. */
data class SearchQuery(
    val query: String = "",
    val kind: ContentKind = ContentKind.MOD,
    val gameVersion: String? = null,
    val loader: LoaderId? = null,
    val sort: String = "relevance",
    val offset: Int = 0,
    val limit: Int = 30
)

object Modrinth {

    private const val API = "https://api.modrinth.com/v2"

    private fun projectType(kind: ContentKind) = when (kind) {
        ContentKind.MOD -> "mod"
        ContentKind.RESOURCEPACK -> "resourcepack"
        ContentKind.SHADER -> "shader"
        ContentKind.DATAPACK -> "datapack"
        ContentKind.MODPACK -> "modpack"
        // Modrinth has no world category; worlds arrive via modpacks or local import.
        ContentKind.WORLD -> "modpack"
    }

    @Serializable
    private data class SearchResponse(val hits: List<Hit> = emptyList()) {
        @Serializable
        data class Hit(
            val project_id: String,
            val slug: String = "",
            val title: String = "",
            val description: String = "",
            val author: String = "",
            val icon_url: String? = null,
            val downloads: Long = 0,
            val categories: List<String> = emptyList(),
            val project_type: String = "mod",
            val date_modified: String = ""
        )
    }

    @Serializable
    data class Version(
        val id: String,
        val project_id: String = "",
        val name: String = "",
        val version_number: String = "",
        val game_versions: List<String> = emptyList(),
        val loaders: List<String> = emptyList(),
        val version_type: String = "release",
        val date_published: String = "",
        val files: List<VersionFile> = emptyList(),
        val dependencies: List<Dependency> = emptyList()
    ) {
        @Serializable
        data class VersionFile(
            val url: String = "",
            val filename: String = "",
            val size: Long = 0,
            val primary: Boolean = false,
            val hashes: Map<String, String> = emptyMap()
        )

        @Serializable
        data class Dependency(
            val project_id: String? = null,
            val version_id: String? = null,
            val dependency_type: String = "required"
        )
    }

    suspend fun search(query: SearchQuery): List<SearchResult> {
        val facets = mutableListOf("""["project_type:${projectType(query.kind)}"]""")
        query.gameVersion?.let { facets += """["versions:$it"]""" }
        // Resource packs and shaders are loader-independent.
        if (query.loader != null && query.loader != LoaderId.VANILLA &&
            (query.kind == ContentKind.MOD || query.kind == ContentKind.MODPACK)
        ) {
            facets += """["categories:${query.loader.slug}"]"""
        }

        val index = when (query.sort) {
            "downloads", "follows", "updated", "newest" -> query.sort
            else -> "relevance"
        }

        val url = "$API/search?query=${encode(query.query)}" +
            "&facets=${encode("[${facets.joinToString(",")}]")}" +
            "&index=$index&offset=${query.offset}&limit=${query.limit}"

        return fetchJson<SearchResponse>(url).hits.map { hit ->
            SearchResult(
                source = "modrinth",
                projectId = hit.project_id,
                slug = hit.slug,
                title = hit.title,
                description = hit.description,
                author = hit.author.ifEmpty { null },
                iconUrl = hit.icon_url,
                downloads = hit.downloads,
                categories = hit.categories,
                kind = when (hit.project_type) {
                    "resourcepack" -> ContentKind.RESOURCEPACK
                    "shader" -> ContentKind.SHADER
                    "datapack" -> ContentKind.DATAPACK
                    "modpack" -> ContentKind.MODPACK
                    else -> ContentKind.MOD
                },
                updatedAt = hit.date_modified.ifEmpty { null }
            )
        }
    }

    private fun Version.toProjectVersion(): ProjectVersion {
        val file = files.firstOrNull { it.primary } ?: files.firstOrNull()
        return ProjectVersion(
            id = id,
            name = name,
            versionNumber = version_number,
            gameVersions = game_versions,
            loaders = loaders,
            channel = version_type,
            publishedAt = date_published,
            fileName = file?.filename.orEmpty(),
            fileUrl = file?.url.orEmpty(),
            fileSize = file?.size ?: 0,
            sha1 = file?.hashes?.get("sha1"),
            dependencies = dependencies.map {
                ProjectVersion.Dependency(it.project_id, it.version_id, it.dependency_type == "required")
            }
        )
    }

    suspend fun versions(
        projectId: String,
        gameVersion: String? = null,
        loader: LoaderId? = null
    ): List<ProjectVersion> {
        val params = buildList {
            gameVersion?.let { add("game_versions=${encode("[\"$it\"]")}") }
            if (loader != null && loader != LoaderId.VANILLA) {
                add("loaders=${encode("[\"${loader.slug}\"]")}")
            }
        }.joinToString("&")

        return fetchJson<List<Version>>("$API/project/$projectId/version?$params")
            .map { it.toProjectVersion() }
    }

    suspend fun bestVersion(
        projectId: String,
        gameVersion: String?,
        loader: LoaderId?
    ): ProjectVersion? {
        val all = versions(projectId, gameVersion, loader)
        return all.firstOrNull { it.channel == "release" } ?: all.firstOrNull()
    }

    suspend fun version(versionId: String): ProjectVersion =
        fetchJson<Version>("$API/version/$versionId").toProjectVersion()
}

object CurseForge {

    private const val API = "https://api.curseforge.com/v1"
    private const val MINECRAFT = 432

    class MissingKeyException : Exception(
        "CurseForge için API anahtarı gerekiyor. Ayarlar → İçerik bölümünden anahtarınızı girin " +
            "(console.curseforge.com üzerinden ücretsiz alınabilir)."
    )

    private fun classId(kind: ContentKind) = when (kind) {
        ContentKind.MOD -> 6
        ContentKind.RESOURCEPACK -> 12
        ContentKind.SHADER -> 6552
        ContentKind.WORLD -> 17
        ContentKind.DATAPACK -> 6945
        ContentKind.MODPACK -> 4471
    }

    private fun loaderType(loader: LoaderId?) = when (loader) {
        LoaderId.FORGE -> 1
        LoaderId.FABRIC -> 4
        LoaderId.QUILT -> 5
        LoaderId.NEOFORGE -> 6
        else -> null
    }

    @Serializable
    private data class ModsResponse(val data: List<Mod> = emptyList())

    @Serializable
    private data class Mod(
        val id: Long,
        val name: String = "",
        val slug: String = "",
        val summary: String = "",
        val classId: Int = 6,
        val downloadCount: Long = 0,
        val logo: Logo? = null,
        val authors: List<Author> = emptyList(),
        val categories: List<Category> = emptyList(),
        val dateModified: String = ""
    ) {
        @Serializable data class Logo(val thumbnailUrl: String = "")
        @Serializable data class Author(val name: String = "")
        @Serializable data class Category(val name: String = "")
    }

    @Serializable
    private data class FilesResponse(val data: List<CfFile> = emptyList())

    @Serializable
    data class CfFile(
        val id: Long,
        val displayName: String = "",
        val fileName: String = "",
        val fileDate: String = "",
        val fileLength: Long = 0,
        val releaseType: Int = 1,
        val downloadUrl: String? = null,
        val gameVersions: List<String> = emptyList(),
        val hashes: List<Hash> = emptyList(),
        val dependencies: List<Dep> = emptyList()
    ) {
        @Serializable data class Hash(val value: String = "", val algo: Int = 1)
        @Serializable data class Dep(val modId: Long = 0, val relationType: Int = 3)
    }

    private suspend inline fun <reified T> request(apiKey: String?, path: String): T {
        if (apiKey.isNullOrBlank()) throw MissingKeyException()
        return try {
            fetchJson("$API$path", mapOf("x-api-key" to apiKey))
        } catch (error: HttpException) {
            if (error.code == 403) {
                throw Exception("CurseForge API anahtarı reddedildi. Ayarlardan anahtarı kontrol edin.")
            }
            throw error
        }
    }

    suspend fun search(apiKey: String?, query: SearchQuery): List<SearchResult> {
        val sortField = when (query.sort) {
            "updated" -> 3
            "newest" -> 11
            "downloads" -> 6
            else -> 2
        }
        val params = buildString {
            append("gameId=$MINECRAFT&classId=${classId(query.kind)}")
            append("&searchFilter=${encode(query.query)}")
            append("&index=${query.offset}&pageSize=${query.limit}")
            append("&sortOrder=desc&sortField=$sortField")
            query.gameVersion?.let { append("&gameVersion=$it") }
            if (query.kind == ContentKind.MOD || query.kind == ContentKind.MODPACK) {
                loaderType(query.loader)?.let { append("&modLoaderType=$it") }
            }
        }

        return request<ModsResponse>(apiKey, "/mods/search?$params").data.map { mod ->
            SearchResult(
                source = "curseforge",
                projectId = mod.id.toString(),
                slug = mod.slug,
                title = mod.name,
                description = mod.summary,
                author = mod.authors.firstOrNull()?.name,
                iconUrl = mod.logo?.thumbnailUrl?.ifEmpty { null },
                downloads = mod.downloadCount,
                categories = mod.categories.map { it.name },
                kind = query.kind,
                updatedAt = mod.dateModified.ifEmpty { null }
            )
        }
    }

    /** CurseForge omits downloadUrl when an author blocks third-party clients. */
    private fun CfFile.resolvedUrl(): String {
        downloadUrl?.takeIf { it.isNotEmpty() }?.let { return it }
        val text = id.toString()
        return "https://mediafilez.forgecdn.net/files/${text.take(4)}/${text.drop(4).toInt()}/${encode(fileName)}"
    }

    private fun CfFile.toProjectVersion() = ProjectVersion(
        id = id.toString(),
        name = displayName,
        versionNumber = displayName,
        gameVersions = gameVersions.filter { it.firstOrNull()?.isDigit() == true },
        loaders = gameVersions.filter { it.lowercase() in setOf("forge", "fabric", "quilt", "neoforge") }
            .map { it.lowercase() },
        channel = when (releaseType) {
            1 -> "release"
            2 -> "beta"
            else -> "alpha"
        },
        publishedAt = fileDate,
        fileName = fileName,
        fileUrl = resolvedUrl(),
        fileSize = fileLength,
        sha1 = hashes.firstOrNull { it.algo == 1 }?.value,
        dependencies = dependencies
            .filter { it.relationType == 3 || it.relationType == 2 }
            .map { ProjectVersion.Dependency(it.modId.toString(), null, it.relationType == 3) }
    )

    suspend fun versions(
        apiKey: String?,
        projectId: String,
        gameVersion: String? = null,
        loader: LoaderId? = null
    ): List<ProjectVersion> {
        val params = buildString {
            append("pageSize=50")
            gameVersion?.let { append("&gameVersion=$it") }
            loaderType(loader)?.let { append("&modLoaderType=$it") }
        }
        return request<FilesResponse>(apiKey, "/mods/$projectId/files?$params").data.map { it.toProjectVersion() }
    }

    suspend fun bestVersion(
        apiKey: String?,
        projectId: String,
        gameVersion: String?,
        loader: LoaderId?
    ): ProjectVersion? {
        val all = versions(apiKey, projectId, gameVersion, loader)
        return all.firstOrNull { it.channel == "release" } ?: all.firstOrNull()
    }
}
