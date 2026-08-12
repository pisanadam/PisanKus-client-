package com.opbay.client.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.opbay.client.data.ContentKind
import com.opbay.client.data.Profile
import com.opbay.client.ui.GameStatus
import com.opbay.client.ui.LauncherViewModel

private enum class ProfileTab(val label: String, val kind: ContentKind?) {
    MODS("Modlar", ContentKind.MOD),
    RESOURCES("Dokular", ContentKind.RESOURCEPACK),
    SHADERS("Shaderlar", ContentKind.SHADER),
    WORLDS("Dünyalar", ContentKind.WORLD),
    LOGS("Günlük", null),
    SETTINGS("Ayarlar", null)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: LauncherViewModel,
    profile: Profile,
    onBack: () -> Unit,
    onBrowse: () -> Unit
) {
    val status by viewModel.gameStatus.collectAsState()
    val state = status[profile.id] ?: GameStatus.IDLE
    var tab by remember { mutableStateOf(ProfileTab.MODS) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "${profile.icon}  ${profile.name}",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            "${profile.gameVersion} · ${profile.loader.label}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri")
                    }
                },
                actions = {
                    if (state == GameStatus.IDLE) {
                        Button(onClick = { viewModel.launch(profile.id) }, Modifier.padding(end = 12.dp)) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Text("Oyna", Modifier.padding(start = 4.dp))
                        }
                    } else {
                        OutlinedButton(onClick = { viewModel.stopGame(profile.id) }, Modifier.padding(end = 12.dp)) {
                            Icon(Icons.Default.Stop, contentDescription = null)
                            Text("Durdur", Modifier.padding(start = 4.dp))
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab.ordinal) {
                ProfileTab.entries.forEach { entry ->
                    Tab(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        text = { Text(entry.label, style = MaterialTheme.typography.labelMedium) }
                    )
                }
            }

            when (tab) {
                ProfileTab.LOGS -> LogsTab(viewModel, profile)
                ProfileTab.SETTINGS -> ProfileSettingsTab(viewModel, profile, onBack)
                else -> ContentTab(viewModel, profile, tab.kind!!, onBrowse)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ContentTab(
    viewModel: LauncherViewModel,
    profile: Profile,
    kind: ContentKind,
    onBrowse: () -> Unit
) {
    val items = profile.content.filter { it.kind == kind }
    var pendingRemoval by remember { mutableStateOf<String?>(null) }

    // SAF gives back a content:// uri; the display name comes from the last segment.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "içerik"
            viewModel.importContent(profile.id, uri, name, kind)
        }
    }

    val mimeTypes = when (kind) {
        ContentKind.MOD -> arrayOf("application/java-archive", "application/octet-stream", "*/*")
        else -> arrayOf("application/zip", "*/*")
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 120.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(onClick = onBrowse) {
                    Icon(Icons.Default.Download, contentDescription = null)
                    Text("Mağazadan ekle", Modifier.padding(start = 6.dp))
                }
                OutlinedButton(onClick = { picker.launch(mimeTypes) }) {
                    Text(if (kind == ContentKind.WORLD) "Dünya içe aktar" else "Dosyadan ekle")
                }
                if (items.isNotEmpty()) {
                    OutlinedButton(onClick = { viewModel.checkUpdates(profile.id) }) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Text("Güncelle", Modifier.padding(start = 6.dp))
                    }
                }
            }
        }

        if (items.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📭", style = MaterialTheme.typography.displaySmall)
                        Text("Bu profilde ${kind.label.lowercase()} yok", style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }

        items(items, key = { it.id }) { entry ->
            Card {
                ListItem(
                    headlineContent = {
                        Text(entry.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    },
                    supportingContent = {
                        Column {
                            Text(
                                entry.fileName,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (entry.updateAvailable != null) {
                                AssistChip(
                                    onClick = { viewModel.updateContent(profile.id, entry.id) },
                                    label = { Text("Güncelleme var") }
                                )
                            }
                        }
                    },
                    leadingContent = {
                        if (entry.iconUrl != null) {
                            AsyncImage(
                                model = entry.iconUrl,
                                contentDescription = null,
                                modifier = Modifier.size(40.dp)
                            )
                        }
                    },
                    trailingContent = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (entry.kind != ContentKind.WORLD && entry.kind != ContentKind.MODPACK) {
                                Switch(
                                    checked = entry.enabled,
                                    onCheckedChange = {
                                        viewModel.setContentEnabled(profile.id, entry.id, it)
                                    }
                                )
                            }
                            IconButton(onClick = { pendingRemoval = entry.id }) {
                                Icon(Icons.Default.Delete, contentDescription = "Kaldır")
                            }
                        }
                    }
                )
            }
        }
    }

    pendingRemoval?.let { contentId ->
        val entry = items.firstOrNull { it.id == contentId }
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            title = { Text("Kaldırılsın mı?") },
            text = { Text("${entry?.name ?: "Bu içerik"} profilden silinecek.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeContent(profile.id, contentId)
                    pendingRemoval = null
                }) { Text("Kaldır") }
            },
            dismissButton = { TextButton(onClick = { pendingRemoval = null }) { Text("Vazgeç") } }
        )
    }
}

@Composable
private fun LogsTab(viewModel: LauncherViewModel, profile: Profile) {
    val logs by viewModel.logs.collectAsState()
    val lines = logs[profile.id].orEmpty()
    val listState = rememberLazyListState()

    LaunchedEffect(lines.size) {
        if (lines.isNotEmpty()) listState.animateScrollToItem(lines.lastIndex)
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { viewModel.clearLogs(profile.id) }) { Text("Temizle") }
            Text(
                "${lines.size} satır",
                Modifier.align(Alignment.CenterVertically),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
            modifier = Modifier.fillMaxSize().padding(12.dp)
        ) {
            if (lines.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Oyun çalıştığında çıktı burada görünür.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(state = listState, contentPadding = PaddingValues(12.dp)) {
                    items(lines) { line ->
                        Text(
                            line.text,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileSettingsTab(viewModel: LauncherViewModel, profile: Profile, onDeleted: () -> Unit) {
    var memory by remember(profile.id) { mutableFloatStateOf(profile.memoryMb.toFloat()) }
    var confirmDelete by remember { mutableStateOf(false) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 120.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Card {
                Column(Modifier.padding(16.dp)) {
                    Label("Ayrılan bellek — ${memory.toInt()} MB")
                    Slider(
                        value = memory,
                        onValueChange = { memory = it },
                        onValueChangeFinished = {
                            viewModel.updateProfile(profile.id) { it.copy(memoryMb = memory.toInt()) }
                        },
                        valueRange = 512f..6144f,
                        steps = 21
                    )
                    Text(
                        "Cihazın toplam belleğinin yarısını aşmayın; Android aksi hâlde uygulamayı sonlandırır.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        item {
            Card {
                Column(Modifier.padding(16.dp)) {
                    Label("Oynanma süresi")
                    Text(
                        "%.1f saat".format(profile.totalPlaytimeMs / 3_600_000.0),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }

        item {
            OutlinedButton(
                onClick = { confirmDelete = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Delete, contentDescription = null)
                Text("Profili sil", Modifier.padding(start = 6.dp))
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Profil silinsin mi?") },
            text = {
                Text(
                    "${profile.name} profili ve içindeki tüm modlar, dünyalar ve ayarlar kalıcı olarak " +
                        "silinecek. Bu işlem geri alınamaz."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteProfile(profile.id)
                    confirmDelete = false
                    onDeleted()
                }) { Text("Sil") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Vazgeç") } }
        )
    }
}
