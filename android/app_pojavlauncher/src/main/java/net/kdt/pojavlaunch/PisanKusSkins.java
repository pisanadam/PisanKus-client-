package net.kdt.pojavlaunch;

import org.json.JSONArray;
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
 * Skin changing, against Mojang's own profile service.
 *
 * The same endpoints the desktop launcher uses (`src/main/skins.ts`), so a skin
 * set on either product is the account's skin everywhere — nothing is stored by
 * us. It needs the account's access token, which is why only a Microsoft
 * account can do this; there is no offline account here to worry about.
 */
public class PisanKusSkins {
    private static final String API = "https://api.minecraftservices.com/minecraft/profile";
    private static final String USER_AGENT = "PisanKusClient/1.0";

    public static final String CLASSIC = "classic";
    public static final String SLIM = "slim";

    public static class SkinInfo {
        /** Texture url of the active skin, or null when the account has none. */
        public String skinUrl;
        public String variant = CLASSIC;
        /** Every cape the account owns, in the order Mojang lists them. */
        public final List<Cape> capes = new ArrayList<>();
    }

    public static class Cape {
        public final String id;
        public final String name;
        public final String url;
        public final boolean active;

        Cape(String id, String name, String url, boolean active) {
            this.id = id;
            this.name = name;
            this.url = url;
            this.active = active;
        }
    }

    /** Mojang answered, and said no. Carries the wording the player should see. */
    public static class ServiceException extends IOException {
        public ServiceException(String message) {
            super(message);
        }
    }

    public static SkinInfo current(String accessToken) throws IOException {
        JSONObject profile = json(request(accessToken, API, "GET", null, null));
        SkinInfo info = new SkinInfo();
        JSONArray skins = profile.optJSONArray("skins");
        if (skins != null) {
            for (int i = 0; i < skins.length(); i++) {
                JSONObject skin = skins.optJSONObject(i);
                if (skin == null || !"ACTIVE".equals(skin.optString("state"))) continue;
                info.skinUrl = secure(skin.optString("url", null));
                info.variant = SLIM.equalsIgnoreCase(skin.optString("variant")) ? SLIM : CLASSIC;
                break;
            }
        }
        JSONArray capes = profile.optJSONArray("capes");
        if (capes != null) {
            for (int i = 0; i < capes.length(); i++) {
                JSONObject cape = capes.optJSONObject(i);
                if (cape == null) continue;
                info.capes.add(new Cape(
                        cape.optString("id"),
                        cape.optString("alias", "Cape"),
                        secure(cape.optString("url", null)),
                        "ACTIVE".equals(cape.optString("state"))));
            }
        }
        return info;
    }

    /**
     * Mojang still hands out texture links over plain http, and Android refuses
     * cleartext traffic — which is why loading a skin failed with "Cleartext
     * HTTP traffic to textures.minecraft.net not permitted". The same host
     * serves them over https.
     */
    private static String secure(String url) {
        if (url == null) return null;
        return url.startsWith("http://") ? "https://" + url.substring("http://".length()) : url;
    }

    /** Puts one of the account's capes on, or takes the current one off. */
    public static void setCape(String accessToken, String capeId) throws IOException {
        if (capeId == null) {
            request(accessToken, API + "/capes/active", "DELETE", null, null);
            return;
        }
        String body = "{\"capeId\":\"" + capeId + "\"}";
        request(accessToken, API + "/capes/active", "PUT", "application/json",
                body.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Uploads a PNG as the account's skin.
     *
     * Sent as multipart because that is the only form the endpoint accepts for
     * an uploaded file; the parts are written by hand since the platform has no
     * multipart writer.
     */
    public static void upload(String accessToken, byte[] png, String fileName, String variant) throws IOException {
        assertValidSkin(png);

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

        request(accessToken, API + "/skins", "POST",
                "multipart/form-data; boundary=" + boundary, body.toByteArray());
    }

    /** Drops the uploaded skin, putting the account back on Steve or Alex. */
    public static void reset(String accessToken) throws IOException {
        request(accessToken, API + "/skins/active", "DELETE", null, null);
    }

    /**
     * Rejects anything Minecraft would not accept, before it is sent.
     *
     * The service answers a bare HTTP 400 for a wrong-sized image, which tells
     * the player nothing. Skins are 64×64, or 64×32 for the pre-1.8 layout.
     */
    public static void assertValidSkin(byte[] png) throws IOException {
        if (png.length < 24
                || (png[0] & 0xFF) != 0x89 || png[1] != 'P' || png[2] != 'N' || png[3] != 'G') {
            throw new ServiceException("Bu dosya bir PNG değil.");
        }
        int width = readInt(png, 16);
        int height = readInt(png, 20);
        boolean modern = width == 64 && height == 64;
        boolean legacy = width == 64 && height == 32;
        if (!modern && !legacy) {
            throw new ServiceException("Skin 64×64 (veya eski biçimde 64×32) olmalı. Bu dosya "
                    + width + "×" + height + ".");
        }
    }

    private static int readInt(byte[] data, int offset) {
        return ((data[offset] & 0xFF) << 24) | ((data[offset + 1] & 0xFF) << 16)
                | ((data[offset + 2] & 0xFF) << 8) | (data[offset + 3] & 0xFF);
    }

    private static String safeName(String fileName) {
        String name = fileName == null ? "skin.png" : fileName.replaceAll("[\"\\r\\n\\\\]", "_");
        return name.isEmpty() ? "skin.png" : name;
    }

    private static void write(ByteArrayOutputStream out, String text) throws IOException {
        out.write(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String request(String accessToken, String url, String method,
                                  String contentType, byte[] body) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        if (body != null) {
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(body.length);
            if (contentType != null) connection.setRequestProperty("Content-Type", contentType);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body);
            }
        }

        try {
            int status = connection.getResponseCode();
            if (status == 401) {
                throw new ServiceException("Oturum süresi dolmuş. Hesabınızdan çıkıp yeniden giriş yapın.");
            }
            if (status == 429) {
                // Mojang's limit on skin changes is a server-side cooldown; it
                // does not clear by undoing anything on this device.
                throw new ServiceException("Mojang skin değiştirme sınırına takıldınız. Bir süre sonra tekrar deneyin.");
            }
            if (status < 200 || status >= 300) {
                String detail = read(connection.getErrorStream());
                throw new ServiceException("Minecraft servisleri isteği reddetti (" + status + "). "
                        + detail.substring(0, Math.min(detail.length(), 200)));
            }
            return read(connection.getInputStream());
        } finally {
            connection.disconnect();
        }
    }

    private static JSONObject json(String body) throws IOException {
        try {
            return new JSONObject(body);
        } catch (Exception e) {
            throw new ServiceException("Sunucu yanıtı okunamadı.");
        }
    }

    /** Public because the skin texture itself is fetched the same way. */
    public static byte[] download(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        try (InputStream in = connection.getInputStream()) {
            return readAll(in);
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        return new String(readAll(in), StandardCharsets.UTF_8);
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int count;
        while ((count = in.read(chunk)) != -1) buffer.write(chunk, 0, count);
        return buffer.toByteArray();
    }
}
