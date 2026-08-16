package net.kdt.pojavlaunch.skins;

import android.util.Log;

import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.utils.FileUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The player's own collection of skins, kept on the device.
 *
 * Mojang stores one skin per account and rate-limits changing it, so a player
 * who likes three of them has nowhere to keep the other two. This is that
 * place: the bytes are copied in, not linked, because a skin that lives at
 * someone else's url stops existing when they delete it.
 *
 * It sits beside the launcher's own files rather than inside {@code .minecraft}
 * — the collection belongs to the launcher, and moving or wiping the game
 * directory should not take it along.
 */
public class SkinLibrary {
    private static final String TAG = "SkinLibrary";
    private static final String INDEX_NAME = "index.json";

    public static class Entry {
        public final String id;
        public final String name;
        public final String variant;
        public final String fileName;
        public final long addedAt;

        Entry(String id, String name, String variant, String fileName, long addedAt) {
            this.id = id;
            this.name = name;
            this.variant = variant;
            this.fileName = fileName;
            this.addedAt = addedAt;
        }

        JSONObject toJson() throws JSONException {
            JSONObject json = new JSONObject();
            json.put("id", id);
            json.put("name", name);
            json.put("variant", variant);
            json.put("fileName", fileName);
            json.put("addedAt", addedAt);
            return json;
        }
    }

    public static File directory() {
        return new File(Tools.DIR_GAME_HOME, "skins");
    }

    public static File file(Entry entry) {
        return new File(directory(), entry.fileName);
    }

    /** Newest first, which is the order a player looks for a skin they just added. */
    public static List<Entry> list() {
        List<Entry> entries = new ArrayList<>();
        File index = new File(directory(), INDEX_NAME);
        if (!index.isFile()) return entries;

        try {
            JSONArray array = new JSONArray(Tools.read(index.getAbsolutePath()));
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) continue;
                Entry entry = new Entry(
                        item.optString("id"),
                        item.optString("name", "Skin"),
                        SkinApi.SLIM.equals(item.optString("variant")) ? SkinApi.SLIM : SkinApi.CLASSIC,
                        item.optString("fileName"),
                        item.optLong("addedAt"));
                // A missing file means the collection outlived its own storage;
                // showing an entry that cannot be applied helps nobody.
                if (file(entry).isFile()) entries.add(entry);
            }
        } catch (IOException | JSONException e) {
            Log.w(TAG, "Failed to read the skin library", e);
        }
        return entries;
    }

    /** Copies a PNG in. The caller has already checked that Minecraft will take it. */
    public static Entry save(byte[] png, String name, String variant) throws IOException {
        SkinApi.validate(png);

        String id = UUID.randomUUID().toString();
        Entry entry = new Entry(id, name, variant, id + ".png", System.currentTimeMillis());

        FileUtils.ensureDirectory(directory());
        try (FileOutputStream out = new FileOutputStream(file(entry))) {
            out.write(png);
        }

        List<Entry> entries = list();
        entries.add(0, entry);
        write(entries);
        return entry;
    }

    public static void remove(String id) {
        List<Entry> kept = new ArrayList<>();
        for (Entry entry : list()) {
            if (entry.id.equals(id)) {
                if (!file(entry).delete()) Log.w(TAG, "Failed to delete " + entry.fileName);
            } else {
                kept.add(entry);
            }
        }
        write(kept);
    }

    private static void write(List<Entry> entries) {
        try {
            JSONArray array = new JSONArray();
            for (Entry entry : entries) array.put(entry.toJson());
            FileUtils.ensureDirectory(directory());
            Tools.write(new File(directory(), INDEX_NAME).getAbsolutePath(), array.toString());
        } catch (IOException | JSONException e) {
            Log.w(TAG, "Failed to write the skin library index", e);
        }
    }
}
