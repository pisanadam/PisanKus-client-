package net.kdt.pojavlaunch;

import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * What Sodium needs before it will run on this launcher.
 *
 * Sodium is written for desktop OpenGL and refuses to start under
 * PojavLauncher-derived launchers on purpose — it detects the launcher and
 * throws. Three separate things stand in the way, and a player has no way of
 * guessing any of them:
 *
 * <ol>
 *   <li><b>The mod's own check.</b> Removed by Podium, a mixin published for
 *       exactly this, which is why it is installed alongside Sodium.</li>
 *   <li><b>The renderer.</b> The GL4ES-based translations cannot carry Sodium;
 *       MobileGlues is the one bundled in this build that can.</li>
 *   <li><b>The launcher's own refusal.</b> Upstream blocks play with Sodium
 *       installed and offers only to delete it, behind a switch buried in the
 *       experimental settings.</li>
 * </ol>
 *
 * The launcher already handles a fourth piece on its own: at launch it writes
 * Sodium's mixin overrides and passes {@code -Dsodium.checks.issue2561=false}.
 */
public class PisanKusSodium {
    /** Sodium and the forks that carry the same check, as upstream names them. */
    private static final String[] FAMILY = {"sodium", "embeddium", "rubidium", "xenon"};

    /** The Modrinth project that removes Sodium's launcher check. */
    public static final String PATCH_SLUG = "podium";

    /**
     * The renderer Sodium works with.
     *
     * Zink is the other Vulkan-backed candidate and is the one specifically
     * warned against for Sodium; LTW would also do but is not bundled here.
     * A device that cannot run MobileGlues falls back on its own at launch, so
     * this is a preference rather than a promise.
     */
    public static final String RENDERER = "opengles_mobileglues";

    public static boolean isSodium(String slug) {
        if (slug == null) return false;
        String name = slug.toLowerCase();
        for (String candidate : FAMILY) {
            if (name.contains(candidate)) return true;
        }
        return false;
    }

    /**
     * Installs the launcher-check patch next to Sodium.
     *
     * Returns the file name, or null when the patch has no build for this
     * version — which is the case below 1.20.1, where the Sodium builds predate
     * the check and need no patch.
     */
    public static String installPatch(File modsDir, String gameVersion) throws IOException {
        JSONObject version = PisanKusModrinth.latestVersion(PATCH_SLUG, "fabric", gameVersion);
        if (version == null) return null;
        return PisanKusModrinth.downloadPrimaryFile(version, modsDir);
    }

    /**
     * Points one profile at the renderer Sodium can run on.
     *
     * Keyed rather than matched on the game directory, because a profile made
     * by the plain Fabric installer has none of its own.
     */
    public static void useRendererFor(String profileKey) {
        if (profileKey == null) return;
        LauncherProfiles.load();
        MinecraftProfile profile = LauncherProfiles.mainProfileJson.profiles.get(profileKey);
        if (profile == null) return;
        profile.pojavRendererName = RENDERER;
        LauncherProfiles.write();
    }

    /**
     * Lifts the launcher's block on starting a game with Sodium installed.
     *
     * The gate exists to keep people from installing Sodium by accident and
     * then asking for support — reasonable for a general launcher. It is not
     * our situation: when PisanKus puts Sodium somewhere it also puts the patch
     * and the renderer there, so the block would only walk the player into a
     * wall built for someone else's problem.
     */
    public static void allow() {
        LauncherPreferences.DEFAULT_PREF.edit().putBoolean("sodium_override", true).apply();
    }
}
