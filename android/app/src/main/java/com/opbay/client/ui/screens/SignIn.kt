package com.opbay.client.ui.screens

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.opbay.client.ui.LauncherViewModel

/**
 * Mandatory Microsoft sign-in. The authorization page runs in an in-app WebView
 * and the redirect carrying the code is intercepted; PKCE keeps the exchange
 * safe for a public client that ships no secret.
 */
@Composable
fun SignInScreen(viewModel: LauncherViewModel, onDone: (() -> Unit)? = null) {
    val signingIn by viewModel.signingIn.collectAsState()
    val error by viewModel.authError.collectAsState()
    val db by viewModel.db.collectAsState()

    // When adding an account from the switcher, leave as soon as one lands.
    val accountCount = db.accounts.size
    LaunchedEffect(accountCount) {
        if (onDone != null && accountCount > 0 && !signingIn) onDone()
    }

    var session by remember { mutableStateOf<LauncherViewModel.SignInSession?>(null) }

    val current = session
    if (current != null && !signingIn) {
        AuthWebView(
            url = current.url,
            redirectUri = current.redirect,
            onCode = { code ->
                session = null
                viewModel.completeSignIn(current, code)
            },
            onError = { message ->
                session = null
                viewModel.cancelSignIn(message)
            },
            onCancel = {
                session = null
                viewModel.cancelSignIn(null)
            }
        )
        return
    }

    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
            ) {
                Column(
                    modifier = Modifier.padding(28.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        Modifier
                            .size(64.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .let { it },
                        contentAlignment = Alignment.Center
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(18.dp),
                            modifier = Modifier.size(64.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    "OP",
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            }
                        }
                    }

                    Text("Opbay Client", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Devam etmek için Minecraft: Java Edition sahibi olduğunuz Microsoft hesabıyla " +
                            "oturum açın.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )

                    error?.let { message ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer
                            )
                        ) {
                            Text(
                                message,
                                Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    if (signingIn) {
                        CircularProgressIndicator()
                        Text(
                            "Oturum doğrulanıyor…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        Button(
                            onClick = { session = viewModel.beginSignIn() },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Microsoft ile oturum aç")
                        }
                    }

                    Text(
                        "Oturum bilgileriniz yalnızca bu cihazda saklanır.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )

                    if (onDone != null) {
                        TextButton(onClick = onDone) { Text("Vazgeç") }
                    }
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun AuthWebView(
    url: String,
    redirectUri: String,
    onCode: (String) -> Unit,
    onError: (String) -> Unit,
    onCancel: () -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onCancel, modifier = Modifier.padding(8.dp)) {
            Text("Vazgeç")
        }

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    // A stale session would silently sign the previous account back in.
                    CookieManager.getInstance().removeAllCookies(null)

                    webViewClient = object : WebViewClient() {
                        private var handled = false

                        private fun inspect(candidate: String?): Boolean {
                            if (handled || candidate == null) return false
                            if (!candidate.startsWith(redirectUri)) return false

                            val uri = Uri.parse(candidate)
                            val error = uri.getQueryParameter("error")
                            val code = uri.getQueryParameter("code")

                            handled = true
                            when {
                                error != null ->
                                    onError(uri.getQueryParameter("error_description") ?: error)
                                code != null -> onCode(code)
                                else -> onError("Yetkilendirme kodu alınamadı.")
                            }
                            return true
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean = inspect(request?.url?.toString())

                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            // The redirect page itself never renders, so catch it here too.
                            if (inspect(url)) view?.stopLoading() else super.onPageStarted(view, url, favicon)
                        }
                    }

                    loadUrl(url)
                }
            }
        )
    }
}
