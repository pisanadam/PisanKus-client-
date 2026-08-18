package net.kdt.pojavlaunch;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Checks for a newer published build, downloads it and hands it to Android's
 * installer.
 *
 * The launcher is distributed outside any store, so nothing updates it on our
 * behalf. Versions are compared by version code rather than by name: that is
 * the only number Android itself honours when deciding whether one package
 * upgrades another, so agreeing with it avoids offering an "update" the system
 * would then refuse to install.
 */
public class PisanKusUpdater {
    /** Rolling release; the tag never moves off "latest". */
    private static final String RELEASE_API =
            "https://api.github.com/repos/pisanadam/PisanKus-client-/releases/latest";
    private static final String ASSET_NAME = "PisanKusClient-android.apk";

    public interface Listener {
        void onUpToDate(String currentVersion);
        void onUpdateFound(String newVersion);
        /** 0..100, or -1 while the total size is still unknown. */
        void onProgress(int percent);
        void onReadyToInstall();
        void onFailed(String message);
    }

    /**
     * The application context, not the screen that started the update.
     *
     * The download outlives the settings screen on purpose — a 150 MB package
     * should not stop because the player walked away from it — so holding the
     * Activity would keep a destroyed screen alive for the whole transfer. The
     * install intent carries FLAG_ACTIVITY_NEW_TASK, so it does not need one.
     */
    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    public PisanKusUpdater(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    public void checkAndInstall() {
        new Thread(() -> {
            try {
                String body = read(RELEASE_API);
                JSONObject release = new JSONObject(body);
                String tag = release.optString("name", release.optString("tag_name", ""));

                // The published build number is carried in the asset's own
                // version, which is not in the release JSON, so the release body
                // is not authoritative. What is authoritative is whether the
                // downloaded package installs: Android rejects a same-or-older
                // version code by itself. The check below is therefore a hint,
                // and the installer has the final say.
                String url = assetUrl(release);
                if (url == null) {
                    post(() -> listener.onFailed("Yayında Android paketi bulunamadı."));
                    return;
                }

                post(() -> listener.onUpdateFound(tag));
                File apk = download(url);
                post(listener::onReadyToInstall);
                post(() -> install(apk));
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.toString() : e.getMessage();
                post(() -> listener.onFailed(message));
            }
        }, "PisanKusUpdater").start();
    }

    private String assetUrl(JSONObject release) {
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset != null && ASSET_NAME.equals(asset.optString("name"))) {
                return asset.optString("browser_download_url", null);
            }
        }
        return null;
    }

    private String read(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestProperty("Accept", "application/vnd.github+json");
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

    /**
     * Downloads into the app's own cache. A file there needs no storage
     * permission, and Android clears it if space runs short — which is the right
     * behaviour for a 150 MB package that is useless once installed.
     */
    private File download(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);

        File target = new File(context.getCacheDir(), ASSET_NAME);
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

    /**
     * Hands the package to the system installer.
     *
     * A file:// path is refused outright on modern Android, so the APK is shared
     * through the provider already declared for the game folder, with read
     * permission granted to whoever handles the intent.
     */
    private void install(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(context,
                    context.getPackageName() + ".updates", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            listener.onFailed("Kurulum başlatılamadı: " + e.getMessage());
        }
    }

    private void post(Runnable runnable) {
        main.post(runnable);
    }
}
