package net.kdt.pojavlaunch;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
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
    /**
     * The Android channel's own release.
     *
     * Deliberately not "latest": that tag carries the desktop installers and is
     * republished whenever the desktop side changes. Reading it here meant a
     * desktop-only change looked like an Android update, and the phone
     * downloaded 150 MB to install the app it already had.
     */
    private static final String RELEASE_API =
            "https://api.github.com/repos/pisanadam/PisanKus-client-/releases/tags/android";
    private static final String ASSET_NAME = "PisanKusClient-android.apk";
    /** Published beside the package: what is in it, without downloading it. */
    private static final String VERSION_ASSET = "android-version.json";

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
                JSONObject release = new JSONObject(read(RELEASE_API));

                String url = assetUrl(release, ASSET_NAME);
                if (url == null) {
                    post(() -> listener.onFailed(PisanKusText.get(R.string.pisan_update_no_apk)));
                    return;
                }

                // The published version travels in a file of its own, a few
                // dozen bytes, so the 150 MB package is only fetched when it is
                // actually newer. Android would refuse a same-or-older version
                // code anyway — but only after the whole download.
                long published = publishedVersionCode(release);
                long installed = installedVersionCode();
                if (published > 0 && installed > 0 && published <= installed) {
                    post(() -> listener.onUpToDate(installedVersionName()));
                    return;
                }

                String newVersion = publishedVersionName(release);
                post(() -> listener.onUpdateFound(newVersion));
                File apk = download(url);
                post(listener::onReadyToInstall);
                post(() -> install(apk));
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.toString() : e.getMessage();
                post(() -> listener.onFailed(message));
            }
        }, "PisanKusUpdater").start();
    }

    /** The version file's contents, or null when the release does not carry one. */
    private JSONObject publishedVersion(JSONObject release) {
        try {
            String url = assetUrl(release, VERSION_ASSET);
            if (url == null) return null;
            return new JSONObject(read(url));
        } catch (Exception e) {
            // An unreadable version file must not stop an update; the install
            // itself is still the final word.
            return null;
        }
    }

    private long publishedVersionCode(JSONObject release) {
        JSONObject version = publishedVersion(release);
        return version == null ? 0 : version.optLong("versionCode", 0);
    }

    private String publishedVersionName(JSONObject release) {
        JSONObject version = publishedVersion(release);
        String name = version == null ? null : version.optString("versionName", null);
        if (name != null && !name.isEmpty()) return name;
        return release.optString("name", release.optString("tag_name", ""));
    }

    private long installedVersionCode() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String installedVersionName() {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private String assetUrl(JSONObject release, String name) {
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset != null && name.equals(asset.optString("name"))) {
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
            listener.onFailed(PisanKusText.get(R.string.pisan_update_install_failed, e.getMessage()));
        }
    }

    private void post(Runnable runnable) {
        main.post(runnable);
    }
}
