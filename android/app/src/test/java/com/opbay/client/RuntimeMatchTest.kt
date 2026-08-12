package com.opbay.client

import com.opbay.client.game.RuntimeProvisioner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The provisioner picks a Java runtime by reading a release listing and matching
 * asset names, because no Android JRE publisher exposes a versioned API. That
 * matching is the part most likely to be wrong, and a wrong match means either a
 * failed download or — worse — silently installing the wrong Java version.
 */
class RuntimeMatchTest {

    private fun asset(name: String) =
        RuntimeProvisioner.Release.Asset(name = name, url = "https://example.invalid/$name", size = 1)

    private val arm64 = listOf("aarch64", "arm64")
    private val x64 = listOf("x86_64", "x64", "amd64")

    @Test
    fun `picks the archive for the requested version and architecture`() {
        val assets = listOf(
            asset("jre8-aarch64.tar.xz"),
            asset("jre17-aarch64.tar.xz"),
            asset("jre17-x86_64.tar.xz"),
            asset("jre21-aarch64.tar.xz")
        )
        assertEquals("jre17-aarch64.tar.xz", RuntimeProvisioner.matchAsset(assets, 17, arm64)?.name)
        assertEquals("jre17-x86_64.tar.xz", RuntimeProvisioner.matchAsset(assets, 17, x64)?.name)
        assertEquals("jre21-aarch64.tar.xz", RuntimeProvisioner.matchAsset(assets, 21, arm64)?.name)
    }

    @Test
    fun `accepts the naming variants publishers actually use`() {
        val variants = listOf(
            "jre17-aarch64.tar.xz",
            "jdk-17-aarch64.tar.gz",
            "java_17_aarch64.zip",
            "OpenJDK17-jre_aarch64_linux.tar.xz"
        )
        for (name in variants) {
            assertEquals(
                "eşleşmeliydi: $name",
                name,
                RuntimeProvisioner.matchAsset(listOf(asset(name)), 17, arm64)?.name
            )
        }
    }

    @Test
    fun `does not match a different java version`() {
        val assets = listOf(asset("jre8-aarch64.tar.xz"), asset("jre21-aarch64.tar.xz"))
        assertNull(RuntimeProvisioner.matchAsset(assets, 17, arm64))
    }

    @Test
    fun `digits inside a build number are not read as the java version`() {
        // "1.17" here is the pack version, not a Java version; matching it would
        // install a runtime the game cannot use.
        val assets = listOf(asset("runtime-build-1.17.9-aarch64.tar.xz"), asset("jre8-aarch64.tar.xz"))
        assertNull(RuntimeProvisioner.matchAsset(assets, 17, arm64))
    }

    @Test
    fun `a longer version number is not truncated to the requested one`() {
        // jre170 must not satisfy a request for Java 17.
        assertNull(RuntimeProvisioner.matchAsset(listOf(asset("jre170-aarch64.tar.xz")), 17, arm64))
    }

    @Test
    fun `ignores archives the importer cannot unpack`() {
        val assets = listOf(asset("jre17-aarch64.7z"), asset("jre17-aarch64.deb"))
        assertNull(RuntimeProvisioner.matchAsset(assets, 17, arm64))
    }

    @Test
    fun `falls back to a lone archive that omits the architecture`() {
        val assets = listOf(asset("jre17.tar.xz"))
        assertEquals("jre17.tar.xz", RuntimeProvisioner.matchAsset(assets, 17, arm64)?.name)
    }

    @Test
    fun `never guesses when several architectures are offered but none match`() {
        val assets = listOf(asset("jre17-riscv64.tar.xz"), asset("jre17-ppc64.tar.xz"))
        assertNull(RuntimeProvisioner.matchAsset(assets, 17, arm64))
    }

    @Test
    fun `prefers the most specific architecture name`() {
        // Both are valid for a 64-bit ARM device; the first token wins.
        val assets = listOf(asset("jre17-arm64.tar.xz"), asset("jre17-aarch64.tar.xz"))
        assertEquals("jre17-aarch64.tar.xz", RuntimeProvisioner.matchAsset(assets, 17, arm64)?.name)
    }
}
