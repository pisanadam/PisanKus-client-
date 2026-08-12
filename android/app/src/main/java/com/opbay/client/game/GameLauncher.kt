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


    data class LaunchPlan(
        val command: List<String>,
        val environment: Map<String, String>,
        val workingDir: File,
        val runtime: InstalledRuntime,
        val rendererKind: RendererKind,
        val renderer: InstalledRenderer?
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

        // Mojang pins a Java version per game version; install the matching one
        // rather than asking the player to work out which they need.
        val requiredJava = version.javaVersion?.majorVersion ?: 8
        val runtime = JavaRuntime.select(paths, settings.runtimeName, requiredJava)
            ?: RuntimeProvisioner.provision(
                context = context,
                paths = paths,
                source = settings.runtimeSource,
                major = requiredJava,
                onProgress = onProgress
            )

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

        // Versions from 26.2 carry lwjgl-vulkan and drive the device's own Vulkan
        // driver; older ones call desktop OpenGL and need a translator.
        val rendererKind = RendererProvisioner.kindFor(version.libraries.map { it.name })
        val renderer = RendererProvisioner.byName(paths, settings.rendererName)
            ?: RendererProvisioner.list(paths).firstOrNull()

        val nativeLibDir = context.applicationInfo.nativeLibraryDir
        val libraryPath = buildList {
            add(File(runtime.home, "lib").absolutePath)
            add(File(runtime.home, "lib/server").absolutePath)
            add(File(runtime.home, "lib/${Rules.arch}").absolutePath)
            renderer?.directory?.let { add(it.absolutePath) }
            add(nativeLibDir)
        }.joinToString(":")

        val environment = buildMap {
            put("JAVA_HOME", runtime.home.absolutePath)
            put("HOME", gameDir.absolutePath)
            put("TMPDIR", paths.cache.absolutePath)
            put("LD_LIBRARY_PATH", libraryPath)
            put("MESA_GLSL_CACHE_DIR", paths.cache.absolutePath)

            if (rendererKind == RendererKind.GL_TRANSLATED) {
                // gl4es reads these; they are meaningless on the Vulkan path.
                put("LIBGL_ES", "3")
                put("LIBGL_MIPMAP", "3")
                put("LIBGL_NORMALIZE", "1")
                put("LIBGL_GL", "21")
            }
        }

        return LaunchPlan(command, environment, gameDir, runtime, rendererKind, renderer)
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
        onLine("[opbay] Grafik yolu: ${plan.rendererKind.label}")

        when {
            plan.rendererKind == RendererKind.VULKAN && RendererProvisioner.deviceHasVulkan() ->
                onLine("[opbay] Cihazda Vulkan sürücüsü bulundu; çeviri katmanı gerekmiyor.")

            plan.rendererKind == RendererKind.VULKAN ->
                onLine("[opbay] UYARI: Bu sürüm Vulkan istiyor fakat cihazda Vulkan sürücüsü bulunamadı.")

            plan.renderer != null ->
                onLine("[opbay] Çeviri bileşeni: ${plan.renderer.name} (${plan.renderer.libraries.size} kütüphane)")

            else ->
                onLine(
                    "[opbay] UYARI: Bu sürüm masaüstü OpenGL kullanıyor ve kurulu bir çeviri bileşeni yok. " +
                        "Ayarlar → Grafik bölümünden kurabilirsiniz."
                )
        }

        // Stated plainly rather than discovered as a mystery crash: the JVM runs
        // as a child process, and a child process cannot draw into this app's
        // window. Rendering additionally needs LWJGL natives built for Android,
        // which Mojang does not publish.
        onLine(
            "[opbay] NOT: Oyun ayrı bir süreçte başlatılıyor; bu yapıyla pencere açılmaz. " +
                "İndirme, oturum ve mod kurulumu doğrulanabilir, görüntü için Android'e derlenmiş " +
                "LWJGL bileşenleri gerekir."
        )
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
