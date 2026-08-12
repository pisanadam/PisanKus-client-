package com.opbay.client.ui.screens

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.opbay.client.data.ThemeMode
import com.opbay.client.ui.LauncherViewModel
import com.opbay.client.ui.theme.SEED_PRESETS

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: LauncherViewModel) {
    val db by viewModel.db.collectAsState()
    val runtimes by viewModel.runtimes.collectAsState()
    val theme = db.settings.theme

    var apiKeyDraft by remember(db.settings.curseForgeApiKey) {
        mutableStateOf(db.settings.curseForgeApiKey.orEmpty())
    }
    var hexDraft by remember(theme.seedColor) {
        mutableStateOf("#%06X".format(theme.seedColor and 0xFFFFFF))
    }
    var corner by remember(theme.cornerRadiusDp) { mutableFloatStateOf(theme.cornerRadiusDp.toFloat()) }
    var fontScale by remember(theme.fontScale) { mutableFloatStateOf(theme.fontScale) }

    val runtimePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "runtime.tar.xz"
            viewModel.importRuntime(uri, name)
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Ayarlar") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 120.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ------------------------------------------------------------ theme

            item {
                SettingsCard("Görünüm") {
                    Label("Tema")
                    ChipRow {
                        ThemeMode.entries.forEach { mode ->
                            FilterChip(
                                selected = theme.mode == mode,
                                onClick = { viewModel.updateTheme { it.copy(mode = mode) } },
                                label = { Text(mode.label) }
                            )
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Saf siyah (AMOLED)", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Koyu temada arka planı tam siyah yapar",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = theme.amoled,
                            onCheckedChange = { value -> viewModel.updateTheme { it.copy(amoled = value) } }
                        )
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        Row(
                            Modifier.fillMaxWidth().padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("Duvar kâğıdı renkleri", style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "Material You paletini kullan",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = theme.dynamicColor,
                                onCheckedChange = { value ->
                                    viewModel.updateTheme { it.copy(dynamicColor = value) }
                                }
                            )
                        }
                    }
                }
            }

            item {
                SettingsCard("Renk") {
                    Text(
                        "Seçtiğiniz renkten tüm arayüz paleti türetilir.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 10.dp)
                    )

                    ChipRow {
                        SEED_PRESETS.forEach { (name, value) ->
                            val selected = theme.seedColor == value
                            Box(
                                Modifier
                                    .size(40.dp)
                                    .background(Color(value), CircleShape)
                                    .border(
                                        width = if (selected) 3.dp else 0.dp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        shape = CircleShape
                                    )
                                    .clickable {
                                        viewModel.updateTheme { it.copy(seedColor = value, dynamicColor = false) }
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                if (selected) {
                                    Icon(Icons.Default.Check, contentDescription = name, tint = Color.White)
                                }
                            }
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = hexDraft,
                            onValueChange = { hexDraft = it },
                            label = { Text("Özel renk (#RRGGBB)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = {
                                parseHex(hexDraft)?.let { parsed ->
                                    viewModel.updateTheme { it.copy(seedColor = parsed, dynamicColor = false) }
                                } ?: viewModel.notify("Renk kodu geçersiz. Örnek: #7C5CFF", isError = true)
                            }
                        ) { Text("Uygula") }
                    }
                }
            }

            item {
                SettingsCard("Biçim") {
                    Label("Köşe yuvarlaklığı — ${corner.toInt()} dp")
                    Slider(
                        value = corner,
                        onValueChange = { corner = it },
                        onValueChangeFinished = {
                            viewModel.updateTheme { it.copy(cornerRadiusDp = corner.toInt()) }
                        },
                        valueRange = 0f..28f,
                        steps = 13
                    )

                    Label("Yazı boyutu — %${(fontScale * 100).toInt()}")
                    Slider(
                        value = fontScale,
                        onValueChange = { fontScale = it },
                        onValueChangeFinished = {
                            viewModel.updateTheme { it.copy(fontScale = fontScale) }
                        },
                        valueRange = 0.85f..1.3f,
                        steps = 8
                    )
                }
            }

            // ---------------------------------------------------------- runtime

            item {
                SettingsCard("Java çalışma zamanı") {
                    Text(
                        "Android'de Minecraft Java Edition'ı çalıştırmak için bir Java çalışma zamanı " +
                            "gerekir. Opbay Client bir JRE ile birlikte gelmez; cihazınıza uygun bir " +
                            "arşivi (.tar.xz, .tar.gz veya .zip) içe aktarın.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    if (runtimes.isEmpty()) {
                        Text(
                            "Kurulu çalışma zamanı yok — oyun başlatılamaz.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 10.dp)
                        )
                    } else {
                        runtimes.forEach { runtime ->
                            ListItem(
                                headlineContent = {
                                    Text(runtime.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                },
                                supportingContent = { Text("Java ${runtime.majorVersion}") },
                                trailingContent = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        FilterChip(
                                            selected = db.settings.runtimeName == runtime.name,
                                            onClick = {
                                                viewModel.updateSettings { it.copy(runtimeName = runtime.name) }
                                            },
                                            label = { Text("Kullan") }
                                        )
                                        IconButton(onClick = { viewModel.removeRuntime(runtime.name) }) {
                                            Icon(Icons.Default.Delete, contentDescription = "Sil")
                                        }
                                    }
                                }
                            )
                        }
                    }

                    Button(
                        onClick = { runtimePicker.launch(arrayOf("*/*")) },
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                    ) { Text("Çalışma zamanı arşivi içe aktar") }
                }
            }

            // ---------------------------------------------------------- content

            item {
                SettingsCard("İçerik") {
                    OutlinedTextField(
                        value = apiKeyDraft,
                        onValueChange = { apiKeyDraft = it },
                        label = { Text("CurseForge API anahtarı") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "CurseForge içerikleri için gerekli; console.curseforge.com üzerinden ücretsiz " +
                            "alınabilir. Modrinth anahtar gerektirmez.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                    OutlinedButton(
                        onClick = {
                            viewModel.updateSettings {
                                it.copy(curseForgeApiKey = apiKeyDraft.trim().ifEmpty { null })
                            }
                            viewModel.notify("Anahtar kaydedildi.")
                        }
                    ) { Text("Kaydet") }
                }
            }

            // --------------------------------------------------------- accounts

            item {
                SettingsCard("Hesaplar") {
                    db.accounts.forEach { account ->
                        ListItem(
                            headlineContent = { Text(account.name) },
                            supportingContent = {
                                Text(
                                    when {
                                        account.id == db.activeAccountId -> "Etkin hesap"
                                        account.expired -> "Oturum yenilenmeli"
                                        else -> "Bağlı"
                                    }
                                )
                            },
                            trailingContent = {
                                Row {
                                    if (account.id != db.activeAccountId) {
                                        FilterChip(
                                            selected = false,
                                            onClick = { viewModel.setActiveAccount(account.id) },
                                            label = { Text("Seç") }
                                        )
                                    }
                                    IconButton(onClick = { viewModel.removeAccount(account.id) }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Çıkış")
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 10.dp))
            content()
        }
    }
}

/** Accepts `#RRGGBB`, `RRGGBB` and `#AARRGGBB`. */
private fun parseHex(input: String): Long? {
    val cleaned = input.trim().removePrefix("#")
    if (cleaned.length != 6 && cleaned.length != 8) return null
    val value = cleaned.toLongOrNull(16) ?: return null
    return if (cleaned.length == 6) value or 0xFF000000L else value
}
