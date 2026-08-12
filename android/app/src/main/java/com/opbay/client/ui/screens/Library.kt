package com.opbay.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.opbay.client.data.LoaderId
import com.opbay.client.data.Profile
import com.opbay.client.data.VersionChannel
import com.opbay.client.minecraft.LoaderVersion
import com.opbay.client.ui.GameStatus
import com.opbay.client.ui.LauncherViewModel

private val ICONS = listOf("🎮", "⛏️", "🌲", "🔥", "🧪", "🏰", "🚀", "🐉", "💎", "🌌", "🍄", "⚙️")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(viewModel: LauncherViewModel, onOpenProfile: (String) -> Unit) {
    val db by viewModel.db.collectAsState()
    val status by viewModel.gameStatus.collectAsState()
    var creating by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kitaplık") },
                actions = {
                    Text(
                        "${db.profiles.size} profil",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 16.dp)
                    )
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { creating = true },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Yeni profil") }
            )
        }
    ) { padding ->
        if (db.profiles.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding).padding(32.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🎮", style = MaterialTheme.typography.displayMedium)
                    Text("Henüz profil yok", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Bir profil oluşturun; sürüm, mod yükleyicisi ve bellek ayarları profile özel tutulur.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(168.dp),
                contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(padding)
            ) {
                items(db.profiles.sortedByDescending { it.lastPlayed ?: it.createdAt }, key = { it.id }) { profile ->
                    ProfileCard(
                        profile = profile,
                        status = status[profile.id] ?: GameStatus.IDLE,
                        onOpen = { onOpenProfile(profile.id) },
                        onPlay = { viewModel.launch(profile.id) },
                        onStop = { viewModel.stopGame(profile.id) }
                    )
                }
            }
        }
    }

    if (creating) {
        CreateProfileDialog(
            viewModel = viewModel,
            onDismiss = { creating = false },
            onCreated = { profile ->
                creating = false
                onOpenProfile(profile.id)
            }
        )
    }
}

