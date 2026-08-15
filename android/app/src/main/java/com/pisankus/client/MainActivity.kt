package com.pisankus.client

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.pisankus.client.databinding.ActivityMainBinding

/**
 * The launcher's entry screen.
 *
 * It states plainly what this build can and cannot do. Shipping a launcher that
 * looks finished but cannot start the game would be worse than shipping one
 * that says so — the download page keeps the Android card marked "Yakında" for
 * the same reason.
 */
class MainActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    binding.status.text = buildString {
      appendLine(getString(R.string.status_title))
      append(getString(R.string.status_body))
    }
  }
}
