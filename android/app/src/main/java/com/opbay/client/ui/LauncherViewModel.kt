package com.opbay.client.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.opbay.client.auth.MicrosoftAuth
import com.opbay.client.content.ContentInstaller
import com.opbay.client.content.CurseForge
import com.opbay.client.content.Modrinth
import com.opbay.client.content.SearchQuery
import com.opbay.client.data.Account
import com.opbay.client.data.ContentKind
import com.opbay.client.data.LauncherDb
import com.opbay.client.data.LoaderId
import com.opbay.client.data.Profile
import com.opbay.client.data.ProjectVersion
import com.opbay.client.data.SearchResult
import com.opbay.client.data.Settings
import com.opbay.client.data.Store
import com.opbay.client.data.TaskState
import com.opbay.client.data.ThemeSettings
import com.opbay.client.data.VersionChannel
import com.opbay.client.data.VersionSummary
import com.opbay.client.game.GameLauncher
import com.opbay.client.game.GameService
import com.opbay.client.game.InstalledRuntime
import com.opbay.client.game.JavaRuntime
import com.opbay.client.minecraft.LoaderVersion
import com.opbay.client.minecraft.Loaders
import com.opbay.client.minecraft.Versions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

/** Whether a profile currently has a game process attached. */
enum class GameStatus { IDLE, PREPARING, RUNNING }

data class LogLine(val text: String, val at: Long = System.currentTimeMillis())

class LauncherViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store(application)
    private val installer = ContentInstaller(application, store)
    private val launcher = GameLauncher(application, store.paths)

    val db: StateFlow<LauncherDb> = store.db

    private val _tasks = MutableStateFlow<List<TaskState>>(emptyList())
    val tasks: StateFlow<List<TaskState>> = _tasks.asStateFlow()

    private val _gameStatus = MutableStateFlow<Map<String, GameStatus>>(emptyMap())
    val gameStatus: StateFlow<Map<String, GameStatus>> = _gameStatus.asStateFlow()

    private val _logs = MutableStateFlow<Map<String, List<LogLine>>>(emptyMap())
    val logs: StateFlow<Map<String, List<LogLine>>> = _logs.asStateFlow()

    private val _versions = MutableStateFlow<List<VersionSummary>>(emptyList())
    val versions: StateFlow<List<VersionSummary>> = _versions.asStateFlow()

    private val _runtimes = MutableStateFlow<List<InstalledRuntime>>(emptyList())
    val runtimes: StateFlow<List<InstalledRuntime>> = _runtimes.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private val _signingIn = MutableStateFlow(false)
    val signingIn: StateFlow<Boolean> = _signingIn.asStateFlow()

    private val processes = mutableMapOf<String, Process>()
    private val jobs = mutableMapOf<String, Job>()

    val settings: Settings get() = store.settings
    val activeAccount: Account? get() = store.activeAccount

    init {
        refreshVersions()
        refreshRuntimes()
    }

    // --------------------------------------------------------------------- tasks

    private fun report(
        id: String,
        label: String,
        progress: Float?,
        detail: String? = null,
        state: TaskState.Status = TaskState.Status.RUNNING,
        error: String? = null
    ) {
        _tasks.value = _tasks.value.filterNot { it.id == id } +
            TaskState(id, label, progress, detail, state, error)

        if (state != TaskState.Status.RUNNING) {
            viewModelScope.launch {
                kotlinx.coroutines.delay(if (state == TaskState.Status.ERROR) 9000 else 2500)
                dismissTask(id)
            }
        }
    }

    fun dismissTask(id: String) {
        _tasks.value = _tasks.value.filterNot { it.id == id }
    }

    fun notify(message: String, isError: Boolean = false) = report(
        id = "notice-${UUID.randomUUID()}",
        label = message,
        progress = 1f,
        state = if (isError) TaskState.Status.ERROR else TaskState.Status.DONE,
        error = if (isError) message else null
    )

    /** Runs work in the background, turning any failure into a visible message. */
    private fun run(taskId: String, label: String, block: suspend () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                block()
            } catch (error: Exception) {
                report(taskId, label, 0f, null, TaskState.Status.ERROR, error.message ?: error.toString())
            }
        }
    }

    // ------------------------------------------------------------------ accounts

    fun beginSignIn(): Pair<String, MicrosoftAuth.PkceChallenge> {
        val pkce = MicrosoftAuth.PkceChallenge()
        _authError.value = null
        return MicrosoftAuth.authorizeUrl(store.settings.msClientId, pkce) to pkce
    }

    fun completeSignIn(code: String, pkce: MicrosoftAuth.PkceChallenge) {
        _signingIn.value = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val account = MicrosoftAuth.signIn(store.settings.msClientId, code, pkce)
                store.upsertAccount(account)
                _authError.value = null
            } catch (error: Exception) {
                _authError.value = error.message ?: "Oturum açılamadı."
            } finally {
                _signingIn.value = false
            }
        }
    }

    fun cancelSignIn(reason: String? = null) {
        _signingIn.value = false
        _authError.value = reason
    }

    fun setActiveAccount(id: String) = store.setActiveAccount(id)

    fun removeAccount(id: String) = store.removeAccount(id)

    fun refreshAccount(id: String) = run("refresh-$id", "Oturum yenileniyor") {
        val account = store.accounts.firstOrNull { it.id == id } ?: return@run
        store.upsertAccount(MicrosoftAuth.refresh(account, store.settings.msClientId))
        notify("Oturum yenilendi.")
    }

    // ------------------------------------------------------------------ settings

    fun updateSettings(transform: (Settings) -> Settings) = store.updateSettings(transform)

    fun updateTheme(transform: (ThemeSettings) -> ThemeSettings) =
        store.updateSettings { it.copy(theme = transform(it.theme)) }

    // ------------------------------------------------------------------ versions

    fun refreshVersions() = viewModelScope.launch(Dispatchers.IO) {
        runCatching { Versions.list() }
            .onSuccess { _versions.value = it }
            .onFailure { notify("Sürüm listesi alınamadı: ${it.message}", isError = true) }
    }

    /** Version list filtered by the channels the player enabled. */
    fun versionsFor(channels: Set<VersionChannel>): List<VersionSummary> =
        _versions.value.filter { it.channel in channels }

    suspend fun loaderVersions(loader: LoaderId, gameVersion: String): List<LoaderVersion> =
        runCatching { Loaders.listVersions(loader, gameVersion) }.getOrDefault(emptyList())

    // ------------------------------------------------------------------ profiles

    fun createProfile(
        name: String,
        gameVersion: String,
        loader: LoaderId,
        loaderVersion: String?,
        icon: String
    ): Profile = store.createProfile(name, gameVersion, loader, loaderVersion, icon)

    fun updateProfile(id: String, transform: (Profile) -> Profile) = store.updateProfile(id, transform)

    fun deleteProfile(id: String) {
        stopGame(id)
        store.removeProfile(id, deleteFiles = true)
    }

    fun profile(id: String): Profile? = store.profile(id)

    // ------------------------------------------------------------------- content

    fun search(
        source: String,
        query: SearchQuery,
        onResult: (List<SearchResult>) -> Unit,
        onError: (String) -> Unit
    ) = viewModelScope.launch(Dispatchers.IO) {
        try {
            val results = if (source == "curseforge") {
                CurseForge.search(store.settings.curseForgeApiKey, query)
            } else {
                Modrinth.search(query)
            }
            onResult(results)
        } catch (error: Exception) {
            onError(error.message ?: "Arama başarısız.")
        }
    }

    fun projectVersions(
        source: String,
        projectId: String,
        gameVersion: String?,
        loader: LoaderId?,
        onResult: (List<ProjectVersion>) -> Unit,
        onError: (String) -> Unit
    ) = viewModelScope.launch(Dispatchers.IO) {
        try {
            val versions = if (source == "curseforge") {
                CurseForge.versions(store.settings.curseForgeApiKey, projectId, gameVersion, loader)
            } else {
                Modrinth.versions(projectId, gameVersion, loader)
            }
            onResult(versions)
        } catch (error: Exception) {
            onError(error.message ?: "Sürümler alınamadı.")
        }
    }

    fun install(request: ContentInstaller.Request) {
        val taskId = "install-${request.source}-${request.projectId}"
        run(taskId, "${request.name} kurulamadı") {
            report(taskId, "${request.name} kuruluyor", null)
            installer.install(request) { label, progress, detail ->
                report(taskId, label, progress, detail)
            }
            report(taskId, "${request.name} kuruldu", 1f, null, TaskState.Status.DONE)
        }
    }

    fun setContentEnabled(profileId: String, contentId: String, enabled: Boolean) =
        installer.setEnabled(profileId, contentId, enabled)

    fun removeContent(profileId: String, contentId: String) = installer.remove(profileId, contentId)

    fun checkUpdates(profileId: String) = run("updates-$profileId", "Güncellemeler denetlenemedi") {
        report("updates-$profileId", "Güncellemeler denetleniyor", null)
        installer.checkUpdates(profileId)
        report("updates-$profileId", "Denetim tamamlandı", 1f, null, TaskState.Status.DONE)
    }

    fun updateContent(profileId: String, contentId: String) {
        val taskId = "update-$contentId"
        run(taskId, "Güncelleme başarısız") {
            installer.update(profileId, contentId) { label, progress, detail ->
                report(taskId, label, progress, detail)
            }
            report(taskId, "Güncellendi", 1f, null, TaskState.Status.DONE)
        }
    }

    fun importContent(profileId: String, uri: Uri, displayName: String, kind: ContentKind) {
        val taskId = "import-${UUID.randomUUID()}"
        run(taskId, "İçe aktarılamadı") {
            report(taskId, "$displayName aktarılıyor", null)
            installer.importLocal(profileId, uri, displayName, kind)
            report(taskId, "$displayName aktarıldı", 1f, null, TaskState.Status.DONE)
        }
    }

    // ------------------------------------------------------------------ runtimes

    fun refreshRuntimes() {
        _runtimes.value = JavaRuntime.list(store.paths)
    }

    fun importRuntime(uri: Uri, displayName: String) {
        val taskId = "runtime-${UUID.randomUUID()}"
        run(taskId, "Çalışma zamanı içe aktarılamadı") {
            report(taskId, "$displayName açılıyor", null)
            val runtime = JavaRuntime.import(getApplication(), store.paths, uri, displayName) { detail ->
                report(taskId, detail, null)
            }
            refreshRuntimes()
            // The first imported runtime becomes the default automatically.
            if (store.settings.runtimeName == null) {
                store.updateSettings { it.copy(runtimeName = runtime.name) }
            }
            report(taskId, "${runtime.name} hazır (Java ${runtime.majorVersion})", 1f, null, TaskState.Status.DONE)
        }
    }

    fun removeRuntime(name: String) {
        JavaRuntime.remove(store.paths, name)
        if (store.settings.runtimeName == name) {
            store.updateSettings { it.copy(runtimeName = null) }
        }
        refreshRuntimes()
    }

    // ---------------------------------------------------------------------- game

    private fun appendLog(profileId: String, text: String) {
        val current = _logs.value[profileId].orEmpty()
        // Keep the tail bounded; crash reports live at the end anyway.
        val next = (current + LogLine(text)).takeLast(3000)
        _logs.value = _logs.value + (profileId to next)
    }

    fun clearLogs(profileId: String) {
        _logs.value = _logs.value + (profileId to emptyList())
    }

    fun launch(profileId: String) {
        if (_gameStatus.value[profileId] == GameStatus.RUNNING) return

        val taskId = "launch-$profileId"
        val profile = store.profile(profileId) ?: return
        val account = store.activeAccount ?: run {
            notify("Oyunu başlatmak için Microsoft hesabınızla oturum açın.", isError = true)
            return
        }

        _gameStatus.value = _gameStatus.value + (profileId to GameStatus.PREPARING)
        clearLogs(profileId)
        val startedAt = System.currentTimeMillis()

        jobs[profileId] = viewModelScope.launch(Dispatchers.IO) {
            try {
                val valid = MicrosoftAuth.ensureValid(account, store.settings.msClientId)
                if (valid !== account) store.upsertAccount(valid)

                val plan = launcher.prepare(profile, valid, store.settings) { label, progress, detail ->
                    report(taskId, label, progress, detail)
                }

                report(taskId, "Oyun başlatıldı", 1f, null, TaskState.Status.DONE)
                store.updateProfile(profileId) { it.copy(lastPlayed = System.currentTimeMillis()) }
                _gameStatus.value = _gameStatus.value + (profileId to GameStatus.RUNNING)

                // The JVM is a child of this process, so without a foreground
                // service Android kills the game as soon as the launcher is
                // backgrounded — which is exactly when the player is in-game.
                GameService.start(getApplication(), profile.name)

                launcher.run(
                    plan,
                    onLine = { line -> appendLog(profileId, line) },
                    onStarted = { process -> processes[profileId] = process }
                )
            } catch (error: Exception) {
                appendLog(profileId, "[opbay] Hata: ${error.message}")
                report(
                    taskId,
                    "Başlatma başarısız",
                    0f,
                    null,
                    TaskState.Status.ERROR,
                    error.message ?: error.toString()
                )
            } finally {
                processes.remove(profileId)
                jobs.remove(profileId)
                _gameStatus.value = _gameStatus.value + (profileId to GameStatus.IDLE)
                store.updateProfile(profileId) {
                    it.copy(totalPlaytimeMs = it.totalPlaytimeMs + (System.currentTimeMillis() - startedAt))
                }
                // Only the last running profile releases the service.
                if (processes.isEmpty()) GameService.stop(getApplication())
            }
        }
    }

    fun stopGame(profileId: String) {
        processes[profileId]?.destroy()
        jobs[profileId]?.cancel()
        processes.remove(profileId)
        jobs.remove(profileId)
        _gameStatus.value = _gameStatus.value + (profileId to GameStatus.IDLE)
        if (processes.isEmpty()) GameService.stop(getApplication())
    }

    override fun onCleared() {
        processes.values.forEach { it.destroy() }
        super.onCleared()
    }
}
