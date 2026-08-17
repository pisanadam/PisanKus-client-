package net.kdt.pojavlaunch.modloaders;

import android.util.Log;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.PisanOptimizedInstaller;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.DownloadUtils;
import net.kdt.pojavlaunch.utils.FileUtils;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * Creates a ready-to-play Pisan Optimized profile: Fabric for the chosen game
 * version, then the pack's mods in that profile's own folder.
 *
 * The mods go into a game directory of the profile's own rather than the shared
 * one, so installing the pack cannot disturb a profile the player already has —
 * and so two Minecraft versions of the pack can exist side by side, each with
 * the mod builds that match it.
 */
public class PisanOptimizedDownloadTask implements Runnable {
    private static final String TAG = "PisanOptimized";

    private final ModloaderDownloadListener mListener;
    private final String mGameVersion;

    public PisanOptimizedDownloadTask(ModloaderDownloadListener listener, String gameVersion) {
        this.mListener = listener;
        this.mGameVersion = gameVersion;
    }

    /** Where a given version of the pack lives, relative to the game home. */
    public static String gameDirFor(String gameVersion) {
        return "./custom_instances/pisan_optimized_" + gameVersion.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    @Override
    public void run() {
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.pisan_optimized_progress_loader);
        try {
            if (runCatching()) mListener.onDownloadFinished(null);
            else mListener.onDataNotAvailable();
        } catch (IOException e) {
            mListener.onDownloadError(e);
        }
        ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
    }

    private boolean runCatching() throws IOException {
        String loaderVersion = newestLoaderVersion();
        if (loaderVersion == null) return false;

        String versionId = installFabric(loaderVersion);
        if (versionId == null) return false;

        File modsDir = new File(Tools.DIR_GAME_HOME, gameDirFor(mGameVersion) + "/mods");
        int skipped = PisanOptimizedInstaller.install(modsDir, mGameVersion, new ProgressReporter());

        // Only now: a profile that points at a folder the install never finished
        // filling would look ready and start without the pack.
        createProfile(versionId);
        Log.i(TAG, "Installed for " + mGameVersion + ", " + skipped + " mod(s) skipped");
        return true;
    }

    /**
     * The newest Fabric loader for the chosen version, preferring a stable one.
     *
     * Fabric returns loaders newest first. Unlike the plain Fabric screen the
     * player is not asked to choose here — picking a loader build is not a
     * decision the pack needs from them.
     */
    private String newestLoaderVersion() throws IOException {
        FabricVersion[] loaders = FabriclikeUtils.FABRIC_UTILS.downloadLoaderVersions(mGameVersion);
        if (loaders == null || loaders.length == 0) return null;
        for (FabricVersion loader : loaders) {
            if (loader.stable) return loader.version;
        }
        return loaders[0].version;
    }

    /** Writes the Fabric version json, exactly as the Fabric installer does. */
    private String installFabric(String loaderVersion) throws IOException {
        String fabricJson = DownloadUtils.downloadString(
                FabriclikeUtils.FABRIC_UTILS.createJsonDownloadUrl(mGameVersion, loaderVersion));
        String versionId;
        try {
            versionId = new JSONObject(fabricJson).getString("id");
        } catch (JSONException e) {
            Log.e(TAG, "Fabric meta could not be read", e);
            return null;
        }
        File versionJsonDir = new File(Tools.DIR_HOME_VERSION, versionId);
        FileUtils.ensureDirectory(versionJsonDir);
        Tools.write(new File(versionJsonDir, versionId + ".json").getAbsolutePath(), fabricJson);
        return versionId;
    }

    /**
     * Adds the profile, replacing an earlier install of the same game version.
     *
     * Re-running the installer is how a player updates the pack, so leaving the
     * old entry behind would grow a list of identical profiles pointing at the
     * same folder.
     */
    private void createProfile(String versionId) {
        LauncherProfiles.load();
        String name = "Pisan Optimized " + mGameVersion;
        String gameDir = gameDirFor(mGameVersion);
        for (MinecraftProfile existing : LauncherProfiles.mainProfileJson.profiles.values()) {
            if (gameDir.equals(existing.gameDir)) {
                existing.name = name;
                existing.lastVersionId = versionId;
                existing.icon = "pisan_optimized";
                LauncherProfiles.write();
                return;
            }
        }
        MinecraftProfile profile = new MinecraftProfile();
        profile.name = name;
        profile.lastVersionId = versionId;
        profile.gameDir = gameDir;
        profile.icon = "pisan_optimized";
        LauncherProfiles.insertMinecraftProfile(profile);
        LauncherProfiles.write();
    }

    /**
     * Turns the installer's per-mod callbacks into the launcher's progress bar.
     *
     * The loader step is counted as the first of the run, so the bar starts
     * moving before the first mod rather than sitting at zero through it.
     */
    private static class ProgressReporter implements PisanOptimizedInstaller.Listener {
        @Override
        public void onModStarted(int index, int total, PisanOptimizedInstaller.Mod mod) {
            ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK,
                    (int) (((float) (index - 1) / (float) total) * 100f),
                    R.string.pisan_optimized_progress_mod, index, total, mod.name);
        }

        @Override
        public void onModInstalled(PisanOptimizedInstaller.Mod mod, String fileName) {
            Log.i(TAG, "Installed " + mod.slug + " as " + fileName);
        }

        @Override
        public void onModSkipped(PisanOptimizedInstaller.Mod mod, String reason) {
            Log.w(TAG, "Skipped " + mod.slug + ": " + reason);
        }
    }
}
