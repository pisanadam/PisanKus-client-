package net.kdt.pojavlaunch.modloaders.pisan;

import android.content.Context;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModDownloader;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModLoader;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import java.io.File;
import java.io.IOException;

/**
 * Installs {@link PisanPack} into a profile of its own.
 *
 * The order matters. Mods are resolved first, because a pack that cannot be installed on
 * the chosen version should say so before anything has been written to disk. The profile
 * is written last, so a failure anywhere leaves no entry pointing at a half-filled
 * instance — a profile that looks installed and is not is worse than none at all.
 */
public class PisanPackDownloadTask implements Runnable {
    /** ExtraCore key the finished report is published under. */
    public static final String REPORT_TAG = "pisan_pack_report";

    private final ModloaderDownloadListener mListener;
    private final Context mContext;
    private final String mGameVersion;

    public PisanPackDownloadTask(ModloaderDownloadListener listener, Context context, String gameVersion) {
        this.mListener = listener;
        this.mContext = context.getApplicationContext();
        this.mGameVersion = gameVersion;
    }

    @Override
    public void run() {
        try {
            ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.pisankus_pack_resolving);
            PisanPackUtils.Resolution resolution = PisanPackUtils.resolve(mGameVersion);

            ModLoader loader = installLoader();

            String instanceFolder = PisanPack.INSTANCE_PREFIX + "-" + mGameVersion;
            File instanceDirectory = new File(Tools.DIR_GAME_HOME, "custom_instances/" + instanceFolder);
            downloadMods(resolution, instanceDirectory);

            writeProfile(loader, instanceFolder);

            ExtraCore.setValue(REPORT_TAG, resolution);
            mListener.onDownloadFinished(null);
        } catch (PisanPackUtils.EssentialMissingException e) {
            mListener.onDownloadError(new IOException(
                    mContext.getString(R.string.pisankus_pack_essential_missing, e.modName, mGameVersion), e));
        } catch (IOException e) {
            mListener.onDownloadError(e);
        } finally {
            ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
        }
    }

    /**
     * Puts the Fabric version JSON in place and returns what the profile should point at.
     *
     * The loader version is picked here rather than asked of the player: the pack is
     * built around one loader, and the newest stable build of it is the only answer that
     * is ever right. The player picks the Minecraft version, which is the choice that
     * actually changes what gets installed.
     */
    private ModLoader installLoader() throws IOException {
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.pisankus_pack_loader);

        FabricVersion[] loaderVersions = FabriclikeUtils.FABRIC_UTILS.downloadLoaderVersions(mGameVersion);
        if (loaderVersions == null || loaderVersions.length == 0) {
            throw new IOException(mContext.getString(R.string.pisankus_pack_loader_failed));
        }

        String loaderVersion = loaderVersions[0].version;
        for (FabricVersion version : loaderVersions) {
            if (version.stable) {
                loaderVersion = version.version;
                break;
            }
        }

        ModLoader loader = new ModLoader(ModLoader.MOD_LOADER_FABRIC, loaderVersion, mGameVersion);
        LoaderResult result = new LoaderResult();
        // Fabric needs no GUI installer, so its task is just a download and a file write.
        // We are already off the main thread, so it runs here instead of on another one.
        loader.getDownloadTask(result).run();
        result.rethrow(mContext);
        return loader;
    }

    /**
     * Downloads every resolved file into the instance's mods folder.
     *
     * A file that will not download after the downloader's own retries fails the whole
     * install. That is deliberate: the alternative is a profile silently missing the mod
     * the player installed the pack for, which only shows up as a crash on launch.
     */
    private void downloadMods(PisanPackUtils.Resolution resolution, File instanceDirectory) throws IOException {
        ModDownloader downloader = new ModDownloader(new File(instanceDirectory, "mods"), true);
        for (PisanPackUtils.ResolvedMod mod : resolution.ready) {
            downloader.submitDownload(mod.fileSize, mod.fileName, mod.sha1, mod.url);
        }
        downloader.awaitFinish((current, max) -> ProgressKeeper.submitProgress(
                ProgressLayout.INSTALL_MODPACK,
                (int) Math.max((float) current / max * 100, 0),
                R.string.pisankus_pack_downloading, current, max));
    }

    private void writeProfile(ModLoader loader, String instanceFolder) {
        LauncherProfiles.load();
        String gameDir = "./custom_instances/" + instanceFolder;

        // Installing the same version again should refresh the profile that is already
        // there. Inserting a second one would leave two entries fighting over one folder.
        MinecraftProfile profile = null;
        for (MinecraftProfile existing : LauncherProfiles.mainProfileJson.profiles.values()) {
            if (gameDir.equals(existing.gameDir)) {
                profile = existing;
                break;
            }
        }

        boolean isNewProfile = profile == null;
        if (isNewProfile) profile = new MinecraftProfile();
        profile.name = PisanPack.NAME + " " + mGameVersion;
        profile.gameDir = gameDir;
        profile.lastVersionId = loader.getVersionId();
        profile.icon = "fabric";

        if (isNewProfile) LauncherProfiles.insertMinecraftProfile(profile);
        LauncherProfiles.write();
    }

    /**
     * Collects the loader task's answer so it can be raised on this thread.
     *
     * The mod loader tasks report through a listener because they normally run on one of
     * their own; here the result is needed inline, before the mods are downloaded.
     */
    private static class LoaderResult implements ModloaderDownloadListener {
        private Exception mError;
        private boolean mNoData;

        @Override
        public void onDownloadFinished(File downloadedFile) {}

        @Override
        public void onDataNotAvailable() {
            mNoData = true;
        }

        @Override
        public void onDownloadError(Exception e) {
            mError = e;
        }

        void rethrow(Context context) throws IOException {
            if (mError instanceof IOException) throw (IOException) mError;
            if (mError != null) throw new IOException(mError);
            if (mNoData) throw new IOException(context.getString(R.string.pisankus_pack_loader_failed));
        }
    }
}
