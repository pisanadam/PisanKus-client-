package net.kdt.pojavlaunch.skins;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.value.MinecraftAccount;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The account's skin and capes, as Minecraft's own services see them.
 *
 * The desktop launcher has had this for a while ({@code src/main/skins.ts}); the
 * calls are the same ones, because they are the same API and there is only one
 * way to ask. The session token this needs is already on the device — the
 * launcher signs in to start the game — so nothing new has to be authorised.
 *
 * Nothing here touches the interface: every method blocks and belongs on a
 * background thread.
 */
public class SkinApi {
    private static final String PROFILE_API = "https://api.minecraftservices.com/minecraft/profile";
    private static final int TIMEOUT = 15000;

    /** Mojang sends no Retry-After of its own, so this is the wait we assume. */
    public static final int DEFAULT_COOLDOWN = 60;

    public static final String CLASSIC = "classic";
    public static final String SLIM = "slim";

    /** Minecraft accepts 64×64, and still accepts the old 64×32 layout. */
    private static final int MAX_SKIN_BYTES = 24576;

    public static class Cape {
        public final String id;
        public final String alias;
        public final String url;
        public final boolean active;

        Cape(String id, String alias, String url, boolean active) {
            this.id = id;
            this.alias = alias;
            this.url = url;
            this.active = active;
        }
    }

    public static class SkinInfo {
        @Nullable public final String skinUrl;
        public final String variant;
        public final List<Cape> capes;

        SkinInfo(@Nullable String skinUrl, String variant, List<Cape> capes) {
            this.skinUrl = skinUrl;
            this.variant = variant;
            this.capes = capes;
        }
    }

    /**
     * Mojang refused because the account changed its skin too often.
     *
     * The wait travels with the error so the screen can say how long, rather
     * than letting the player press again and extend the cooldown. The limit is
     * on Mojang's side and deleting anything locally does not clear it.
     */
    public static class RateLimitException extends IOException {
        public final int retryAfterSeconds;

        RateLimitException(int retryAfterSeconds) {
            super("Mojang skin değiştirme sınırına takıldı. " + retryAfterSeconds
                    + " saniye sonra tekrar deneyin.");
            this.retryAfterSeconds = retryAfterSeconds;
        }
    }

    /** The stored session is no longer good; only signing in again fixes it. */
    public static class SessionExpiredException extends IOException {
        SessionExpiredException() {
            super("Oturum süresi doldu. Ana ekrana dönüp hesabınızla yeniden giriş yapın.");
        }
    }

    public static SkinInfo fetch(MinecraftAccount account) throws IOException {
        return parse(request(account, PROFILE_API, "GET", null, null));
    }

    /**
     * Uploads a PNG as the account's skin.
     *
     * The file goes up as multipart form data because that is the only shape
     * this endpoint accepts for an upload; the url variant below is a different
     * request entirely.
     */
    public static SkinInfo upload(MinecraftAccount account, byte[] png, String fileName, String variant)
            throws IOException {
        validate(png);

        String boundary = "----PisanKus" + System.currentTimeMillis();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        write(body, "--" + boundary + "\r\n");
        write(body, "Content-Disposition: form-data; name=\"variant\"\r\n\r\n");
        write(body, variant + "\r\n");
        write(body, "--" + boundary + "\r\n");
        write(body, "Content-Disposition: form-data; name=\"file\"; filename=\"" + safeName(fileName) + "\"\r\n");
        write(body, "Content-Type: image/png\r\n\r\n");
        body.write(png);
        write(body, "\r\n--" + boundary + "--\r\n");

        request(account, PROFILE_API + "/skins", "POST",
                "multipart/form-data; boundary=" + boundary, body.toByteArray());
        return fetch(account);
    }

    /** Applies a skin already hosted somewhere public, the way a NameMC link is. */
    public static SkinInfo applyUrl(MinecraftAccount account, String url, String variant) throws IOException {
        JSONObject payload = new JSONObject();
        try {
            payload.put("variant", variant);
            payload.put("url", url);
        } catch (JSONException e) {
            throw new IOException("İstek hazırlanamadı", e);
        }

        request(account, PROFILE_API + "/skins", "POST", "application/json",
                payload.toString().getBytes(StandardCharsets.UTF_8));
        return fetch(account);
    }

    /** Drops the uploaded skin, putting the account back on Steve or Alex. */
    public static SkinInfo reset(MinecraftAccount account) throws IOException {
        request(account, PROFILE_API + "/skins/active", "DELETE", null, null);
        return fetch(account);
    }

    /** Wears a cape, or takes off whichever one is on when given null. */
    public static SkinInfo setCape(MinecraftAccount account, @Nullable String capeId) throws IOException {
        if (capeId == null) {
            request(account, PROFILE_API + "/capes/active", "DELETE", null, null);
        } else {
            JSONObject payload = new JSONObject();
            try {
                payload.put("capeId", capeId);
            } catch (JSONException e) {
                throw new IOException("İstek hazırlanamadı", e);
            }
            request(account, PROFILE_API + "/capes/active", "PUT", "application/json",
                    payload.toString().getBytes(StandardCharsets.UTF_8));
        }
        return fetch(account);
    }

