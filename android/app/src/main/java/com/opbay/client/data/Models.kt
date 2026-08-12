package com.opbay.client.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class LoaderId {
    @SerialName("vanilla") VANILLA,
    @SerialName("fabric") FABRIC,
    @SerialName("quilt") QUILT,
    @SerialName("forge") FORGE,
    @SerialName("neoforge") NEOFORGE;

    /** Identifier the Modrinth and CurseForge APIs expect. */
    val slug: String get() = name.lowercase()

    val label: String
        get() = when (this) {
            VANILLA -> "Vanilla"
            FABRIC -> "Fabric"
            QUILT -> "Quilt"
            FORGE -> "Forge"
            NEOFORGE -> "NeoForge"
        }
}

@Serializable
enum class ContentKind {
    @SerialName("mod") MOD,
    @SerialName("resourcepack") RESOURCEPACK,
    @SerialName("shader") SHADER,
    @SerialName("datapack") DATAPACK,
    @SerialName("world") WORLD,
    @SerialName("modpack") MODPACK;

    /** Directory inside a profile where this kind of content lives. */
    val directory: String
        get() = when (this) {
            MOD -> "mods"
            RESOURCEPACK -> "resourcepacks"
            SHADER -> "shaderpacks"
            DATAPACK -> "datapacks"
            WORLD -> "saves"
            MODPACK -> "."
        }

    val label: String
        get() = when (this) {
            MOD -> "Modlar"
            RESOURCEPACK -> "Doku paketleri"
            SHADER -> "Shaderlar"
            DATAPACK -> "Veri paketleri"
            WORLD -> "Dünyalar"
            MODPACK -> "Mod paketleri"
        }
}

/** Mojang's version channels. Beta and alpha are the 2010-era builds. */
@Serializable
enum class VersionChannel {
    @SerialName("release") RELEASE,
    @SerialName("snapshot") SNAPSHOT,
    @SerialName("old_beta") OLD_BETA,
    @SerialName("old_alpha") OLD_ALPHA;

    val label: String
        get() = when (this) {
            RELEASE -> "Sürüm"
            SNAPSHOT -> "Anlık görüntü"
            OLD_BETA -> "Beta"
            OLD_ALPHA -> "Alfa"
        }
}

@Serializable
data class Account(
    val id: String,
    val name: String,
    val accessToken: String,
    val expiresAt: Long,
    val refreshToken: String,
    val skinUrl: String? = null,
    val addedAt: Long = System.currentTimeMillis()
) {
    val expired: Boolean get() = expiresAt <= System.currentTimeMillis()
}

@Serializable
data class InstalledContent(
    val id: String,
    val source: String,
    val projectId: String? = null,
    val versionId: String? = null,
    val kind: ContentKind,
    val name: String,
    val fileName: String,
    val iconUrl: String? = null,
    val updateAvailable: String? = null,
    val enabled: Boolean = true,
    val installedAt: Long = System.currentTimeMillis()
)

@Serializable
data class Profile(
    val id: String,
    val name: String,
    val gameVersion: String,
    val loader: LoaderId = LoaderId.VANILLA,
    val loaderVersion: String? = null,
    val icon: String = "🎮",
    /** Folder name under `minecraft/profiles`, unique per profile. */
    val folder: String,
    val memoryMb: Int = 1024,
    val jvmArgs: String? = null,
    val content: List<InstalledContent> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val lastPlayed: Long? = null,
    val totalPlaytimeMs: Long = 0
)

/** A palette the player can build in Settings. */
@Serializable
data class ThemeSettings(
    /** ARGB seed colour Material 3 derives the whole scheme from. */
    val seedColor: Long = 0xFF5B8CFFL,
    val mode: ThemeMode = ThemeMode.SYSTEM,
    /** Use the wallpaper-derived palette on Android 12+. */
    val dynamicColor: Boolean = false,
    /** True black backgrounds for OLED panels. */
    val amoled: Boolean = false,
    val cornerRadiusDp: Int = 16,
    val fontScale: Float = 1.0f
)

@Serializable
enum class ThemeMode {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
    @SerialName("system") SYSTEM;

    val label: String
        get() = when (this) {
            LIGHT -> "Açık"
            DARK -> "Koyu"
            SYSTEM -> "Sistem"
        }
}

@Serializable
data class Settings(
    val defaultMemoryMb: Int = 1024,
    val jvmArgs: String = "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1HeapRegionSize=16M",
    val msClientId: String = "00000000402b5328",
    val curseForgeApiKey: String? = null,
    val concurrentDownloads: Int = 6,
    val theme: ThemeSettings = ThemeSettings(),
    /** Path of the Java runtime chosen for launches, if any is installed. */
    val runtimeName: String? = null
)

@Serializable
data class LauncherDb(
    val settings: Settings = Settings(),
    val profiles: List<Profile> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val activeAccountId: String? = null
)

/** Normalised search result covering Modrinth and CurseForge. */
data class SearchResult(
    val source: String,
    val projectId: String,
    val slug: String,
    val title: String,
    val description: String,
    val author: String?,
    val iconUrl: String?,
    val downloads: Long,
    val categories: List<String>,
    val kind: ContentKind,
    val updatedAt: String?
)

data class ProjectVersion(
    val id: String,
    val name: String,
    val versionNumber: String,
    val gameVersions: List<String>,
    val loaders: List<String>,
    val channel: String,
    val publishedAt: String,
    val fileName: String,
    val fileUrl: String,
    val fileSize: Long,
    val sha1: String?,
    val dependencies: List<Dependency>
) {
    data class Dependency(val projectId: String?, val versionId: String?, val required: Boolean)
}

data class VersionSummary(
    val id: String,
    val channel: VersionChannel,
    val releaseTime: String,
    val url: String
)

/** Progress of a long-running job, surfaced in the UI as a card. */
data class TaskState(
    val id: String,
    val label: String,
    /** 0f..1f, or null when the total is unknown. */
    val progress: Float?,
    val detail: String? = null,
    val state: Status = Status.RUNNING,
    val error: String? = null
) {
    enum class Status { RUNNING, DONE, ERROR }
}
