package net.kdt.pojavlaunch;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * Downloads a pack's mods into a profile's mods folder.
 *
 * The list is resolved per game version rather than pinned: a mod's file for
 * 1.20.1 is not the file for 26.2, and Modrinth is the only thing that knows
 * which is which. Asking it per version is also what keeps a pack working when
 * a new Minecraft release lands, without anyone editing a list of file names.
 */
public class PisanKusPackInstaller {

    public interface Listener {
        /** {@code index} is 1-based; {@code total} is the whole set, including any that fail. */
        void onModStarted(int index, int total, PisanKusPacks.Mod mod);
        void onModInstalled(PisanKusPacks.Mod mod, String fileName);
        /** A mod with no build for this version is skipped, not fatal. */
        void onModSkipped(PisanKusPacks.Mod mod, String reason);
    }

    /** Raised when a mod the pack cannot do without has no build for the chosen version. */
    public static class EssentialMissingException extends IOException {
        public final PisanKusPacks.Mod mod;

        EssentialMissingException(PisanKusPacks.Mod mod, String gameVersion) {
            super(PisanKusText.get(R.string.pisan_pack_mod_unpublished, mod.name, gameVersion));
            this.mod = mod;
        }
    }

    /**
     * Downloads every mod that has a build for this loader and game version, and
     * returns how many were skipped.
     *
     * A missing mod is skipped rather than aborting the run: a pack spans dozens
     * of projects that update on their own schedules, and on the day a new
     * Minecraft version lands most of them will be ready while a few are not.
     * Stopping at the first gap would mean nothing installs at all. The
     * essential entries are the exception — without those the profile is not the
     * pack the player asked for.
     *
     * Blocking; call it off the main thread.
     */
    public static int install(PisanKusPacks.Pack pack, File modsDir, String gameVersion,
                              Listener listener) throws IOException {
        if (!modsDir.exists() && !modsDir.mkdirs()) {
            throw new IOException(PisanKusText.get(R.string.pisan_pack_mods_dir_failed, modsDir));
        }

        int skipped = 0;
        for (int i = 0; i < pack.mods.length; i++) {
            PisanKusPacks.Mod mod = pack.mods[i];
            listener.onModStarted(i + 1, pack.mods.length, mod);
            JSONObject version;
            try {
                version = PisanKusModrinth.latestVersion(mod.slug, pack.loader, gameVersion);
            } catch (Exception e) {
                if (mod.essential) {
                    throw new IOException(PisanKusText.get(R.string.pisan_pack_mod_download_failed, mod.name), e);
                }
                listener.onModSkipped(mod, describe(e));
                skipped++;
                continue;
            }
            if (version == null) {
                // Resource packs travel with the pack but are published without a
                // loader, so a second ask without one is not a fallback — it is
                // the right question for them.
                try {
                    version = PisanKusModrinth.latestVersion(mod.slug, null, gameVersion);
                } catch (Exception ignored) {
                    version = null;
                }
            }
            if (version == null) {
                if (mod.essential) throw new EssentialMissingException(mod, gameVersion);
                listener.onModSkipped(mod, PisanKusText.get(R.string.pisan_pack_no_version_for, gameVersion));
                skipped++;
                continue;
            }
            try {
                listener.onModInstalled(mod, PisanKusModrinth.downloadPrimaryFile(version, modsDir));
            } catch (Exception e) {
                if (mod.essential) {
                    throw new IOException(PisanKusText.get(R.string.pisan_pack_mod_download_failed, mod.name), e);
                }
                listener.onModSkipped(mod, describe(e));
                skipped++;
            }
        }
        return skipped;
    }

    private static String describe(Exception e) {
        return e.getMessage() == null ? e.toString() : e.getMessage();
    }
}
