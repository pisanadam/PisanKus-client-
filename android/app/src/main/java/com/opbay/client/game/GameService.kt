package com.opbay.client.game

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.opbay.client.MainActivity
import com.opbay.client.R

/**
 * Keeps the process alive while the game runs. Android aggressively freezes
 * background apps, and the JVM is a child of this process — without a
 * foreground service the game is killed the moment the launcher loses focus.
 */
class GameService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val profileName = intent?.getStringExtra(EXTRA_PROFILE_NAME) ?: "Minecraft"
        startForeground(NOTIFICATION_ID, buildNotification(profileName))
        return START_STICKY
    }

    private fun buildNotification(profileName: String): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Oyun oturumu",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { setShowBadge(false) }
            )
        }

        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Opbay Client")
            .setContentText("$profileName çalışıyor")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "game_session"
        private const val NOTIFICATION_ID = 1001
        const val EXTRA_PROFILE_NAME = "profile_name"

        fun start(context: Context, profileName: String) {
            val intent = Intent(context, GameService::class.java)
                .putExtra(EXTRA_PROFILE_NAME, profileName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, GameService::class.java))
        }
    }
}
