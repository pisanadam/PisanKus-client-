package net.kdt.pojavlaunch;

import android.system.Os;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Small per-profile registry for content installed from the Android store.
 *
 * Minecraft itself stores no Modrinth project/version id in the mods folder.
 * Keeping those ids beside the profile is what lets the store distinguish an
 * installed current version from an installed version that has an update.
 */
public final class PisanKusInstalledContent {
    private static final String FILE_NAME = ".pisankus-content.json";

    public static final class Entry {
        public final String projectId;
        public final String versionId;
        public final String versionNumber;
        public final String fileName;
        public final String kind;
        public final boolean enabled;

        private Entry(String projectId, String versionId, String versionNumber,
                      String fileName, String kind, boolean enabled) {
            this.projectId = projectId;
            this.versionId = versionId;
            this.versionNumber = versionNumber;
            this.fileName = fileName;
            this.kind = kind;
            this.enabled = enabled;
        }
    }

    private final File profileDirectory;
    private final File file;
    private final JSONObject entries;

    public PisanKusInstalledContent(File profileDirectory) {
        this.profileDirectory = profileDirectory;
        file = new File(profileDirectory, FILE_NAME);
        JSONObject loaded = new JSONObject();
        try {
            JSONObject document = new JSONObject(Tools.read(file));
            JSONObject stored = document.optJSONObject("entries");
            if (stored != null) loaded = stored;
        } catch (Exception ignored) {
            // A missing or damaged registry must never stop Minecraft or the
            // store. New successful installs rebuild the relevant entries.
        }
        entries = loaded;
    }

    public synchronized Entry get(String projectId) {
        JSONObject value = entries.optJSONObject(projectId);
        if (value == null) return null;
        String versionId = value.optString("versionId", null);
        String fileName = value.optString("fileName", null);
        if (versionId == null || fileName == null) return null;
        return new Entry(
                projectId,
                versionId,
                value.optString("versionNumber", versionId),
                new File(fileName).getName(),
                value.optString("kind", "mod"),
                value.optBoolean("enabled", true)
        );
    }

    public synchronized void put(String projectId, String versionId, String versionNumber,
                                 String fileName, String kind) throws Exception {
        JSONObject value = new JSONObject();
        value.put("versionId", versionId);
        value.put("versionNumber", versionNumber);
        value.put("fileName", new File(fileName).getName());
        value.put("kind", kind);
        value.put("enabled", true);
        value.put("installedAt", System.currentTimeMillis());
        entries.put(projectId, value);
        save();
    }

    private File directoryFor(String kind) {
        if ("resourcepack".equals(kind)) return new File(profileDirectory, "resourcepacks");
        if ("shader".equals(kind)) return new File(profileDirectory, "shaderpacks");
        if ("datapack".equals(kind)) return new File(profileDirectory, "datapacks");
        return new File(profileDirectory, "mods");
    }

    /** Renames the installed file instead of deleting it, matching desktop. */
    public synchronized Entry setEnabled(String projectId, boolean enabled) throws Exception {
        Entry entry = get(projectId);
        if (entry == null || "modpack".equals(entry.kind) || entry.enabled == enabled) return entry;

        File directory = directoryFor(entry.kind);
        File active = new File(directory, entry.fileName);
        File disabled = new File(directory, entry.fileName + ".disabled");
        File source = entry.enabled ? active : disabled;
        File destination = enabled ? active : disabled;
        if (!source.isFile()) {
            if (!destination.isFile()) throw new IllegalStateException("Installed content file is missing");
        } else if (!source.renameTo(destination)) {
            throw new IllegalStateException("Installed content could not be renamed");
        }

        JSONObject value = entries.getJSONObject(projectId);
        value.put("enabled", enabled);
        save();
        return get(projectId);
    }

    private void save() throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Profile directory could not be created");
        }

        JSONObject document = new JSONObject();
        document.put("schemaVersion", 1);
        document.put("entries", entries);
        byte[] bytes = document.toString(2).getBytes(StandardCharsets.UTF_8);
        File temporary = new File(file.getParentFile(), FILE_NAME + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(bytes);
            output.getFD().sync();
        }
        try {
            // Linux rename replaces the destination atomically, so a crash can
            // leave either the old complete registry or the new complete one.
            Os.rename(temporary.getAbsolutePath(), file.getAbsolutePath());
        } catch (Exception error) {
            temporary.delete();
            throw new IllegalStateException("Installed content registry could not be saved", error);
        }
    }
}
