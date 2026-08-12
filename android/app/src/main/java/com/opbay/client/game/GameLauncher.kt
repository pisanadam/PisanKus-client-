package com.opbay.client.game

import android.content.Context
import com.opbay.client.data.Account
import com.opbay.client.data.Paths
import com.opbay.client.data.Profile
import com.opbay.client.data.Settings
import com.opbay.client.minecraft.Installer
import com.opbay.client.minecraft.Loaders
import com.opbay.client.minecraft.Rules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Builds and starts the game process.
 *
 * The launcher supplies everything Minecraft needs except the two pieces that
 * are native to the device: a Java runtime (see [JavaRuntime]) and an OpenGL
 * translation layer, both of which the player installs. When either is missing
 * the failure is reported with an explanation rather than a stack trace.
 */
class GameLauncher(
    private val context: Context,
    private val paths: Paths
) {

    class MissingRuntimeException : Exception(
        "Oyunu başlatmak için bir Java çalışma zamanı gerekiyor. " +
            "Ayarlar → Java çalışma zamanı bölümünden bir JRE arşivi içe aktarın."
    )

    data class LaunchPlan(
        val command: List<String>,
        val environment: Map<String, String>,
        val workingDir: File,
        val runtime: InstalledRuntime
    )

    /**
     * Resolves the loader, downloads everything, and produces the exact command
     * line the game will run with.
     */
    suspend fun prepare(
        profile: Profile,
        account: Account,
        settings: Settings,
        onProgress: (label: String, progress: Float?, detail: String?) -> Unit
    ): LaunchPlan {
        val gameDir = paths.profileDir(profile).apply { mkdirs() }

        onProgress("Yükleyici hazırlanıyor", null, null)
        val versionId = Loaders.install(
            paths,
            profile.loader,
            profile.gameVersion,
            profile.loaderVersion
        ) { detail -> onProgress("Yükleyici hazırlanıyor", null, detail) }

        val (version, classpath) = Installer.prepare(
            paths = paths,
            versionId = versionId,
            baseVersionId = profile.gameVersion,
            gameDir = gameDir,
            concurrency = settings.concurrentDownloads,
            onProgress = onProgress
        )

        val requiredJava = version.javaVersion?.majorVersion ?: 8
        val runtime = JavaRuntime.select(paths, settings.runtimeName, requiredJava)
            ?: throw MissingRuntimeException()

        val assets = Installer.resolveAssets(version, paths)
        val assetsRoot = Installer.assetsRoot(assets, paths)

        val values = mapOf(
            "auth_player_name" to account.name,
            "auth_uuid" to account.id,
            "auth_access_token" to account.accessToken,
            "auth_xuid" to account.id,
            "auth_session" to "token:${account.accessToken}:${account.id}",
            "user_type" to "msa",
            "user_properties" to "{}",
            "clientid" to settings.msClientId,
            "version_name" to versionId,
            "version_type" to version.type,
            "game_directory" to gameDir.absolutePath,
            "assets_root" to assetsRoot.absolutePath,
            "game_assets" to assetsRoot.absolutePath,
            "assets_index_name" to assets.indexId,
            "natives_directory" to File(paths.versionDir(versionId), "natives").absolutePath,
            "launcher_name" to "OpbayClient",
            "launcher_version" to "1.0.0",
            "classpath" to classpath.joinToString(File.pathSeparator) { it.absolutePath },
            "classpath_separator" to File.pathSeparator,
            "library_directory" to paths.libraries.absolutePath,
            "resolution_width" to "1280",
            "resolution_height" to "720"
        )

        val features = mapOf(
            "is_demo_user" to false,
            "has_custom_resolution" to false,
            "has_quick_plays_support" to false,
            "is_quick_play_singleplayer" to false,
            "is_quick_play_multiplayer" to false,
            "is_quick_play_realms" to false
        )

        val memory = profile.memoryMb.coerceAtLeast(512)
        val extraArgs = (profile.jvmArgs ?: settings.jvmArgs).split(Regex("\\s+")).filter { it.isNotBlank() }

        val jvmArgs = buildList {
            add("-Xmx${memory}M")
            add("-Xms${minOf(256, memory)}M")
            addAll(extraArgs)
            // Headless AWT is unavailable on these runtimes and LWJGL never needs it.
            add("-Djava.awt.headless=false")
            add("-Dorg.lwjgl.util.Debug=false")
            addAll(Rules.flatten(version.arguments?.jvm.orEmpty(), values, features))
        }.toMutableList()

        // Pre-1.13 versions carry no `arguments.jvm` block at all.
        if (version.arguments?.jvm.isNullOrEmpty()) {
            jvmArgs += "-Djava.library.path=${values["natives_directory"]}"
            jvmArgs += "-cp"
            jvmArgs += values.getValue("classpath")
        }

        val gameArgs = version.minecraftArguments
            ?.split(" ")
            ?.filter { it.isNotBlank() }
            ?.map { Rules.substitute(it, values) }
            ?: Rules.flatten(version.arguments?.game.orEmpty(), values, features)

        val command = buildList {
            add(runtime.javaBinary.absolutePath)
            addAll(jvmArgs)
            add(version.mainClass)
            addAll(gameArgs)
        }

        val nativeLibDir = context.applicationInfo.nativeLibraryDir
        val environment = mapOf(
            "JAVA_HOME" to runtime.home.absolutePath,
            "HOME" to gameDir.absolutePath,
            "TMPDIR" to paths.cache.absolutePath,
            // The runtime's own libraries plus anything the renderer ships.
            "LD_LIBRARY_PATH" to listOf(
                File(runtime.home, "lib").absolutePath,
                File(runtime.home, "lib/server").absolutePath,
                File(runtime.home, "lib/${Rules.arch}").absolutePath,
                nativeLibDir
            ).joinToString(":"),
            "LIBGL_ES" to "3",
            "LIBGL_MIPMAP" to "3",
            "LIBGL_NORMALIZE" to "1",
            "MESA_GLSL_CACHE_DIR" to paths.cache.absolutePath
        )

        return LaunchPlan(command, environment, gameDir, runtime)
    }

    /**
     * Starts the process and streams its output line by line. Returns the exit
     * code once the game ends.
     */
    suspend fun run(
        plan: LaunchPlan,
        onLine: (String) -> Unit,
        onStarted: (Process) -> Unit = {}
    ): Int = withContext(Dispatchers.IO) {
        val builder = ProcessBuilder(plan.command)
            .directory(plan.workingDir)
            .redirectErrorStream(true)
        builder.environment().putAll(plan.environment)

        onLine("[opbay] ${plan.runtime.name} (Java ${plan.runtime.majorVersion})")
        onLine("[opbay] ${plan.command.first()} … ${plan.command.size} argüman")

        val process = builder.start()
        onStarted(process)

        process.inputStream.bufferedReader().useLines { lines ->
            lines.forEach(onLine)
        }

        val exit = process.waitFor()
        onLine("[opbay] Oyun sonlandı (çıkış kodu $exit)")
        exit
    }
}
