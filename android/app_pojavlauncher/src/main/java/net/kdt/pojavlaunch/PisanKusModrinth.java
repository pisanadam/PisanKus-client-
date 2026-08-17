package net.kdt.pojavlaunch;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * The Modrinth calls both mod features share: the curated pack and the mod
 * browser ask the same three questions — what exists, which build fits this
 * profile, and give me the file.
 */
public class PisanKusModrinth {
    private static final String API = "https://api.modrinth.com/v2";
    /** Modrinth asks callers to identify themselves; anonymous traffic gets throttled harder. */
    private static final String USER_AGENT = "PisanKusClient/1.0 (+https://github.com/pisanadam/PisanKus-client-)";

    /**
     * Searches mods for one loader and game version.
     *
     * Facets are AND-ed between the outer entries, so this reads as
     * "a mod, for this loader, for this version".
     */
    public static JSONArray searchMods(String query, String loader, String gameVersion,
                                       int offset, int limit) throws IOException {
        StringBuilder facets = new StringBuilder("[[\"project_type:mod\"]");
        if (loader != null) facets.append(",[\"categories:").append(loader).append("\"]");
        if (gameVersion != null) facets.append(",[\"versions:").append(gameVersion).append("\"]");
        facets.append("]");

        String url = API + "/search?limit=" + limit + "&offset=" + offset
                + "&index=relevance"
                + "&facets=" + encode(facets.toString())
                + (query == null || query.isEmpty() ? "" : "&query=" + encode(query));
        try {
            return new JSONObject(get(url)).optJSONArray("hits");
        } catch (JSONException e) {
            throw unreadable(e);
        }
    }

    /**
     * The build to install for a profile, or null when the project has none.
     *
     * Modrinth returns versions newest first, so the newest release is the first
     * one flagged as such; the newest build overall is the fallback, because a
     * project may have only betas for a fresh Minecraft version.
     */
    public static JSONObject latestVersion(String idOrSlug, String loader, String gameVersion)
            throws IOException {
        String url = API + "/project/" + encode(idOrSlug) + "/version"
                + (loader == null ? "" : "?loaders=" + encode("[\"" + loader + "\"]"))
                + (gameVersion == null ? ""
                        : (loader == null ? "?" : "&") + "game_versions=" + encode("[\"" + gameVersion + "\"]"));
        try {
            JSONArray versions = new JSONArray(get(url));
            if (versions.length() == 0) return null;
            for (int i = 0; i < versions.length(); i++) {
                JSONObject version = versions.optJSONObject(i);
                if (version != null && "release".equals(version.optString("version_type"))) return version;
            }
            return versions.getJSONObject(0);
        } catch (JSONException e) {
            throw unreadable(e);
        }
    }

    /**
     * Writes a version's primary file into {@code targetDir} and returns its name.
     *
     * A version can carry several files — sources, extra variants — and only the
     * one flagged primary is the mod itself.
     */
    public static String downloadPrimaryFile(JSONObject version, File targetDir) throws IOException {
        JSONArray files = version.optJSONArray("files");
        if (files == null || files.length() == 0) throw new IOException("Sürümün dosyası yok.");
        JSONObject chosen = files.optJSONObject(0);
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.optJSONObject(i);
            if (file != null && file.optBoolean("primary", false)) {
                chosen = file;
                break;
            }
        }

        // The name comes from a remote service, so it must not be able to point
        // anywhere except inside the target folder.
        String fileName = new File(chosen.optString("filename", "mod.jar")).getName();
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            throw new IOException("Klasör oluşturulamadı: " + targetDir);
        }

        String downloadUrl = chosen.optString("url", null);
        if (downloadUrl == null) throw new IOException("Dosyanın indirme bağlantısı yok.");

        HttpURLConnection connection = open(downloadUrl);
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(new File(targetDir, fileName))) {
            copy(in, out);
        } finally {
            connection.disconnect();
        }
        return fileName;
    }

    public static byte[] downloadBytes(String url) throws IOException {
        HttpURLConnection connection = open(url);
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            copy(in, buffer);
            return buffer.toByteArray();
        } finally {
            connection.disconnect();
        }
    }

    public static String get(String url) throws IOException {
        return new String(downloadBytes(url), StandardCharsets.UTF_8);
    }

    private static void copy(InputStream in, java.io.OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        return connection;
    }

    /** Modrinth answering with something other than the documented shape. */
    private static IOException unreadable(JSONException cause) {
        return new IOException("Modrinth yanıtı okunamadı: " + cause.getMessage());
    }

    public static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }
}
