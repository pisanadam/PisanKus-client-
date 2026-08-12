package com.opbay.client.minecraft

import com.opbay.client.data.Paths
import com.opbay.client.data.VersionChannel
import com.opbay.client.data.VersionSummary
import com.opbay.client.net.fetchJson
import com.opbay.client.net.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject

private const val MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"

@Serializable
data class Artifact(
    val path: String? = null,
    val sha1: String = "",
    val size: Long = 0,
    val url: String = ""
)

@Serializable
data class Rule(
    val action: String = "allow",
    val os: Os? = null,
    val features: Map<String, Boolean>? = null
) {
    @Serializable
    data class Os(val name: String? = null, val version: String? = null, val arch: String? = null)
}

@Serializable
data class Library(
    val name: String,
    val downloads: Downloads? = null,
    val url: String? = null,
    val natives: Map<String, String>? = null,
    val rules: List<Rule>? = null
) {
    @Serializable
    data class Downloads(
        val artifact: Artifact? = null,
        val classifiers: Map<String, Artifact>? = null
    )
}

@Serializable
data class AssetIndexRef(
    val id: String,
    val sha1: String = "",
    val size: Long = 0,
    val totalSize: Long = 0,
    val url: String = ""
)

@Serializable
data class VersionJson(
    val id: String,
    val inheritsFrom: String? = null,
    val type: String = "release",
    val mainClass: String = "",
    val minecraftArguments: String? = null,
    val arguments: Arguments? = null,
    val assetIndex: AssetIndexRef? = null,
    val assets: String? = null,
    val downloads: Map<String, Artifact>? = null,
    val libraries: List<Library> = emptyList(),
    val javaVersion: JavaVersion? = null
) {
    @Serializable
    data class JavaVersion(val component: String = "", val majorVersion: Int = 8)

    /**
     * Argument lists mix bare strings with conditional objects, so they stay as
     * raw JSON and are interpreted at launch time.
     */
    @Serializable
    data class Arguments(
        val game: List<JsonElement> = emptyList(),
        val jvm: List<JsonElement> = emptyList()
    )
}

@Serializable
private data class ManifestEntry(
    val id: String,
    val type: String,
    val url: String,
    val releaseTime: String = ""
)

@Serializable
private data class Manifest(
    val latest: Latest = Latest(),
    val versions: List<ManifestEntry> = emptyList()
) {
    @Serializable
    data class Latest(val release: String = "", val snapshot: String = "")
}

object Versions {

    private var cache: Pair<Long, Manifest>? = null

    private suspend fun manifest(): Manifest {
        cache?.let { (fetchedAt, data) ->
            if (System.currentTimeMillis() - fetchedAt < 10 * 60_000) return data
        }
        val fresh: Manifest = fetchJson(MANIFEST_URL)
        cache = System.currentTimeMillis() to fresh
        return fresh
    }

    /** Every published version, including the 2010-era alpha and beta builds. */
    suspend fun list(): List<VersionSummary> = manifest().versions.map { entry ->
        VersionSummary(
            id = entry.id,
            channel = when (entry.type) {
                "release" -> VersionChannel.RELEASE
                "snapshot" -> VersionChannel.SNAPSHOT
                "old_beta" -> VersionChannel.OLD_BETA
                else -> VersionChannel.OLD_ALPHA
            },
            releaseTime = entry.releaseTime,
            url = entry.url
        )
    }

    suspend fun latestRelease(): String = manifest().latest.release

    /** Reads a version json from disk, fetching it from Mojang on first use. */
    suspend fun load(paths: Paths, versionId: String): VersionJson = withContext(Dispatchers.IO) {
        val file = paths.versionJson(versionId)
        if (file.isFile) {
            runCatching { json.decodeFromString<VersionJson>(file.readText()) }
                .getOrNull()
                ?.let { return@withContext it }
        }

        val entry = manifest().versions.firstOrNull { it.id == versionId }
            ?: throw IllegalArgumentException("Minecraft sürümü bulunamadı: $versionId")

        val text = fetchJson<JsonObject>(entry.url).toString()
        file.parentFile?.mkdirs()
        file.writeText(text)
        json.decodeFromString(text)
    }

