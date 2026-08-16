package net.kdt.pojavlaunch.modloaders.pisan;

import android.util.Log;

import androidx.annotation.Nullable;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeDownloadTask;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModDownloader;
import net.kdt.pojavlaunch.progresskeeper.DownloaderProgressWrapper;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.FileUtils;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Installs the Pisan Optimized pack: Fabric, then the pack's mods, then a
 * profile pointing at both.
 *
 * The profile is written last on purpose. Everything before it can fail, and a
 * failure that leaves no profile behind leaves nothing that looks installed and
 * is not — the half-downloaded instance folder is picked up by the next attempt
 * instead of confusing the player.
 */
public class PisanPackInstallTask implements Runnable {
    private static final String TAG = "PisanPackInstall";

    /**
     * Where the finished install leaves its report for the screen that started it.
     *
     * Handed over through ExtraCore rather than kept on the task because the
     * fragment may well have been torn down and rebuilt — a rotation is enough —
     * by the time the install ends.
     */
    public static final String EXTRA_REPORT = "pisan_pack_report";

    /** Static icon name understood by ProfileIconCache. */
    private static final String PROFILE_ICON = "pisan";

    /** Instances live apart from the shared .minecraft so the pack owns its mods folder. */
    private static final String INSTANCE_PREFIX = "custom_instances/pisan_optimized_";

    /** What this pack put in the mods folder last time, so an upgrade can clean up after itself. */
    private static final String MANIFEST_NAME = "pisan_pack.json";

    private final ModloaderDownloadListener mListener;
    private final String mGameVersion;

    public PisanPackInstallTask(ModloaderDownloadListener listener, String gameVersion) {
        this.mListener = listener;
        this.mGameVersion = gameVersion;
    }

