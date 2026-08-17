package net.kdt.pojavlaunch;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Checks only the Android release channel, downloads the APK and hands it to
 * Android's installer. Desktop releases can never trigger this updater.
 */
public class PisanKusUpdater {
    private static final String METADATA_URL =
            "https://github.com/pisanadam/PisanKus-client-/releases/download/android-latest/android-update.json";
    private static final String ASSET_NAME = "PisanKusClient-android.apk";

    public interface Listener {
        void onUpToDate(String currentVersion);
        void onUpdateFound(String newVersion);
        /** 0..100, or -1 while the total size is still unknown. */
        void onProgress(int percent);
        void onReadyToInstall();
        void onFailed(String message);
    }

    private final Activity activity;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    public PisanKusUpdater(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
    }

    public void checkAndInstall() {
        new Thread(() -> {
            try {
                // A cache-buster matters because the rolling asset keeps the
                // same URL even when a new large Android release is published.
                JSONObject metadata = new JSONObject(
                        read(METADATA_URL + "?build=" + System.currentTimeMillis()));
                long publishedCode = metadata.getLong("versionCode");
                String publishedName = metadata.getString("versionName");

                if (publishedCode <= BuildConfig.VERSION_CODE) {
                    post(() -> listener.onUpToDate(BuildConfig.VERSION_NAME));
                    return;
                }

                String url = metadata.getString("downloadUrl");
                String expectedSha256 = metadata.getString("sha256");
                post(() -> listener.onUpdateFound(publishedName));

                File apk = download(url);
                String actualSha256 = sha256(apk);
                if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
                    // Never hand a truncated or replaced package to the installer.
                    // The public debug signing key cannot provide provenance, so
                    // the release metadata checksum is still a useful integrity
                    // check against broken downloads.
                    //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                    throw new IllegalStateException("İndirilen Android paketinin doğrulaması başarısız.");
                }

                post(listener::onReadyToInstall);
                post(() -> install(apk));
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.toString() : e.getMessage();
                post(() -> listener.onFailed(message));
            }
        }, "PisanKusUpdater").start();
    }

    private String read(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = in.read(chunk)) != -1) buffer.write(chunk, 0, count);
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
    }

    private File download(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);

        File target = new File(activity.getCacheDir(), ASSET_NAME);
        long total = connection.getContentLengthLong();
        long done = 0;
        int lastPercent = -2;

        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) {
                out.write(buffer, 0, count);
                done += count;
                int percent = total > 0 ? (int) (done * 100 / total) : -1;
                if (percent != lastPercent) {
                    lastPercent = percent;
                    int reported = percent;
                    post(() -> listener.onProgress(reported));
                }
            }
        } finally {
            connection.disconnect();
        }
        return target;
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count);
        }

        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) value.append(String.format("%02x", item));
        return value.toString();
    }

    private void install(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(activity,
                    activity.getPackageName() + ".updates", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            listener.onFailed("Kurulum başlatılamadı: " + e.getMessage());
        }
    }

    private void post(Runnable runnable) {
        main.post(runnable);
    }
}
