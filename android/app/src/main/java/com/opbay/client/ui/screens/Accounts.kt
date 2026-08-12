package com.opbay.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.opbay.client.data.Account
import com.opbay.client.ui.LauncherViewModel

/**
 * Account switcher. Tapping a card makes that account active, so swapping
 * between accounts is one tap rather than a trip through settings.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountsScreen(viewModel: LauncherViewModel, onAddAccount: () -> Unit) {
    val db by viewModel.db.collectAsState()
    val signingIn by viewModel.signingIn.collectAsState()
    var pendingRemoval by remember { mutableStateOf<Account?>(null) }

    val activeId = db.activeAccountId ?: db.accounts.firstOrNull()?.id

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Hesaplar") },
                actions = {
                    Text(
                        "${db.accounts.size} hesap",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 16.dp)
                    )
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAddAccount,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(if (signingIn) "Bağlanıyor…" else "Hesap ekle") }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 120.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Text(
                    "Etkin hesap oyunu başlatırken kullanılır. Geçiş yapmak için dokunun.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }

            items(db.accounts, key = { it.id }) { account ->
                val active = account.id == activeId
                AccountCard(
                    account = account,
                    active = active,
                    onSelect = { viewModel.setActiveAccount(account.id) },
                    onRefresh = { viewModel.refreshAccount(account.id) },
                    onRemove = { pendingRemoval = account }
                )
            }
        }
    }

    pendingRemoval?.let { account ->
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            title = { Text("Hesaptan çıkılsın mı?") },
            text = {
                Text(
                    "${account.name} hesabının oturumu bu cihazdan silinecek. " +
                        "Profilleriniz ve dosyalarınız etkilenmez."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeAccount(account.id)
                    pendingRemoval = null
                }) { Text("Çıkış yap") }
            },
            dismissButton = { TextButton(onClick = { pendingRemoval = null }) { Text("Vazgeç") } }
        )
    }
}

@Composable
private fun AccountCard(
    account: Account,
    active: Boolean,
    onSelect: () -> Unit,
    onRefresh: () -> Unit,
    onRemove: () -> Unit
) {
    Card(
        onClick = onSelect,
        colors = CardDefaults.cardColors(
            containerColor = if (active) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Row(
            Modifier.padding(14.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SkinHead(skinUrl = account.skinUrl)

            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                Text(
                    account.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    when {
                        active && account.expired -> "Etkin · oturum yenilenmeli"
                        active -> "Etkin hesap"
                        account.expired -> "Oturum yenilenmeli"
                        else -> "Bağlı"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (account.expired) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (active) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = "Etkin",
                    tint = MaterialTheme.colorScheme.primary
                )
            }

            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = "Oturumu yenile")
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Default.Logout, contentDescription = "Çıkış yap")
            }
        }
    }
}

/**
 * The 8×8 face from the skin texture, scaled up with the hat layer on top.
 * Coil crops it out of the full 64×64 sheet.
 */
@Composable
private fun SkinHead(skinUrl: String?, size: Int = 44) {
    val shape = RoundedCornerShape(10.dp)

    if (skinUrl == null) {
        Box(
            Modifier
                .size(size.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.surfaceContainerHighest)
        )
        return
    }

    Box(
        Modifier
            .size(size.dp)
            .clip(shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
    ) {
        // Mojang serves a render of the head at this endpoint shape; when the raw
        // texture is stored instead, the full sheet still reads as an avatar.
        AsyncImage(
            model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                .data(skinUrl)
                .crossfade(true)
                .build(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(size.dp)
        )
    }
}
