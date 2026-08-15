package com.pisankus.client.auth

/**
 * The Microsoft sign-in chain, shared with the desktop launcher.
 *
 * This file deliberately holds no Android types. The desktop build learned two
 * things the hard way, and both live here so a second platform cannot rediscover
 * them: which identity platform a client id belongs to, and that `scope` is
 * mandatory on refresh. Keeping it pure also means it is covered by unit tests
 * that run on any machine, without a device or an emulator.
 */

/**
 * Which Microsoft identity platform a client id is registered with.
 *
 * A client id only works against one of them and there is no way to tell which
 * from the id itself, so the choice is carried explicitly rather than guessed.
 */
enum class AuthMode { LEGACY, AZURE }

data class Endpoints(
  val authorize: String,
  val token: String,
  val redirect: String,
  val scope: String,
  val usePkce: Boolean
)

/** Minecraft's own launcher client id, which lives on the legacy MSA platform. */
const val DEFAULT_CLIENT_ID = "00000000402b5328"

fun endpointsFor(mode: AuthMode): Endpoints = when (mode) {
  AuthMode.LEGACY -> Endpoints(
    authorize = "https://login.live.com/oauth20_authorize.srf",
    token = "https://login.live.com/oauth20_token.srf",
    redirect = "https://login.live.com/oauth20_desktop.srf",
    scope = "service::user.auth.xboxlive.com::MBI_SSL",
    usePkce = false
  )
  AuthMode.AZURE -> Endpoints(
    authorize = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    token = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    redirect = "https://login.microsoftonline.com/common/oauth2/nativeclient",
    scope = "XboxLive.signin offline_access",
    usePkce = true
  )
}

object XboxEndpoints {
  const val XBL_AUTH = "https://user.auth.xboxlive.com/user/authenticate"
  const val XSTS_AUTH = "https://xsts.auth.xboxlive.com/xsts/authorize"
  const val MC_LOGIN = "https://api.minecraftservices.com/authentication/login_with_xbox"
  const val MC_PROFILE = "https://api.minecraftservices.com/minecraft/profile"
  const val MC_ENTITLEMENTS = "https://api.minecraftservices.com/entitlements/mcstore"
}

/**
 * Form body for exchanging an authorization code for tokens.
 *
 * `scope` is included here for the same reason it is included in [refreshBody]:
 * both platforms require it, and leaving it out fails in a way that is hard to
 * trace back.
 */
fun authorizationCodeBody(
  clientId: String,
  code: String,
  mode: AuthMode,
  codeVerifier: String? = null
): Map<String, String> {
  val endpoints = endpointsFor(mode)
  return buildMap {
    put("client_id", clientId)
    put("grant_type", "authorization_code")
    put("code", code)
    put("redirect_uri", endpoints.redirect)
    put("scope", endpoints.scope)
    if (codeVerifier != null) put("code_verifier", codeVerifier)
  }
}

/**
 * Form body for renewing an expired session.
 *
 * `scope` is required on both platforms. Its absence is only reachable once the
 * first access token has expired, so a build that omits it looks perfectly
 * healthy for an hour and then breaks every signed-in action at once with
 * "must include a 'scope' input parameter" — which is exactly what happened on
 * desktop. It must never be dropped as "optional on refresh".
 */
fun refreshBody(clientId: String, refreshToken: String, mode: AuthMode): Map<String, String> {
  val endpoints = endpointsFor(mode)
  return mapOf(
    "client_id" to clientId,
    "grant_type" to "refresh_token",
    "refresh_token" to refreshToken,
    "redirect_uri" to endpoints.redirect,
    "scope" to endpoints.scope
  )
}

/** Authorization url the sign-in web view is pointed at. */
fun authorizeUrl(clientId: String, mode: AuthMode, codeChallenge: String? = null): String {
  val endpoints = endpointsFor(mode)
  val params = buildMap {
    put("client_id", clientId)
    put("response_type", "code")
    put("redirect_uri", endpoints.redirect)
    put("scope", endpoints.scope)
    if (codeChallenge != null) {
      put("code_challenge", codeChallenge)
      put("code_challenge_method", "S256")
    }
  }
  return endpoints.authorize + "?" + params.entries.joinToString("&") {
    "${urlEncode(it.key)}=${urlEncode(it.value)}"
  }
}

/**
 * Percent-encoding for form and query values.
 *
 * `URLEncoder` renders a space as `+`, which the authorize endpoint reads
 * literally inside a scope, turning "XboxLive.signin offline_access" into an
 * unknown scope. Encoding by hand keeps one behaviour on both JVM and Android.
 */
fun urlEncode(value: String): String {
  val safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~"
  val out = StringBuilder()
  for (byte in value.toByteArray(Charsets.UTF_8)) {
    val char = byte.toInt().toChar()
    if (char in safe) out.append(char)
    else out.append('%').append("%02X".format(byte.toInt() and 0xFF))
  }
  return out.toString()
}

fun formEncode(body: Map<String, String>): String =
  body.entries.joinToString("&") { "${urlEncode(it.key)}=${urlEncode(it.value)}" }

/**
 * Whether a redirect the web view reached carries the authorization code.
 *
 * The web view sees many navigations before the final one; only the redirect
 * target matters, and it must be matched by prefix because the code and state
 * are appended as query parameters.
 */
fun authorizationCodeFrom(url: String, mode: AuthMode): String? {
  val redirect = endpointsFor(mode).redirect
  if (!url.startsWith(redirect)) return null
  val query = url.substringAfter('?', "").substringBefore('#')
  return query.split('&')
    .map { it.split('=', limit = 2) }
    .firstOrNull { it.size == 2 && it[0] == "code" }
    ?.get(1)
    ?.let { decodeComponent(it) }
}

private fun decodeComponent(value: String): String {
  val out = StringBuilder()
  var index = 0
  while (index < value.length) {
    val char = value[index]
    when {
      char == '%' && index + 2 < value.length -> {
        out.append(value.substring(index + 1, index + 3).toInt(16).toChar())
        index += 3
      }
      char == '+' -> { out.append(' '); index++ }
      else -> { out.append(char); index++ }
    }
  }
  return out.toString()
}
