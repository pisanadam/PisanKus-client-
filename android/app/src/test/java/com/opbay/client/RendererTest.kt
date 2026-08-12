package com.opbay.client

import com.opbay.client.game.RendererKind
import com.opbay.client.game.RendererProvisioner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Which rendering path a version takes decides whether Android needs a
 * translation component at all. Getting it wrong either drags in a translator
 * that is not needed, or omits one that is.
 *
 * The library lists below are the real ones from Mojang's version files.
 */
class RendererTest {

    /** Abridged from the 26.2 release, the first version to ship Vulkan. */
    private val libraries262 = listOf(
        "org.lwjgl:lwjgl:3.4.1",
        "org.lwjgl:lwjgl-freetype:3.4.1",
        "org.lwjgl:lwjgl-glfw:3.4.1",
        "org.lwjgl:lwjgl-jemalloc:3.4.1",
        "org.lwjgl:lwjgl-openal:3.4.1",
        "org.lwjgl:lwjgl-opengl:3.4.1",
        "org.lwjgl:lwjgl-vulkan:3.4.1",
        "org.lwjgl:lwjgl-vulkan:3.4.1:natives-macos"
    )

    /** Abridged from 1.21.4, which predates the Vulkan backend. */
    private val libraries1214 = listOf(
        "org.lwjgl:lwjgl:3.3.3",
        "org.lwjgl:lwjgl-glfw:3.3.3",
        "org.lwjgl:lwjgl-openal:3.3.3",
        "org.lwjgl:lwjgl-opengl:3.3.3",
        "org.lwjgl:lwjgl-stb:3.3.3"
    )

    @Test
    fun `26_2 takes the native Vulkan path`() {
        assertEquals(RendererKind.VULKAN, RendererProvisioner.kindFor(libraries262))
    }

    @Test
    fun `1_21_4 needs the OpenGL translator`() {
        assertEquals(RendererKind.GL_TRANSLATED, RendererProvisioner.kindFor(libraries1214))
    }

    @Test
    fun `opengl alone never counts as vulkan support`() {
        // Vulkan versions still list lwjgl-opengl, so the decision must key off
        // the vulkan artifact rather than the absence of the opengl one.
        assertEquals(
            RendererKind.GL_TRANSLATED,
            RendererProvisioner.kindFor(listOf("org.lwjgl:lwjgl-opengl:3.4.1"))
        )
    }

    @Test
    fun `a mod named vulkanmod does not fake native support`() {
        // Third-party libraries can carry "vulkan" in the artifact name; only
        // Mojang's own lwjgl-vulkan means the game has a Vulkan backend.
        val withMod = libraries1214 + "net.vulkanmod:vulkanmod:0.5.5"
        assertEquals(RendererKind.GL_TRANSLATED, RendererProvisioner.kindFor(withMod))
    }

    // ------------------------------------------------------------- asset match

    private fun asset(name: String) =
        RendererProvisioner.Release.Asset(name = name, url = "https://example.invalid/$name", size = 1)

    private val arm64 = listOf("arm64-v8a", "aarch64", "arm64")

    @Test
    fun `picks the build for this device`() {
        val assets = listOf(
            asset("gl4es-arm64-v8a.zip"),
            asset("gl4es-armeabi-v7a.zip"),
            asset("gl4es-x86_64.zip")
        )
        assertEquals("gl4es-arm64-v8a.zip", RendererProvisioner.matchAsset(assets, arm64)?.name)
    }

    @Test
    fun `skips debug symbol bundles`() {
        val assets = listOf(asset("gl4es-arm64-v8a-symbols.zip"), asset("gl4es-arm64-v8a.zip"))
        assertEquals("gl4es-arm64-v8a.zip", RendererProvisioner.matchAsset(assets, arm64)?.name)
    }

    @Test
    fun `armeabi build is not handed to an arm64 device by substring luck`() {
        // "arm" appears inside "armeabi-v7a"; a substring match would install
        // a 32-bit library on a 64-bit device.
        val assets = listOf(asset("gl4es-armeabi-v7a.zip"), asset("gl4es-x86.zip"))
        assertNull(RendererProvisioner.matchAsset(assets, arm64))
    }

    @Test
    fun `takes a lone architecture-agnostic archive`() {
        assertEquals("gl4es.zip", RendererProvisioner.matchAsset(listOf(asset("gl4es.zip")), arm64)?.name)
    }
}
