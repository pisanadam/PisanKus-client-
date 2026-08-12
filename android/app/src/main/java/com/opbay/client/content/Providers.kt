package com.opbay.client.content

import com.opbay.client.data.ContentKind
import com.opbay.client.data.LoaderId
import com.opbay.client.data.ProjectVersion
import com.opbay.client.data.SearchResult
import com.opbay.client.net.fetchJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.net.URLEncoder

private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

/** Free-text search parameters. */
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
