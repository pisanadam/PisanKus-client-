package com.opbay.client.game

/**
 * The device's CPU, expressed as the names build publishers actually use in
 * file names. Both the Java runtime and the renderer are per-architecture
 * native builds, so they resolve against the same list.
 */
object DeviceAbi {

    /** Tokens for this device, most specific first. */
    val tokens: List<String>
        get() = when {
            android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" } -> listOf("arm64-v8a", "aarch64", "arm64")
            android.os.Build.SUPPORTED_ABIS.any { it == "x86_64" } -> listOf("x86_64", "x64", "amd64")
            android.os.Build.SUPPORTED_ABIS.any { it.startsWith("armeabi") } ->
                listOf("armeabi-v7a", "arm32", "armhf", "arm")
            else -> listOf("x86", "i386")
        }

    /** Archive extensions the installers can unpack. */
    val ARCHIVES = listOf(".tar.xz", ".txz", ".tar.gz", ".tgz", ".zip")

    /**
     * True when [name] carries [token] as a whole word. Matching on substrings
     * would let "arm" select an "arm64" build.
     */
    fun mentions(name: String, token: String): Boolean =
        Regex("(^|[-_.])${Regex.escape(token)}([-_.]|$)").containsMatchIn(name.lowercase())

    /** Picks the candidate matching the most specific architecture available. */
    fun <T> pickForDevice(candidates: List<T>, tokens: List<String>, nameOf: (T) -> String): T? {
        for (token in tokens) {
            candidates.firstOrNull { mentions(nameOf(it), token) }?.let { return it }
        }
        return null
    }
}
