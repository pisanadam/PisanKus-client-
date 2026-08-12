package com.opbay.client.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

/**
 * Single source of truth, persisted as one JSON file. Writes go through a temp
 * file and an atomic rename so a kill mid-write cannot truncate the database.
 */
class Store(context: Context) {

    private val file = File(context.filesDir, "launcher.json")
    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _db = MutableStateFlow(load())
    val db: StateFlow<LauncherDb> = _db.asStateFlow()

    val paths = Paths(context)

    private fun load(): LauncherDb = runCatching {
        if (file.exists()) json.decodeFromString<LauncherDb>(file.readText()) else LauncherDb()
    }.getOrElse {
        // Keep the unreadable file for support rather than silently dropping it.
        if (file.exists()) file.renameTo(File(file.parentFile, "launcher-corrupt-${System.currentTimeMillis()}.json"))
        LauncherDb()
    }

    @Synchronized
    private fun persist(next: LauncherDb) {
        _db.value = next
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(json.encodeToString(next))
        temp.renameTo(file)
    }

    private fun update(transform: (LauncherDb) -> LauncherDb) = persist(transform(_db.value))

    // ------------------------------------------------------------------ settings

    val settings: Settings get() = _db.value.settings

    fun updateSettings(transform: (Settings) -> Settings) =
        update { it.copy(settings = transform(it.settings)) }

    // ------------------------------------------------------------------ accounts

    val accounts: List<Account> get() = _db.value.accounts

    val activeAccount: Account?
        get() = _db.value.let { database ->
            database.accounts.firstOrNull { it.id == database.activeAccountId } ?: database.accounts.firstOrNull()
        }

    fun upsertAccount(account: Account) = update { database ->
        val accounts = database.accounts.filterNot { it.id == account.id } + account
        database.copy(accounts = accounts, activeAccountId = database.activeAccountId ?: account.id)
    }

    fun setActiveAccount(id: String) = update { it.copy(activeAccountId = id) }

    fun removeAccount(id: String) = update { database ->
        val accounts = database.accounts.filterNot { it.id == id }
        database.copy(
            accounts = accounts,
            activeAccountId = if (database.activeAccountId == id) accounts.firstOrNull()?.id else database.activeAccountId
        )
    }

    // ------------------------------------------------------------------ profiles

    val profiles: List<Profile> get() = _db.value.profiles

    fun profile(id: String): Profile? = _db.value.profiles.firstOrNull { it.id == id }

    fun createProfile(
        name: String,
        gameVersion: String,
        loader: LoaderId,
        loaderVersion: String?,
        icon: String
    ): Profile {
        // Two profiles may share a name, never a directory — otherwise they would
        // share mods and worlds.
        val taken = profiles.map { it.folder }.toSet()
        val slug = name.filter { it.isLetterOrDigit() || it == ' ' || it == '-' || it == '_' }
            .trim()
            .ifEmpty { "profil" }
        var folder = slug
        var suffix = 2
        while (folder in taken) folder = "$slug-${suffix++}"

        val profile = Profile(
            id = UUID.randomUUID().toString(),
            name = name,
            gameVersion = gameVersion,
            loader = loader,
            loaderVersion = loaderVersion,
            icon = icon,
            folder = folder,
            memoryMb = settings.defaultMemoryMb
        )
        paths.profileDir(profile).mkdirs()
        update { it.copy(profiles = it.profiles + profile) }
        return profile
    }

    fun updateProfile(id: String, transform: (Profile) -> Profile) = update { database ->
        database.copy(profiles = database.profiles.map { if (it.id == id) transform(it) else it })
    }

    fun removeProfile(id: String, deleteFiles: Boolean) {
        if (deleteFiles) profile(id)?.let { paths.profileDir(it).deleteRecursively() }
        update { database -> database.copy(profiles = database.profiles.filterNot { it.id == id }) }
    }
}

/** Every directory the launcher owns, derived from the app's private storage. */
class Paths(context: Context) {
    val root: File = File(context.filesDir, "minecraft").apply { mkdirs() }
    val versions = File(root, "versions")
    val libraries = File(root, "libraries")
    val assets = File(root, "assets")
    val profiles = File(root, "profiles")
    val runtimes = File(context.filesDir, "runtimes")
    val cache: File = context.cacheDir

    fun profileDir(profile: Profile): File = File(profiles, profile.folder)

    fun contentDir(profile: Profile, kind: ContentKind): File =
        if (kind == ContentKind.MODPACK) profileDir(profile) else File(profileDir(profile), kind.directory)

    fun versionDir(versionId: String): File = File(versions, versionId)

    fun versionJson(versionId: String): File = File(versionDir(versionId), "$versionId.json")

    fun clientJar(versionId: String): File = File(versionDir(versionId), "$versionId.jar")
}
