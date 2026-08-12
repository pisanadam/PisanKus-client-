package com.opbay.client.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.opbay.client.data.TaskState
import com.opbay.client.ui.screens.DiscoverScreen
import com.opbay.client.ui.screens.LibraryScreen
import com.opbay.client.ui.screens.ProfileScreen
import com.opbay.client.ui.screens.SettingsScreen
import com.opbay.client.ui.screens.SignInScreen

private enum class Tab(val label: String, val icon: ImageVector) {
    LIBRARY("Kitaplık", Icons.Default.GridView),
    DISCOVER("Keşfet", Icons.Default.Explore),
    SETTINGS("Ayarlar", Icons.Default.Settings)
}

@Composable
fun OpbayRoot(viewModel: LauncherViewModel) {
    val db by viewModel.db.collectAsState()

    // Microsoft sign-in is mandatory: nothing else is reachable without an account.
    if (db.accounts.isEmpty()) {
        SignInScreen(viewModel)
        return
    }

    var tab by rememberSaveable { mutableStateOf(Tab.LIBRARY) }
    var openProfileId by rememberSaveable { mutableStateOf<String?>(null) }
    var discoverProfileId by rememberSaveable { mutableStateOf<String?>(null) }

    val openProfile = openProfileId?.let { id -> db.profiles.firstOrNull { it.id == id } }

    Scaffold(
        bottomBar = {
            // The profile detail view is a full-screen push, so it hides the bar.
            if (openProfile == null) {
                NavigationBar {
                    Tab.entries.forEach { entry ->
                        NavigationBarItem(
                            selected = tab == entry,
                            onClick = { tab = entry },
                            icon = { Icon(entry.icon, contentDescription = null) },
                            label = { Text(entry.label) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                openProfile != null -> ProfileScreen(
                    viewModel = viewModel,
                    profile = openProfile,
                    onBack = { openProfileId = null },
                    onBrowse = {
                        discoverProfileId = openProfile.id
                        openProfileId = null
                        tab = Tab.DISCOVER
                    }
                )

                tab == Tab.LIBRARY -> LibraryScreen(
                    viewModel = viewModel,
                    onOpenProfile = { openProfileId = it }
                )

                tab == Tab.DISCOVER -> DiscoverScreen(
                    viewModel = viewModel,
                    initialProfileId = discoverProfileId
                )

                tab == Tab.SETTINGS -> SettingsScreen(viewModel)
            }

            TaskOverlay(viewModel, Modifier.align(Alignment.BottomCenter))
        }
    }
}

/** Floating stack of progress cards for downloads, installs and launches. */
@Composable
private fun TaskOverlay(viewModel: LauncherViewModel, modifier: Modifier = Modifier) {
    val tasks by viewModel.tasks.collectAsState()

    Column(
        modifier = modifier.fillMaxWidth().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        tasks.takeLast(3).forEach { task ->
            AnimatedVisibility(visible = true, enter = slideInVertically { it }) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (task.state == TaskState.Status.ERROR) {
                            MaterialTheme.colorScheme.errorContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceContainerHigh
                        }
                    )
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (task.state == TaskState.Status.RUNNING) {
                                CircularProgressIndicator(
                                    Modifier.size(16.dp),
                                    strokeWidth = 2.dp
                                )
                            }
                            Text(
                                text = task.label,
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f).padding(horizontal = 10.dp)
                            )
                            IconButton(onClick = { viewModel.dismissTask(task.id) }) {
                                Icon(Icons.Default.Close, contentDescription = "Kapat")
                            }
                        }

                        (task.error ?: task.detail)?.let { detail ->
                            Text(
                                text = detail,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        if (task.state == TaskState.Status.RUNNING) {
                            val progress = task.progress
                            if (progress == null) {
                                LinearProgressIndicator(
                                    Modifier.fillMaxWidth().padding(top = 8.dp)
                                )
                            } else {
                                LinearProgressIndicator(
                                    progress = { progress },
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
