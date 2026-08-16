package net.kdt.pojavlaunch.modloaders.pisan;

import android.util.Log;

import androidx.annotation.Nullable;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.JMinecraftVersionList;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModDownloader;
import net.kdt.pojavlaunch.progresskeeper.DownloaderProgressWrapper;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.tasks.AsyncMinecraftDownloader;
import net.kdt.pojavlaunch.utils.FileUtils;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Queue;
import java.util.Set;

/**
 * Installs a single mod into the profile the player is about to launch.
 *
 * The Pisan Optimized pack builds its own profile and fills it; this is the
 * other half — putting one mod into a profile that already exists. Which
 * profile is not asked: it is the one selected on the main screen, because
 * that is the one the player is looking at and about to press play on.
 */
public class PisanModInstaller {
    private static final String TAG = "PisanModInstaller";

    /** Where a mod would go, and what has to fit for it to be installable. */
    public static class Target {
        public final String profileName;
        public final String gameVersion;
        /** Modrinth loader facet — empty for a vanilla profile, which takes no mods. */
        public final String loader;
        public final File modsDir;

        Target(String profileName, String gameVersion, String loader, File modsDir) {
            this.profileName = profileName;
            this.gameVersion = gameVersion;
            this.loader = loader;
            this.modsDir = modsDir;
        }

        public boolean acceptsMods() {
            return !loader.isEmpty();
        }
    }

    public static class Report {
        public final List<String> installed = new ArrayList<>();
        /** Entries that had nothing for this profile, each already worded for the player. */
        public final List<String> skipped = new ArrayList<>();
    }

    /**
     * Reads the selected profile and works out what it can take.
     *
     * The Minecraft version comes from the version json rather than from the
     * name of the version: a loader's version is called things like
     * "fabric-loader-0.16.9-1.21.1" and picking that apart by hand is a guess,
     * while the json says outright what it inherits from. The name is only used
     * when the json is not on the device yet.
     */
    public static Target currentTarget() throws IOException {
        LauncherProfiles.load();
        MinecraftProfile profile;
        try {
            profile = LauncherProfiles.getCurrentProfile();
        } catch (RuntimeException e) {
            throw new IOException("Seçili profil okunamadı. Ana ekrandan bir profil seçin.", e);
        }

        String versionId = AsyncMinecraftDownloader.normalizeVersionId(profile.lastVersionId);
        if (versionId == null || versionId.isEmpty()) {
            throw new IOException("Profilin Minecraft sürümü belli değil. Profili düzenleyip bir sürüm seçin.");
        }

        String name = profile.name == null || profile.name.isEmpty() ? versionId : profile.name;
        return new Target(name, gameVersionOf(versionId), loaderOf(versionId),
                new File(Tools.getGameDirPath(profile), "mods"));
    }

    private static String gameVersionOf(String versionId) {
        try {
            JMinecraftVersionList.Version info = Tools.getVersionInfo(versionId, true);
            if (info != null && info.inheritsFrom != null && !info.inheritsFrom.isEmpty()) {
                return info.inheritsFrom;
            }
            if (info != null && info.id != null && !info.id.isEmpty()) return info.id;
        } catch (RuntimeException e) {
            // Not installed yet: fall back to reading the name below.
            Log.i(TAG, "No version json for " + versionId + " yet", e);
        }
        return gameVersionFromName(versionId);
    }

    /**
     * Last resort when the version json is not on the device.
     *
     * Loaders name their versions in two shapes — the Minecraft version last
     * ("fabric-loader-0.16.9-1.21.1") or first ("1.20.1-forge-47.2.0") — so
     * whichever end looks like a Minecraft version is the answer.
     */
    private static String gameVersionFromName(String versionId) {
        String[] parts = versionId.split("-");
        String last = parts[parts.length - 1];
        if (looksLikeVersion(last)) return last;
        if (looksLikeVersion(parts[0])) return parts[0];
        return versionId;
    }

    private static boolean looksLikeVersion(String value) {
        return value.matches("^\\d+(\\.\\d+)+$");
    }

    /**
     * The Modrinth loader facet for a version id.
     *
     * NeoForge is checked before Forge on purpose: its name contains the other
     * one, and a NeoForge profile handed Forge builds would install mods that
     * cannot load.
     */
    private static String loaderOf(String versionId) {
        String id = versionId.toLowerCase();
        if (id.contains("neoforge")) return "neoforge";
        if (id.contains("fabric")) return "fabric";
        if (id.contains("quilt")) return "quilt";
        if (id.contains("forge")) return "forge";
        return "";
    }

    /**
     * Downloads one project and whatever it refuses to run without.
     *
     * The mod the player asked for is the only one allowed to fail loudly: if
     * it has no build for this profile there is nothing to install and saying so
     * is the whole answer. A dependency that cannot be found is reported and the
     * rest still goes in — half a dependency tree is better than none, and the
     * report says exactly what is missing.
     */
    public static Report install(ModrinthClient.Project project, Target target) throws IOException {
        FileUtils.ensureDirectory(target.modsDir);
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0,
                R.string.pisan_mods_progress_resolving, project.title);

        Report report = new Report();
        ModDownloader downloader = new ModDownloader(target.modsDir);

        Queue<Pending> pending = new ArrayDeque<>();
        pending.add(new Pending(project.id, project.title, true));
        Set<String> visited = new HashSet<>();

        while (!pending.isEmpty()) {
            Pending entry = pending.remove();
            if (!visited.add(entry.projectId)) continue;

            JSONObject version = ModrinthClient.bestVersion(entry.projectId, target.gameVersion, target.loader);
            ModrinthClient.File file = version == null ? null : ModrinthClient.primaryFile(version);
            if (file == null) {
                if (entry.root) {
                    throw new IOException(entry.name + ", Minecraft " + target.gameVersion + " ("
                            + target.loader + ") için yayınlanmamış.");
                }
                report.skipped.add(name(entry) + " — bu sürüm için yayınlanmamış");
                continue;
            }

            ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0,
                    R.string.pisan_mods_progress_resolving, name(entry));
            downloader.submitDownload(file.size, file.fileName, file.sha1, file.url);
            report.installed.add(name(entry));

            for (String dependency : ModrinthClient.requiredDependencies(version)) {
                if (!visited.contains(dependency)) pending.add(new Pending(dependency, null, false));
            }
        }

        downloader.awaitFinish(new DownloaderProgressWrapper(
                R.string.modpack_download_downloading_mods, ProgressLayout.INSTALL_MODPACK));
        return report;
    }

    /** Dependencies arrive as ids; the report is worth one request to make readable. */
    private static String name(Pending entry) {
        if (entry.name != null) return entry.name;
        try {
            String title = ModrinthClient.projectTitle(entry.projectId);
            if (title != null) return title;
        } catch (IOException e) {
            Log.w(TAG, "Failed to look up the name of " + entry.projectId, e);
        }
        return entry.projectId;
    }

    private static class Pending {
        final String projectId;
        @Nullable final String name;
        /** The one the player picked, as opposed to something it dragged in. */
        final boolean root;

        Pending(String projectId, @Nullable String name, boolean root) {
            this.projectId = projectId;
            this.name = name;
            this.root = root;
        }
    }
}
