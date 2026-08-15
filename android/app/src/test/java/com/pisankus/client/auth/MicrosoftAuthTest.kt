package com.pisankus.client.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MicrosoftAuthTest {

  /**
   * The desktop launcher shipped without this and every signed-in action broke
   * an hour later, once the first access token expired. The test exists so the
   * Android build cannot repeat it.
   */
  @Test
  fun `refresh always carries a scope`() {
    for (mode in AuthMode.entries) {
      val body = refreshBody(DEFAULT_CLIENT_ID, "refresh-token", mode)
      assertEquals(endpointsFor(mode).scope, body["scope"])
      assertEquals("refresh_token", body["grant_type"])
      assertEquals("refresh-token", body["refresh_token"])
    }
  }

  @Test
  fun `authorization code exchange carries a scope`() {
    for (mode in AuthMode.entries) {
      val body = authorizationCodeBody(DEFAULT_CLIENT_ID, "the-code", mode)
      assertEquals(endpointsFor(mode).scope, body["scope"])
      assertEquals("authorization_code", body["grant_type"])
    }
  }

  @Test
  fun `pkce verifier is only sent when supplied`() {
    val without = authorizationCodeBody(DEFAULT_CLIENT_ID, "c", AuthMode.LEGACY)
    assertNull(without["code_verifier"])

    val with = authorizationCodeBody(DEFAULT_CLIENT_ID, "c", AuthMode.AZURE, codeVerifier = "v")
    assertEquals("v", with["code_verifier"])
  }

  /**
   * `URLEncoder` would render the space in "XboxLive.signin offline_access" as
   * `+`, which the authorize endpoint reads as part of the scope name.
   */
  @Test
  fun `spaces are percent encoded, never plus`() {
    assertEquals("XboxLive.signin%20offline_access", urlEncode("XboxLive.signin offline_access"))
    assertTrue(authorizeUrl(DEFAULT_CLIENT_ID, AuthMode.AZURE).contains("%20"))
    assertTrue(!authorizeUrl(DEFAULT_CLIENT_ID, AuthMode.AZURE).contains("+"))
  }

  @Test
  fun `legacy scope survives its colons`() {
    assertEquals(
      "service%3A%3Auser.auth.xboxlive.com%3A%3AMBI_SSL",
      urlEncode("service::user.auth.xboxlive.com::MBI_SSL")
    )
  }

  @Test
  fun `the two platforms never share endpoints`() {
    val legacy = endpointsFor(AuthMode.LEGACY)
    val azure = endpointsFor(AuthMode.AZURE)
    assertTrue(legacy.token != azure.token)
    assertTrue(legacy.scope != azure.scope)
    assertTrue(legacy.redirect != azure.redirect)
    assertTrue(!legacy.usePkce && azure.usePkce)
  }

  @Test
  fun `the code is read only from the real redirect`() {
    val redirect = endpointsFor(AuthMode.LEGACY).redirect
    assertEquals("abc123", authorizationCodeFrom("$redirect?code=abc123&state=x", AuthMode.LEGACY))
    // An intermediate navigation must not be mistaken for the final one.
    assertNull(authorizationCodeFrom("https://login.live.com/ppsecure/post.srf?code=nope", AuthMode.LEGACY))
    // Reaching the redirect without a code is a cancel, not a success.
    assertNull(authorizationCodeFrom("$redirect?error=access_denied", AuthMode.LEGACY))
  }

  @Test
  fun `an encoded code comes back decoded`() {
    val redirect = endpointsFor(AuthMode.LEGACY).redirect
    assertEquals("a b/c", authorizationCodeFrom("$redirect?code=a%20b%2Fc", AuthMode.LEGACY))
  }

  @Test
  fun `form encoding round trips a full refresh body`() {
    val encoded = formEncode(refreshBody(DEFAULT_CLIENT_ID, "tok+en", AuthMode.LEGACY))
    assertTrue(encoded.contains("client_id=00000000402b5328"))
    assertTrue(encoded.contains("refresh_token=tok%2Ben"))
    assertTrue(encoded.contains("scope=service%3A%3A"))
  }
}