    /**
     * Flattens a version and everything it inherits from. Mod loaders publish
     * partial version files that build on the vanilla one.
     */
    suspend fun resolve(paths: Paths, versionId: String): VersionJson {
        val chain = mutableListOf<VersionJson>()
        val seen = mutableSetOf<String>()
        var current: String? = versionId

        while (current != null && seen.add(current)) {
            val version = load(paths, current)
            chain += version
            current = version.inheritsFrom
        }

        // Parents first, so children override them.
        return chain.reversed().reduce { parent, child ->
            child.copy(
                libraries = parent.libraries + child.libraries,
                arguments = VersionJson.Arguments(
                    game = (parent.arguments?.game ?: emptyList()) + (child.arguments?.game ?: emptyList()),
                    jvm = (parent.arguments?.jvm ?: emptyList()) + (child.arguments?.jvm ?: emptyList())
                ),
                // A child that omits these must keep the parent's values.
                assetIndex = child.assetIndex ?: parent.assetIndex,
                assets = child.assets ?: parent.assets,
                downloads = child.downloads ?: parent.downloads,
                javaVersion = child.javaVersion ?: parent.javaVersion,
                minecraftArguments = child.minecraftArguments ?: parent.minecraftArguments,
                mainClass = child.mainClass.ifEmpty { parent.mainClass }
            )
        }
    }
}

/**
 * Android is not one of Mojang's target platforms, so rules are evaluated as if
 * this were Linux — which is what the Java runtime actually reports.
 */
object Rules {

    const val OS_NAME = "linux"

    val arch: String
        get() = when {
            android.os.Build.SUPPORTED_64_BIT_ABIS.any { it.startsWith("arm") } -> "aarch64"
            android.os.Build.SUPPORTED_64_BIT_ABIS.isNotEmpty() -> "x86_64"
            else -> "x86"
        }

    /** Rules are ordered and the last match wins; an empty list means allow. */
    fun allows(rules: List<Rule>?, features: Map<String, Boolean> = emptyMap()): Boolean {
        if (rules.isNullOrEmpty()) return true

        var allowed = false
        for (rule in rules) {
            var matches = true
            rule.os?.let { os ->
                if (os.name != null && os.name != OS_NAME) matches = false
                // Mojang writes x86/x86_64/arm64; treat anything unexpected as a mismatch.
                if (os.arch != null && os.arch != arch && !(os.arch == "x86_64" && arch == "aarch64")) {
                    matches = false
                }
            }
            rule.features?.forEach { (feature, expected) ->
                if ((features[feature] ?: false) != expected) matches = false
            }
            if (matches) allowed = rule.action == "allow"
        }
        return allowed
    }

    /** Expands the `${placeholder}` tokens used throughout argument templates. */
    fun substitute(template: String, values: Map<String, String>): String {
        var result = template
        for ((key, value) in values) result = result.replace("\${$key}", value)
        return result
    }

    /** Flattens Mojang's mixed string/conditional argument list. */
    fun flatten(
        entries: List<JsonElement>,
        values: Map<String, String>,
        features: Map<String, Boolean>
    ): List<String> {
        val output = mutableListOf<String>()
        for (entry in entries) {
            if (entry is JsonPrimitive) {
                output += substitute(entry.content, values)
                continue
            }

            val obj = entry.jsonObject
            val rules = obj["rules"]?.let { element ->
                runCatching { json.decodeFromJsonElement<List<Rule>>(element) }.getOrNull()
            }
            if (!allows(rules, features)) continue

            when (val value = obj["value"]) {
                is JsonPrimitive -> output += substitute(value.content, values)
                is JsonArray -> value.forEach { item ->
                    (item as? JsonPrimitive)?.let { output += substitute(it.content, values) }
                }
                else -> Unit
            }
        }
        return output
    }
}
