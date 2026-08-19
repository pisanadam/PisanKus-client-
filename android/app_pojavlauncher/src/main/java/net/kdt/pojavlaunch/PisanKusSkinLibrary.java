package net.kdt.pojavlaunch;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The player's own saved skins, as the desktop launcher keeps them.
 *
 * The bytes are copied in, not linked: a skin picked from the gallery can be
 * deleted or moved by the phone at any time, and a library of dead links would
 * be worse than none. Stored in the app's own folder rather than the game
 * directory — the library belongs to the launcher, and moving the game
 * directory should not lose it.
 */
public class PisanKusSkinLibrary {
    private static final String INDEX = "library.json";

    public static class Entry {
        public final String id;
        public final String name;
        public final String variant;
        public final long addedAt;

        Entry(String id, String name, String variant, long addedAt) {
            this.id = id;
            this.name = name;
            this.variant = variant;
            this.addedAt = addedAt;
        }
    }

    private static File dir(Context context) {
        return new File(context.getFilesDir(), "skins");
    }

    private static File file(Context context, String id) {
        return new File(dir(context), id + ".png");
    }

    /** Newest first, which is the order a player looks for a skin in. */
    public static List<Entry> list(Context context) {
        List<Entry> entries = new ArrayList<>();
        File index = new File(dir(context), INDEX);
        if (!index.exists()) return entries;
        try {
            JSONArray array = new JSONArray(Tools.read(index));
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id");
                // An entry whose file went missing would fail on apply; drop it
                // from the list instead of showing a skin that cannot be used.
                if (!file(context, id).exists()) continue;
                entries.add(new Entry(id, item.optString("name", id),
                        item.optString("variant", PisanKusSkins.CLASSIC),
                        item.optLong("addedAt")));
            }
        } catch (Exception ignored) {
            // A damaged index is not worth an error screen; the folder is a
            // convenience, and it rebuilds as soon as something is saved.
        }
        return entries;
    }

    public static Entry add(Context context, byte[] png, String name, String variant) throws IOException {
        PisanKusSkins.assertValidSkin(png);
        File dir = dir(context);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException(PisanKusText.get(R.string.pisan_skin_library_dir_failed));

        Entry entry = new Entry(UUID.randomUUID().toString(), cleanName(name), variant, System.currentTimeMillis());
        try (FileOutputStream out = new FileOutputStream(file(context, entry.id))) {
            out.write(png);
        }

        List<Entry> entries = list(context);
        entries.add(0, entry);
        write(context, entries);
        return entry;
    }

    public static void remove(Context context, Entry entry) {
        //noinspection ResultOfMethodCallIgnored
        file(context, entry.id).delete();
        List<Entry> entries = list(context);
        entries.removeIf(candidate -> candidate.id.equals(entry.id));
        write(context, entries);
    }

    public static byte[] bytes(Context context, Entry entry) throws IOException {
        File file = file(context, entry.id);
        byte[] data = new byte[(int) file.length()];
        try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
            in.readFully(data);
        }
        return data;
    }

    private static void write(Context context, List<Entry> entries) {
        JSONArray array = new JSONArray();
        try {
            for (Entry entry : entries) {
                JSONObject item = new JSONObject();
                item.put("id", entry.id);
                item.put("name", entry.name);
                item.put("variant", entry.variant);
                item.put("addedAt", entry.addedAt);
                array.put(item);
            }
            Tools.write(new File(dir(context), INDEX).getAbsolutePath(), array.toString());
        } catch (Exception ignored) {
            // Same reasoning as above: the library is a convenience.
        }
    }

    /** Gallery names arrive as whole paths on some devices; keep the readable part. */
    private static String cleanName(String name) {
        if (name == null || name.isEmpty()) return "Skin";
        String base = new File(name).getName().replaceAll("(?i)\\.png$", "");
        return base.isEmpty() ? "Skin" : base;
    }
}
