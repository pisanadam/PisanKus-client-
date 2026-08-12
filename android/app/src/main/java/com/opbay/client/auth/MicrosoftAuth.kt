package com.opbay.client.auth

import android.util.Base64
import com.opbay.client.data.Account
import com.opbay.client.data.AuthMode
import com.opbay.client.net.HttpException
import com.opbay.client.net.fetchJson
import com.opbay.client.net.postForm
import com.opbay.client.net.postJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * The Microsoft sign-in chain: MSA authorization code (PKCE) → Xbox Live →
 * XSTS → Minecraft services, with an entitlement check at the end.
 */
object MicrosoftAuth {

    /**
     * Microsoft runs two separate identity platforms and a client id is
     * registered with exactly one of them.
     *
     * `LEGACY` is the platform Minecraft's own launcher client id lives on: no
     * PKCE, and the ticket is handed to Xbox Live as-is. `AZURE` is the modern
     * v2.0 platform, which needs an app registered in Azure AD and prefixes the
     * ticket with `d=`.
     *
     * Sending a client id to the wrong platform fails with a flat HTTP 400
     * (`unauthorized_client` / AADSTS700016), which is why the platform is an
     * explicit setting rather than something guessed at runtime.
     */
    data class Endpoints(
        val authorize: String,
        val token: String,
        val redirect: String,
        val scope: String,
        val usePkce: Boolean,
        val rpsPrefix: String
    )

    fun endpoints(mode: AuthMode): Endpoints = when (mode) {
        AuthMode.LEGACY -> Endpoints(
            authorize = "https://login.live.com/oauth20_authorize.srf",
            token = "https://login.live.com/oauth20_token.srf",
            redirect = "https://login.live.com/oauth20_desktop.srf",
            scope = "service::user.auth.xboxlive.com::MBI_SSL",
            usePkce = false,
            rpsPrefix = ""
        )

        AuthMode.AZURE -> Endpoints(
            authorize = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
            token = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
            redirect = "https://login.microsoftonline.com/common/oauth2/nativeclient",
            scope = "XboxLive.signin offline_access",
            usePkce = true,
            rpsPrefix = "d="
        )
    }

    private const val XBL = "https://user.auth.xboxlive.com/user/authenticate"
    private const val XSTS = "https://xsts.auth.xboxlive.com/xsts/authorize"
    private const val MC_LOGIN = "https://api.minecraftservices.com/authentication/login_with_xbox"
    private const val MC_PROFILE = "https://api.minecraftservices.com/minecraft/profile"
    private const val MC_ENTITLEMENTS = "https://api.minecraftservices.com/entitlements/mcstore"

    /** Message is shown to the player verbatim, so it must stay readable. */
    class AuthException(message: String, val code: String = "auth_failed") : Exception(message)