@Composable
private fun ProfileCard(
    profile: Profile,
    status: GameStatus,
    onOpen: () -> Unit,
    onPlay: () -> Unit,
    onStop: () -> Unit
) {
    Card(onClick = onOpen) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 10f)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Text(profile.icon, style = MaterialTheme.typography.displaySmall)

            if (status != GameStatus.IDLE) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp)
                ) {
                    Text(
                        if (status == GameStatus.PREPARING) "Hazırlanıyor" else "Çalışıyor",
                        Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }
        }

        Column(Modifier.padding(12.dp)) {
            Text(
                profile.name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "${profile.gameVersion} · ${profile.loader.label}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            if (status == GameStatus.IDLE) {
                FilledTonalButton(onClick = onPlay, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Text("Oyna", Modifier.padding(start = 6.dp))
                }
            } else {
                FilledTonalButton(onClick = onStop, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Icon(Icons.Default.Stop, contentDescription = null)
                    Text("Durdur", Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}

/**
 * Profile creation. Every Mojang channel is selectable, so the 2010-era alpha
 * and beta builds are reachable alongside releases and snapshots.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateProfileDialog(
    viewModel: LauncherViewModel,
    onDismiss: () -> Unit,
    onCreated: (Profile) -> Unit
) {
    val allVersions by viewModel.versions.collectAsState()

    var name by remember { mutableStateOf("") }
    var icon by remember { mutableStateOf(ICONS.first()) }
    var loader by remember { mutableStateOf(LoaderId.FABRIC) }
    var channels by remember { mutableStateOf(setOf(VersionChannel.RELEASE)) }
    var gameVersion by remember { mutableStateOf("") }
    var loaderVersions by remember { mutableStateOf<List<LoaderVersion>>(emptyList()) }
    var loaderVersion by remember { mutableStateOf<String?>(null) }
    var loadingLoaders by remember { mutableStateOf(false) }

    val visibleVersions = remember(allVersions, channels) {
        allVersions.filter { it.channel in channels }
    }

    // Default to the newest version in whichever channels are showing.
    LaunchedEffect(visibleVersions) {
        if (gameVersion.isEmpty() || visibleVersions.none { it.id == gameVersion }) {
            gameVersion = visibleVersions.firstOrNull()?.id.orEmpty()
        }
    }

    LaunchedEffect(loader, gameVersion) {
        loaderVersion = null
        loaderVersions = emptyList()
        if (loader == LoaderId.VANILLA || gameVersion.isEmpty()) return@LaunchedEffect
        loadingLoaders = true
        loaderVersions = viewModel.loaderVersions(loader, gameVersion)
        loaderVersion = (loaderVersions.firstOrNull { it.stable } ?: loaderVersions.firstOrNull())?.version
        loadingLoaders = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Yeni profil") },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank() && gameVersion.isNotEmpty() &&
                    (loader == LoaderId.VANILLA || loaderVersions.isNotEmpty()),
                onClick = {
                    onCreated(
                        viewModel.createProfile(
                            name = name.trim(),
                            gameVersion = gameVersion,
                            loader = loader,
                            loaderVersion = loaderVersion,
                            icon = icon
                        )
                    )
                }
            ) { Text("Oluştur") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
        text = {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.heightIn(max = 460.dp)
            ) {
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Profil adı") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    Column {
                        Label("Simge")
                        ChipRow {
                            ICONS.forEach { candidate ->
                                FilterChip(
                                    selected = icon == candidate,
                                    onClick = { icon = candidate },
                                    label = { Text(candidate) }
                                )
                            }
                        }
                    }
                }

                item {
                    Column {
                        Label("Mod yükleyicisi")
                        ChipRow {
                            LoaderId.entries.forEach { candidate ->
                                FilterChip(
                                    selected = loader == candidate,
                                    onClick = { loader = candidate },
                                    label = { Text(candidate.label) }
                                )
                            }
                        }
                    }
                }

                item {
                    Column {
                        Label("Sürüm türü")
                        ChipRow {
                            VersionChannel.entries.forEach { channel ->
                                FilterChip(
                                    selected = channel in channels,
                                    onClick = {
                                        // At least one channel must stay on, or the list empties.
                                        channels = if (channel in channels && channels.size > 1) {
                                            channels - channel
                                        } else {
                                            channels + channel
                                        }
                                    },
                                    label = { Text(channel.label) }
                                )
                            }
                        }
                    }
                }

                item {
                    Label("Minecraft sürümü · ${visibleVersions.size} seçenek")
                }

                if (visibleVersions.isEmpty()) {
                    item {
                        Text(
                            "Sürüm listesi yükleniyor…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                items(visibleVersions.take(300), key = { it.id }) { version ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { gameVersion = version.id }
                            .background(
                                if (gameVersion == version.id) MaterialTheme.colorScheme.secondaryContainer
                                else MaterialTheme.colorScheme.surface
                            )
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(version.id, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(
                            version.channel.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                if (loader != LoaderId.VANILLA) {
                    item {
                        Column {
                            Label("${loader.label} sürümü")
                            when {
                                loadingLoaders -> CircularProgressIndicator(Modifier.height(20.dp))
                                loaderVersions.isEmpty() -> Text(
                                    "Bu Minecraft sürümü için ${loader.label} bulunamadı.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error
                                )
                                else -> ChipRow {
                                    loaderVersions.take(12).forEach { candidate ->
                                        FilterChip(
                                            selected = loaderVersion == candidate.version,
                                            onClick = { loaderVersion = candidate.version },
                                            label = {
                                                Text(
                                                    candidate.version +
                                                        if (candidate.stable) "" else " (kararsız)"
                                                )
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    )
}

@Composable
internal fun Label(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 6.dp)
    )
}

/** Wrapping row of chips; Compose has no built-in flow row in stable Material3. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun ChipRow(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) { content() }
}