    @Override
    public void run() {
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0,
                R.string.pisan_pack_progress_resolving, PisanPack.NAME);
        try {
            PisanPackResolver.Resolution resolution = runCatching();
            ExtraCore.setValue(EXTRA_REPORT, resolution);
            mListener.onDownloadFinished(null);
        } catch (IOException e) {
            mListener.onDownloadError(e);
        } finally {
            ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
        }
    }

    private PisanPackResolver.Resolution runCatching() throws IOException {
        PisanPackResolver.Resolution resolution = PisanPackResolver.resolve(mGameVersion,
                (name, percent) -> ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK,
                        percent, R.string.pisan_pack_progress_resolving, name));

        String loaderVersion = newestLoaderVersion();
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0,
                R.string.pisan_pack_progress_loader, loaderVersion);
        String versionId = FabriclikeDownloadTask.installVersionJson(
                FabriclikeUtils.FABRIC_UTILS, mGameVersion, loaderVersion);
        if (versionId == null) throw new IOException("Fabric " + mGameVersion + " için okunamadı.");

        String gameDir = INSTANCE_PREFIX + sanitize(mGameVersion);
        File instance = new File(Tools.DIR_GAME_HOME, gameDir);
        installMods(resolution, instance);
        createProfile(versionId, "./" + gameDir);
        return resolution;
    }

    /**
     * The newest loader Fabric publishes for this Minecraft version, preferring
     * stable ones.
     *
     * The screen does not ask which loader to use. A pack is a thing you install
     * without deciding anything, and a player who wants to pick a loader build
     * has the plain Fabric installer for that.
     */
    private String newestLoaderVersion() throws IOException {
        FabricVersion[] versions = FabriclikeUtils.FABRIC_UTILS.downloadLoaderVersions(mGameVersion);
        if (versions == null || versions.length == 0) {
            throw new IOException("Fabric, " + mGameVersion + " sürümü için yükleyici yayımlamamış.");
        }
        for (FabricVersion version : versions) {
            if (version.stable) return version.version;
        }
        return versions[0].version;
    }

    private void installMods(PisanPackResolver.Resolution resolution, File instance) throws IOException {
        File modsDir = new File(instance, "mods");
        FileUtils.ensureDirectory(modsDir);

        Set<String> wanted = new HashSet<>();
        for (PisanPackResolver.ResolvedMod mod : resolution.ready) wanted.add(mod.fileName);
        removeStaleJars(instance, modsDir, wanted);

        ModDownloader downloader = new ModDownloader(instance);
        for (PisanPackResolver.ResolvedMod mod : resolution.ready) {
            downloader.submitDownload(mod.fileSize, "mods/" + mod.fileName, mod.sha1, mod.url);
        }
        downloader.awaitFinish(new DownloaderProgressWrapper(
                R.string.modpack_download_downloading_mods, ProgressLayout.INSTALL_MODPACK));

        writeManifest(instance, resolution, wanted);
    }

    /**
     * Deletes the jars this pack installed last time and no longer wants.
     *
     * Only those: a player who dropped their own mod into the folder keeps it,
     * and a mod that moved to a new file name does not end up installed twice —
     * which is a crash on launch, not an inconvenience.
     */
    private void removeStaleJars(File instance, File modsDir, Set<String> wanted) {
        for (String fileName : readManifestFiles(instance)) {
            if (wanted.contains(fileName)) continue;
            File stale = new File(modsDir, fileName);
            if (stale.isFile() && !stale.delete()) {
                Log.w(TAG, "Failed to remove the outdated jar " + fileName);
            }
        }
    }

    private Set<String> readManifestFiles(File instance) {
        Set<String> files = new HashSet<>();
        File manifest = new File(instance, MANIFEST_NAME);
        if (!manifest.isFile()) return files;
        try {
            JSONObject parsed = new JSONObject(Tools.read(manifest.getAbsolutePath()));
            JSONArray names = parsed.optJSONArray("files");
            if (names == null) return files;
            for (int i = 0; i < names.length(); i++) {
                String name = names.optString(i, null);
                if (name != null) files.add(name);
            }
        } catch (IOException | JSONException e) {
            Log.w(TAG, "Failed to read the previous install manifest", e);
        }
        return files;
    }

    private void writeManifest(File instance, PisanPackResolver.Resolution resolution, Set<String> files) {
        try {
            JSONObject manifest = new JSONObject();
            manifest.put("gameVersion", resolution.gameVersion);
            manifest.put("files", new JSONArray(files));
            Tools.write(new File(instance, MANIFEST_NAME).getAbsolutePath(), manifest.toString());
        } catch (IOException | JSONException e) {
            // The pack is installed either way; without the manifest the next
            // install just cannot tell which jars used to be ours.
            Log.w(TAG, "Failed to write the install manifest", e);
        }
    }

    /**
     * Points a profile at the instance, reusing the one already pointing there.
     *
     * Reinstalling the same Minecraft version is how a player updates the pack,
     * and that must not leave them with a launcher full of profiles all called
     * the same thing.
     */
    private void createProfile(String versionId, String gameDir) {
        LauncherProfiles.load();
        String name = PisanPack.NAME + " " + mGameVersion;

        MinecraftProfile profile = findProfile(gameDir);
        if (profile == null) {
            profile = new MinecraftProfile();
            profile.gameDir = gameDir;
            profile.lastVersionId = versionId;
            profile.name = name;
            profile.icon = PROFILE_ICON;
            LauncherProfiles.insertMinecraftProfile(profile);
        } else {
            profile.lastVersionId = versionId;
            profile.name = name;
            profile.icon = PROFILE_ICON;
        }
        LauncherProfiles.write();
    }

    @Nullable
    private MinecraftProfile findProfile(String gameDir) {
        if (LauncherProfiles.mainProfileJson == null || LauncherProfiles.mainProfileJson.profiles == null) {
            return null;
        }
        for (Map.Entry<String, MinecraftProfile> entry : LauncherProfiles.mainProfileJson.profiles.entrySet()) {
            MinecraftProfile profile = entry.getValue();
            if (profile != null && gameDir.equals(profile.gameDir)) return profile;
        }
        return null;
    }

    private static String sanitize(String name) {
        return name.replaceAll("[\\\\/:*?\"<>| \\t\\n]", "_");
    }
}
