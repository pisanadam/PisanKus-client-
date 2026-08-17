package net.kdt.pojavlaunch;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * Installs the Pisan Optimized mod set into a profile's mods folder.
 *
 * The same list the desktop launcher ships, resolved per game version rather
 * than pinned: a mod's file for 1.21.1 is not the file for 26.2, and Modrinth
 * is the only thing that knows which is which. Asking it per version is also
 * what keeps the pack working when a new Minecraft release lands, without
 * anyone editing a list of file names.
 */
public class PisanOptimizedInstaller {

    public static class Mod {
        public final String slug;
        public final String name;
        /** A pack without this mod is not worth installing. */
        public final boolean essential;

        Mod(String slug, String name, boolean essential) {
            this.slug = slug;
            this.name = name;
            this.essential = essential;
        }
    }

    private static Mod mod(String slug, String name) {
        return new Mod(slug, name, false);
    }

    private static Mod essential(String slug, String name) {
        return new Mod(slug, name, true);
    }

    /**
     * Ordered by what depends on what, then by how much each one matters.
     *
     * Libraries first on purpose: every one of them is a required dependency of
     * something further down, so installing them up front means a later mod
     * finds its dependency already present.
     *
     * Kept in step with the desktop launcher's list in
     * {@code src/shared/curatedPack.ts} — the same pack, so the two products
     * install the same thing.
     */
    public static final Mod[] MODS = {
            // Libraries
            essential("fabric-api", "Fabric API"),
            mod("fabric-language-kotlin", "Fabric Language Kotlin"),
            mod("cloth-config", "Cloth Config"),
            mod("yacl", "YetAnotherConfigLib"),
            mod("placeholder-api", "Placeholder API"),

            // Performance
            essential("sodium", "Sodium"),
            mod("lithium", "Lithium"),
            mod("ferrite-core", "FerriteCore"),
            mod("immediatelyfast", "ImmediatelyFast"),
            mod("entityculling", "Entity Culling"),
            mod("moreculling", "More Culling"),
            mod("sodium-extra", "Sodium Extra"),
            mod("krypton", "Krypton"),
            mod("c2me-fabric", "C2ME"),
            mod("vmp-fabric", "Very Many Players"),
            mod("scalablelux", "ScalableLux"),
            mod("threadtweak", "ThreadTweak"),
            mod("dynamic-fps", "Dynamic FPS"),
            mod("fastquit", "FastQuit"),
            mod("modernfix", "ModernFix"),
            mod("noisium", "Noisium"),
            mod("bobby", "Bobby"),

            // Quality of life
            mod("modmenu", "Mod Menu"),
            mod("reeses-sodium-options", "Reese's Sodium Options"),
            mod("zoomify", "Zoomify"),
            mod("appleskin", "AppleSkin"),
            mod("mouse-tweaks", "Mouse Tweaks"),
            mod("3dskinlayers", "3D Skin Layers"),
            mod("no-chat-reports", "No Chat Reports"),
            mod("simple-voice-chat", "Simple Voice Chat"),
            mod("controlify", "Controlify")
    };

    public interface Listener {
        /** {@code index} is 1-based; {@code total} is the whole set, including any that fail. */
        void onModStarted(int index, int total, Mod mod);
        void onModInstalled(Mod mod, String fileName);
        /** A mod with no build for this version is skipped, not fatal. */
        void onModSkipped(Mod mod, String reason);
    }

    /** Raised when a mod the pack cannot do without has no build for the chosen version. */
    public static class EssentialMissingException extends IOException {
        public final Mod mod;

        EssentialMissingException(Mod mod, String gameVersion) {
            super(mod.name + " " + gameVersion + " için yayınlanmamış");
            this.mod = mod;
        }
    }

    /** How many mods a full run installs, for progress and for the description text. */
    public static int modCount() {
        return MODS.length;
    }

    /**
     * Downloads every mod that has a Fabric build for {@code gameVersion} into
     * {@code modsDir}, and returns how many were skipped.
     *
     * A missing mod is skipped rather than aborting the run: the pack spans
     * thirty-odd projects that update on their own schedules, and on the day a
     * new Minecraft version lands most of them will be ready while a few are
     * not. Stopping at the first gap would mean nothing installs at all. The
     * two essential entries are the exception — without Fabric API and Sodium
     * the profile is not the pack the player asked for, so those do abort.
     *
     * Blocking; call it off the main thread.
     */
    public static int install(File modsDir, String gameVersion, Listener listener) throws IOException {
        if (!modsDir.exists() && !modsDir.mkdirs()) {
            throw new IOException("Mod klasörü oluşturulamadı: " + modsDir);
        }

        int skipped = 0;
        for (int i = 0; i < MODS.length; i++) {
            Mod mod = MODS[i];
            listener.onModStarted(i + 1, MODS.length, mod);
            JSONObject version;
            try {
                version = latestVersion(mod.slug, gameVersion);
            } catch (EssentialMissingException e) {
                throw e;
            } catch (Exception e) {
                if (mod.essential) throw new IOException(mod.name + " indirilemedi", e);
                listener.onModSkipped(mod, describe(e));
                skipped++;
                continue;
            }
            if (version == null) {
                if (mod.essential) throw new EssentialMissingException(mod, gameVersion);
                listener.onModSkipped(mod, gameVersion + " için sürüm yok");
                skipped++;
                continue;
            }
            try {
                listener.onModInstalled(mod, download(version, modsDir));
            } catch (Exception e) {
                if (mod.essential) throw new IOException(mod.name + " indirilemedi", e);
                listener.onModSkipped(mod, describe(e));
                skipped++;
            }
        }
        return skipped;
    }

    private static String describe(Exception e) {
        return e.getMessage() == null ? e.toString() : e.getMessage();
    }

    /** The pack is Fabric only, so the loader is not a parameter here. */
    private static JSONObject latestVersion(String slug, String gameVersion) throws IOException {
        return PisanKusModrinth.latestVersion(slug, "fabric", gameVersion);
    }

    private static String download(JSONObject version, File modsDir) throws IOException {
        return PisanKusModrinth.downloadPrimaryFile(version, modsDir);
    }
}
