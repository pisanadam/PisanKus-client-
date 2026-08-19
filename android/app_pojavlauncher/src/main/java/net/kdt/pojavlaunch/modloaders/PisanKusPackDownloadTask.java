package net.kdt.pojavlaunch.modloaders;

import android.util.Log;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.PisanKusPackInstaller;
import net.kdt.pojavlaunch.PisanKusPacks;
import net.kdt.pojavlaunch.PisanKusSodium;
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
 * Creates a ready-to-play profile for one of the launcher's own packs: the
 * loader for the chosen game version, then the pack's mods in that profile's
 * own folder.
 *
 * The mods go into a game directory of the profile's own rather than the shared
 * one, so installing a pack cannot disturb a profile the player already has —
 * and so two Minecraft versions of the same pack can exist side by side, each
 * with the mod builds that match it.
 *
 * The two loaders are installed very differently, and that is not a choice made
 * here. Fabric publishes its profile as json, so it can be written directly.
 * Forge ships an installer program that has to be run, which on Android means
 * handing it to the Java activity — a separate screen, finishing on its own
 * time. So a Forge pack is installed in two steps and this task handles the
 * second: it looks for the Forge the player already installed.
 */
public class PisanKusPackDownloadTask implements Runnable {
    private static final String TAG = "PisanKusPack";

    private final ModloaderDownloadListener mListener;
    private final PisanKusPacks.Pack mPack;
    private final String mGameVersion;

    public PisanKusPackDownloadTask(ModloaderDownloadListener listener, PisanKusPacks.Pack pack,
                                    String gameVersion) {
        this.mListener = listener;
        this.mPack = pack;
        this.mGameVersion = gameVersion;
    }

    /** Whether the loader this pack needs is already installed for that version. */
    public static String installedForgeVersion(String gameVersion) {
        File versions = new File(Tools.DIR_HOME_VERSION);
        File[] entries = versions.listFiles();
        if (entries == null) return null;
        String newest = null;
        for (File entry : entries) {
            String name = entry.getName();
            if (!entry.isDirectory() || !name.startsWith(gameVersion + "-forge")) continue;
            if (!new File(entry, name + ".json").exists()) continue;
            // More than one Forge build can be installed; the last by name is
            // the newest, since Forge numbers rise.
            if (newest == null || name.compareTo(newest) > 0) newest = name;
        }
        return newest;
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
        String versionId = "forge".equals(mPack.loader)
                ? installedForgeVersion(mGameVersion)
                : installFabric();
        if (versionId == null) return false;

        File modsDir = new File(Tools.DIR_GAME_HOME, mPack.gameDirFor(mGameVersion) + "/mods");
        int skipped = PisanKusPackInstaller.install(mPack, modsDir, mGameVersion, new ProgressReporter());

        // Only now: a profile that points at a folder the install never finished
        // filling would look ready and start without the pack.
        createProfile(versionId);
        if (usesSodium()) PisanKusSodium.allow();
        Log.i(TAG, "Installed " + mPack.id + " for " + mGameVersion + ", " + skipped + " skipped");
        return true;
    }

    private boolean usesSodium() {
        for (PisanKusPacks.Mod mod : mPack.mods) {
            if (PisanKusSodium.isSodium(mod.slug)) return true;
        }
        return false;
    }

    /**
     * Writes the Fabric version json, exactly as the Fabric installer does.
     *
     * The loader build is not asked of the player: picking one is not a decision
     * a pack needs from them, so the newest stable is taken.
     */
    private String installFabric() throws IOException {
        FabricVersion[] loaders = FabriclikeUtils.FABRIC_UTILS.downloadLoaderVersions(mGameVersion);
        if (loaders == null || loaders.length == 0) return null;
        String loaderVersion = loaders[0].version;
        for (FabricVersion loader : loaders) {
            if (loader.stable) {
                loaderVersion = loader.version;
                break;
            }
        }

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
     * Adds the profile, replacing an earlier install of the same pack and
     * version.
     *
     * Re-running the installer is how a player updates a pack, so leaving the
     * old entry behind would grow a list of identical profiles pointing at the
     * same folder.
     */
    private void createProfile(String versionId) {
        LauncherProfiles.load();
        String name = mPack.name + " " + mGameVersion;
        String gameDir = mPack.gameDirFor(mGameVersion);
        String icon = "pisan_optimized";
        for (MinecraftProfile existing : LauncherProfiles.mainProfileJson.profiles.values()) {
            if (gameDir.equals(existing.gameDir)) {
                existing.name = name;
                existing.lastVersionId = versionId;
                existing.icon = icon;
                if (usesSodium()) existing.pojavRendererName = PisanKusSodium.RENDERER;
                LauncherProfiles.write();
                return;
            }
        }
        MinecraftProfile profile = new MinecraftProfile();
        profile.name = name;
        profile.lastVersionId = versionId;
        profile.gameDir = gameDir;
        profile.icon = icon;
        // Only the packs that carry Sodium need the renderer it runs on; forcing
        // it on a pack that does not would be changing a setting for no reason.
        if (usesSodium()) profile.pojavRendererName = PisanKusSodium.RENDERER;
        LauncherProfiles.insertMinecraftProfile(profile);
        LauncherProfiles.write();
    }

    /**
     * Turns the installer's per-mod callbacks into the launcher's progress bar.
     *
     * The loader step is counted as the first of the run, so the bar starts
     * moving before the first mod rather than sitting at zero through it.
     */
    private static class ProgressReporter implements PisanKusPackInstaller.Listener {
        @Override
        public void onModStarted(int index, int total, PisanKusPacks.Mod mod) {
            ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK,
                    (int) (((float) (index - 1) / (float) total) * 100f),
                    R.string.pisan_optimized_progress_mod, index, total, mod.name);
        }

        @Override
        public void onModInstalled(PisanKusPacks.Mod mod, String fileName) {
            Log.i(TAG, "Installed " + mod.slug + " as " + fileName);
        }

        @Override
        public void onModSkipped(PisanKusPacks.Mod mod, String reason) {
            Log.w(TAG, "Skipped " + mod.slug + ": " + reason);
        }
    }
}
