package com.opbay.client

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.opbay.client.ui.LauncherViewModel
import com.opbay.client.ui.OpbayRoot
import com.opbay.client.ui.theme.OpbayTheme

class MainActivity : ComponentActivity() {

    private val viewModel: LauncherViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val db by viewModel.db.collectAsState()
            OpbayTheme(theme = db.settings.theme) {
                OpbayRoot(viewModel)
            }
        }
    }
}