    /**
     * Checks a file before it is sent.
     *
     * Minecraft answers a wrong-sized image with a bare HTTP 400, which tells
     * the player nothing. The same three rules checked here turn that into a
     * sentence they can act on.
     */
    public static void validate(byte[] png) throws IOException {
        if (png.length < 24 || !isPng(png)) {
            throw new IOException("Skin dosyası PNG biçiminde olmalı.");
        }
        // IHDR always comes first, so the size is at a fixed offset.
        int width = readInt(png, 16);
        int height = readInt(png, 20);
        if (!(width == 64 && (height == 64 || height == 32))) {
            throw new IOException("Skin boyutu 64×64 (veya eski biçim 64×32) olmalı. Seçilen dosya "
                    + width + "×" + height + ".");
        }
        if (png.length > MAX_SKIN_BYTES) {
            throw new IOException("Skin dosyası 24 KB sınırını aşıyor.");
        }
    }

    private static boolean isPng(byte[] data) {
        final byte[] signature = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
        for (int i = 0; i < signature.length; i++) {
            if (data[i] != signature[i]) return false;
        }
        return true;
    }

    private static int readInt(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 24) | ((data[offset + 1] & 0xff) << 16)
                | ((data[offset + 2] & 0xff) << 8) | (data[offset + 3] & 0xff);
    }

    private static SkinInfo parse(String body) throws IOException {
        try {
            JSONObject profile = new JSONObject(body);
            String skinUrl = null;
            String variant = CLASSIC;

            JSONArray skins = profile.optJSONArray("skins");
            for (int i = 0; skins != null && i < skins.length(); i++) {
                JSONObject skin = skins.optJSONObject(i);
                if (skin == null || !"ACTIVE".equals(skin.optString("state"))) continue;
                skinUrl = https(skin.optString("url", null));
                variant = SLIM.equalsIgnoreCase(skin.optString("variant")) ? SLIM : CLASSIC;
            }

            List<Cape> capes = new ArrayList<>();
            JSONArray capeArray = profile.optJSONArray("capes");
            for (int i = 0; capeArray != null && i < capeArray.length(); i++) {
                JSONObject cape = capeArray.optJSONObject(i);
                if (cape == null) continue;
                capes.add(new Cape(
                        cape.optString("id"),
                        cape.optString("alias", "Pelerin"),
                        https(cape.optString("url", null)),
                        "ACTIVE".equals(cape.optString("state"))));
            }
            return new SkinInfo(skinUrl, variant, capes);
        } catch (JSONException e) {
            throw new IOException("Minecraft servislerinin yanıtı okunamadı", e);
        }
    }

    /**
     * Mojang hands back texture addresses over plain http, and Android has
     * blocked cleartext by default for years. The hosts serve https perfectly
     * well, so the scheme is corrected here rather than by allowing cleartext
     * everywhere.
     */
    @Nullable
    private static String https(@Nullable String url) {
        if (url == null || url.isEmpty() || "null".equals(url)) return null;
        return url.startsWith("http://") ? "https://" + url.substring(7) : url;
    }

    private static String request(MinecraftAccount account, String url, String method,
                                  @Nullable String contentType, @Nullable byte[] body) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT);
            connection.setReadTimeout(TIMEOUT);
            connection.setRequestProperty("Authorization", "Bearer " + account.accessToken);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", Tools.APP_NAME);
            if (contentType != null) connection.setRequestProperty("Content-Type", contentType);

            if (body != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body);
                }
            }

            int status = connection.getResponseCode();
            if (status == 401 || status == 403) throw new SessionExpiredException();
            if (status == 429) throw new RateLimitException(retryAfter(connection));
            if (status < 200 || status > 299) {
                throw new IOException("Minecraft servisleri isteği reddetti (" + status + "). "
                        + read(connection.getErrorStream(), 200));
            }
            // Removing a cape answers 200 with an empty body.
            return read(connection.getInputStream(), Integer.MAX_VALUE);
        } finally {
            connection.disconnect();
        }
    }

    private static int retryAfter(HttpURLConnection connection) {
        int seconds = connection.getHeaderFieldInt("Retry-After", 0);
        return seconds > 0 ? seconds : DEFAULT_COOLDOWN;
    }

    private static String read(@Nullable InputStream stream, int limit) throws IOException {
        if (stream == null) return "";
        try {
            String text = Tools.read(stream);
            return text.length() > limit ? text.substring(0, limit) : text;
        } finally {
            stream.close();
        }
    }

    private static void write(ByteArrayOutputStream out, String text) throws IOException {
        out.write(text.getBytes(StandardCharsets.UTF_8));
    }

    /** Keeps a picked file's name from breaking out of the form field it goes in. */
    private static String safeName(String fileName) {
        String cleaned = fileName.replaceAll("[\"\\\\\r\n]", "_");
        return cleaned.isEmpty() ? "skin.png" : cleaned;
    }
}