    /** One sign-in attempt's PKCE material; the verifier must survive the web flow. */
    class PkceChallenge {
        val verifier: String = randomUrlSafe(64)
        val state: String = randomUrlSafe(16)
        val challenge: String = MessageDigest.getInstance("SHA-256")
            .digest(verifier.toByteArray())
            .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP) }

        private fun randomUrlSafe(bytes: Int): String {
            val buffer = ByteArray(bytes)
            SecureRandom().nextBytes(buffer)
            return Base64.encodeToString(buffer, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        }
    }

    fun authorizeUrl(clientId: String, mode: AuthMode, pkce: PkceChallenge): String {
        val endpoints = endpoints(mode)
        return buildString {
            append("${endpoints.authorize}?")
            append("client_id=$clientId")
            append("&response_type=code")
            append("&redirect_uri=${java.net.URLEncoder.encode(endpoints.redirect, "UTF-8")}")
            append("&scope=${java.net.URLEncoder.encode(endpoints.scope, "UTF-8")}")
            append("&state=${pkce.state}")
            if (endpoints.usePkce) {
                append("&code_challenge=${pkce.challenge}")
                append("&code_challenge_method=S256")
                append("&prompt=select_account")
            }
        }
    }

    @Serializable
    private data class MsToken(
        @SerialName("access_token") val accessToken: String,
        @SerialName("refresh_token") val refreshToken: String = "",
        @SerialName("expires_in") val expiresIn: Long = 3600
    )

    @Serializable
    private data class XboxResponse(
        @SerialName("Token") val token: String,
        @SerialName("DisplayClaims") val displayClaims: DisplayClaims
    ) {
        @Serializable data class DisplayClaims(val xui: List<Xui>)
        @Serializable data class Xui(val uhs: String)
    }

    @Serializable
    private data class McLogin(
        @SerialName("access_token") val accessToken: String,
        @SerialName("expires_in") val expiresIn: Long = 86400
    )

    @Serializable
    private data class Entitlements(val items: List<Item> = emptyList()) {
        @Serializable data class Item(val name: String = "")
    }

    @Serializable
    data class McProfile(
        val id: String,
        val name: String,
        val skins: List<Skin> = emptyList()
    ) {
        @Serializable data class Skin(val id: String = "", val state: String = "", val url: String = "", val variant: String = "CLASSIC")
    }

    /**
     * Turns Microsoft's own error payload into the message the player sees; a
     * bare status code says nothing they can act on.
     */
    private fun translate(error: HttpException): AuthException {
        var code = "ms_token_failed"
        var detail = error.bodyText.take(300)
        runCatching {
            val parsed = com.opbay.client.net.json.decodeFromString<TokenError>(error.bodyText)
            parsed.error?.let { code = it }
            parsed.errorDescription?.let { detail = it }
        }

        if (code == "unauthorized_client" || detail.contains("AADSTS700016")) {
            return AuthException(
                "Bu istemci kimliği Azure platformunda kayıtlı değil. Ayarlar → Hesap bölümünden " +
                    "oturum açma yöntemini “Minecraft (varsayılan)” yapın ya da geçerli bir Azure " +
                    "uygulama kimliği girin.",
                code
            )
        }
        return AuthException(detail.substringBefore("Trace ID").trim(), code)
    }

    @Serializable
    private data class TokenError(
        val error: String? = null,
        @SerialName("error_description") val errorDescription: String? = null
    )

    /** Exchanges the authorization code the WebView captured for an account. */
    suspend fun signIn(clientId: String, mode: AuthMode, code: String, pkce: PkceChallenge): Account {
        val endpoints = endpoints(mode)
        val body = buildMap {
            put("client_id", clientId)
            put("grant_type", "authorization_code")
            put("code", code)
            put("redirect_uri", endpoints.redirect)
            if (endpoints.usePkce) {
                put("code_verifier", pkce.verifier)
                put("scope", endpoints.scope)
            }
        }

        val token: MsToken = try {
            postForm(endpoints.token, body)
        } catch (error: HttpException) {
            throw translate(error)
        }
        return completeLogin(token, mode)
    }

    suspend fun refresh(account: Account, clientId: String): Account {
        // Accounts remember how they signed in, so changing the setting cannot
        // break sessions that already exist.
        val mode = account.authMode
        val endpoints = endpoints(mode)

        val body = buildMap {
            put("client_id", clientId)
            put("grant_type", "refresh_token")
            put("refresh_token", account.refreshToken)
            put("redirect_uri", endpoints.redirect)
            if (endpoints.usePkce) put("scope", endpoints.scope)
        }

        val token: MsToken = try {
            postForm(endpoints.token, body)
        } catch (error: HttpException) {
            throw AuthException(
                "Oturum yenilenemedi, tekrar giriş yapmanız gerekiyor.",
                "refresh_expired"
            )
        }
        return completeLogin(token, mode).copy(addedAt = account.addedAt)
    }

    /** Refreshes only when the token is expired or within five minutes of expiring. */
    suspend fun ensureValid(account: Account, clientId: String): Account =
        if (account.expiresAt - System.currentTimeMillis() > 5 * 60_000) account
        else refresh(account, clientId)

    private suspend fun completeLogin(token: MsToken, mode: AuthMode): Account {
        // The legacy platform's ticket is passed through unchanged; only Azure
        // tokens carry the `d=` prefix.
        val ticket = "${endpoints(mode).rpsPrefix}${token.accessToken}"
        val xbl: XboxResponse = postJson(
            XBL,
            """{"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":"$ticket"},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"}"""
        )
        val userHash = xbl.displayClaims.xui.firstOrNull()?.uhs
            ?: throw AuthException("Xbox Live kullanıcı kimliği alınamadı.")

        val xsts = requestXsts(xbl.token)

        val mcLogin: McLogin = postJson(
            MC_LOGIN,
            """{"identityToken":"XBL3.0 x=$userHash;$xsts"}"""
        )

        val entitlements: Entitlements = fetchJson(
            MC_ENTITLEMENTS,
            mapOf("Authorization" to "Bearer ${mcLogin.accessToken}")
        )
        val licensed = entitlements.items.any { it.name == "product_minecraft" || it.name == "game_minecraft" }
        if (!licensed) {
            throw AuthException(
                "Bu hesapta Minecraft: Java Edition lisansı bulunamadı. Oyunu satın aldığınız hesapla giriş yapın.",
                "no_entitlement"
            )
        }

        val profile: McProfile = try {
            fetchJson(MC_PROFILE, mapOf("Authorization" to "Bearer ${mcLogin.accessToken}"))
        } catch (error: HttpException) {
            throw AuthException("Minecraft profili bulunamadı. Hesapta bir oyuncu adı oluşturulmuş olmalı.")
        }

        return Account(
            id = profile.id,
            name = profile.name,
            accessToken = mcLogin.accessToken,
            expiresAt = System.currentTimeMillis() + mcLogin.expiresIn * 1000,
            refreshToken = token.refreshToken,
            authMode = mode,
            skinUrl = profile.skins.firstOrNull { it.state == "ACTIVE" }?.url
        )
    }

    /** XSTS reports account problems through documented XErr codes. */
    private suspend fun requestXsts(xblToken: String): String = try {
        postJson<XboxResponse>(
            XSTS,
            """{"Properties":{"SandboxId":"RETAIL","UserTokens":["$xblToken"]},"RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"}"""
        ).token
    } catch (error: HttpException) {
        if (error.code == 401) {
            val xErr = runCatching {
                com.opbay.client.net.json.decodeFromString<XstsError>(error.bodyText).xErr
            }.getOrNull()

            val message = when (xErr) {
                2148916233L -> "Bu Microsoft hesabına bağlı bir Xbox profili yok. Önce xbox.com üzerinden profil oluşturun."
                2148916235L -> "Xbox Live bu ülkede kullanılamıyor."
                2148916236L, 2148916237L -> "Hesap için yetişkin doğrulaması gerekiyor."
                2148916238L -> "Çocuk hesabı bir aile grubuna eklenmeden oturum açamaz."
                else -> "Xbox Live doğrulaması reddedildi."
            }
            throw AuthException(message, "xsts_${xErr ?: "unknown"}")
        }
        throw AuthException("Xbox Live doğrulaması başarısız (${error.code}).")
    }

    @Serializable
    private data class XstsError(@SerialName("XErr") val xErr: Long = 0)
}
