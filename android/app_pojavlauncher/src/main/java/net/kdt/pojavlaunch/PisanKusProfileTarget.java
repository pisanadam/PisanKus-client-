package net.kdt.pojavlaunch;

import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONObject;

import java.io.File;

/**
 * What the selected profile is, in the terms Modrinth understands: a loader, a
 * Minecraft version, and the folder mods go into.
 *
 * A profile stores neither of the first two. It stores the id of a version, and
 * that id is written by whichever installer created it — so the loader is read
 * off the id's shape and the Minecraft version out of the version json, which
 * names it in `inheritsFrom`.
 */
public class PisanKusProfileTarget {
    public final String profileName;
    /** Modrinth's loader tag: fabric, quilt, forge, neoforge — or null for vanilla. */
    public final String loader;
    public final String gameVersion;
    public final File modsDir;

    private PisanKusProfileTarget(String profileName, String loader, String gameVersion, File modsDir) {
        this.profileName = profileName;
        this.loader = loader;
        this.gameVersion = gameVersion;
        this.modsDir = modsDir;
    }

    public boolean loadsMods() {
        return loader != null;
    }

    /** The profile the main menu currently has selected, or null when there is none. */
    public static PisanKusProfileTarget current() {
        LauncherProfiles.load();
        String key = LauncherPreferences.DEFAULT_PREF.getString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, "");
        MinecraftProfile profile = LauncherProfiles.mainProfileJson.profiles.get(key);
        if (profile == null) return null;

        String versionId = profile.lastVersionId == null ? "" : profile.lastVersionId;
        return new PisanKusProfileTarget(
                profile.name == null ? versionId : profile.name,
                loaderOf(versionId),
                gameVersionOf(versionId),
                new File(Tools.getGameDirPath(profile), "mods"));
    }

    /**
     * The loader a version id belongs to.
     *
     * Each installer writes its own shape: Fabric and Quilt prefix the id,
     * Forge appends its name, NeoForge prefixes it without a Minecraft version
     * at all. Anything else is vanilla — including OptiFine, which patches the
     * game rather than loading mods.
     */
    private static String loaderOf(String versionId) {
        String id = versionId.toLowerCase();
        if (id.startsWith("fabric-loader-")) return "fabric";
        if (id.startsWith("quilt-loader-")) return "quilt";
        if (id.startsWith("neoforge-")) return "neoforge";
        if (id.contains("-forge")) return "forge";
        return null;
    }

    /**
     * The Minecraft version a profile actually runs.
     *
     * Read from the version json rather than parsed out of the id: a modded id
     * carries the version in a different place for every loader, and NeoForge's
     * does not carry it at all. `inheritsFrom` is where every one of them puts
     * it, because that is how the game resolves the vanilla files.
     */
    private static String gameVersionOf(String versionId) {
        File json = new File(new File(Tools.DIR_HOME_VERSION, versionId), versionId + ".json");
        try {
            String inherits = new JSONObject(Tools.read(json)).optString("inheritsFrom", null);
            if (inherits != null && !inherits.isEmpty()) return inherits;
        } catch (Exception ignored) {
            // A vanilla profile that has never been launched has no json yet;
            // its id is the version, which is the answer anyway.
        }
        return versionId;
    }
}
