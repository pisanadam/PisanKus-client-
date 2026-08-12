package com.opbay.client.ui.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
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
import coil.compose.AsyncImage
import com.opbay.client.content.ContentInstaller
import com.opbay.client.content.SearchQuery
import com.opbay.client.data.ContentKind
import com.opbay.client.data.SearchResult
import com.opbay.client.ui.LauncherViewModel
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(viewModel: LauncherViewModel, initialProfileId: String?) {
    val db by viewModel.db.collectAsState()

    var source by remember { mutableStateOf("modrinth") }
    var kind by remember { mutableStateOf(ContentKind.MOD) }
    var query by remember { mutableStateOf("") }
    var profileId by remember { mutableStateOf(initialProfileId ?: db.profiles.firstOrNull()?.id) }
    var filterByProfile by remember { mutableStateOf(true) }

    var results by remember { mutableStateOf<List<SearchResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val profile = db.profiles.firstOrNull { it.id == profileId }

    LaunchedEffect(db.profiles.size) {
        if (profile == null) profileId = db.profiles.firstOrNull()?.id
    }

    // Debounced search: typing should not fire a request per keystroke.
    LaunchedEffect(source, kind, query, filterByProfile, profile?.id) {
        loading = true
        error = null
        delay(if (query.isEmpty()) 0 else 350)
        viewModel.search(
            source = source,
            query = SearchQuery(
                query = query,
                kind = kind,
                gameVersion = if (filterByProfile) profile?.gameVersion else null,
                loader = if (filterByProfile) profile?.loader else null
            ),
            onResult = { results = it; loading = false },
            onError = { error = it; results = emptyList(); loading = false }
        )
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Keşfet") }) }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Mod, doku paketi, shader ara") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            )

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                FilterChip(source == "modrinth", { source = "modrinth" }, { Text("Modrinth") })
                FilterChip(source == "curseforge", { source = "curseforge" }, { Text("CurseForge") })
            }

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(16.dp, 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                ContentKind.entries.filter { it != ContentKind.WORLD }.forEach { entry ->
                    FilterChip(kind == entry, { kind = entry }, { Text(entry.label) })
                }
            }

            if (db.profiles.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    db.profiles.forEach { candidate ->
                        FilterChip(
                            selected = profileId == candidate.id,
                            onClick = { profileId = candidate.id },
                            label = { Text("${candidate.icon} ${candidate.name}") }
                        )
                    }
                }

                Row(Modifier.padding(16.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = filterByProfile,
                        onClick = { filterByProfile = !filterByProfile },
                        label = {
                            Text(
                                profile?.let { "${it.gameVersion} · ${it.loader.label}" } ?: "Profil filtresi"
                            )
                        }
                    )
                }
            }

            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                error != null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(
                        error!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Sonuç yok",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 120.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(results, key = { "${it.source}-${it.projectId}" }) { result ->
                        ResultCard(
                            result = result,
                            enabled = profileId != null,
                            onInstall = {
                                val target = profileId ?: return@ResultCard
                                viewModel.install(
                                    ContentInstaller.Request(
                                        profileId = target,
                                        source = result.source,
                                        projectId = result.projectId,
                                        kind = result.kind,
                                        name = result.title,
                                        iconUrl = result.iconUrl
                                    )
                                )
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultCard(result: SearchResult, enabled: Boolean, onInstall: () -> Unit) {
    Card {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (result.iconUrl != null) {
                AsyncImage(
                    model = result.iconUrl,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp)
                )
            }

            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(result.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                result.author?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    result.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "${formatCount(result.downloads)} indirme",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            FilledTonalButton(onClick = onInstall, enabled = enabled) {
                Icon(Icons.Default.Download, contentDescription = null)
                Text("Kur", Modifier.padding(start = 4.dp))
            }
        }
    }
}

private fun formatCount(value: Long): String = when {
    value >= 1_000_000 -> "%.1f M".format(value / 1_000_000.0)
    value >= 1_000 -> "%.1f B".format(value / 1_000.0)
    else -> value.toString()
}
