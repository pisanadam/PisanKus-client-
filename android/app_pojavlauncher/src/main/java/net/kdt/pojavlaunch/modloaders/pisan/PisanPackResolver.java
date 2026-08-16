package net.kdt.pojavlaunch.modloaders.pisan;

import android.util.Log;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.utils.DownloadUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Turns the pack's list of slugs into the exact files to download.
 *
 * Nothing here writes to disk. Resolution is separated from installation on
 * purpose: it is the part that can decide the pack does not fit the chosen
 * Minecraft version, and it is better to find that out before a single jar has
 * landed in a profile.
 */
public class PisanPackResolver {
    private static final String TAG = "PisanPackResolver";
    private static final String API = "https://api.modrinth.com/v2";

    /** Minecraft release versions — snapshots and April Fools' jokes need not apply. */
    private static final Pattern RELEASE_VERSION = Pattern.compile("^\\d+\\.\\d+(\\.\\d+)?$");

    /** Shown for jars nobody asked for by name, pulled in because a pack mod needs them. */
    private static final String DEPENDENCY_ROLE = "Paketteki bir modun gerektirdiği kütüphane";

    /** One entry, resolved to the exact build that fits the chosen version. */
    public static class ResolvedMod {
        public final String projectId;
        /** Filled in from Modrinth for dependencies, which the pack never named. */
        public String name;
        public final String role;
        public final String fileName;
        public final String url;
        @Nullable public final String sha1;
        public final int fileSize;

        ResolvedMod(String projectId, String name, String role, String fileName, String url,
                    @Nullable String sha1, int fileSize) {
            this.projectId = projectId;
            this.name = name;
            this.role = role;
            this.fileName = fileName;
            this.url = url;
            this.sha1 = sha1;
            this.fileSize = fileSize;
        }
    }

    /** An entry with no build for this version, and why. */
    public static class SkippedMod {
        public final String name;
        public final String reason;

        SkippedMod(String name, String reason) {
            this.name = name;
            this.reason = reason;
        }
    }

    public static class Resolution {
        public final String gameVersion;
        public final List<ResolvedMod> ready;
        public final List<SkippedMod> skipped;

        Resolution(String gameVersion, List<ResolvedMod> ready, List<SkippedMod> skipped) {
            this.gameVersion = gameVersion;
            this.ready = ready;
            this.skipped = skipped;
        }
    }

    /**
     * Told which entry is being looked up, so a resolution that takes half a
     * minute of sequential requests does not look like a frozen screen.
     */
    public interface ResolveListener {
        void onResolving(String name, int percent);
    }

    /** A project waiting to be resolved: either a pack entry or something one of them needs. */
    private static class Pending {
        final String projectId;
        final String name;
        final String role;
        final boolean essential;

        Pending(String projectId, String name, String role, boolean essential) {
            this.projectId = projectId;
            this.name = name;
            this.role = role;
            this.essential = essential;
        }
    }

    /**
     * Minecraft versions the pack can be installed on, newest first.
     *
     * Only the versions every essential mod supports, intersected with the ones
     * Fabric itself can run: the rest of the pack is allowed to be missing, but
     * a version without Sodium or without a loader is not a version this pack
     * can be installed on.
     */
    public static List<String> supportedVersions() throws IOException {
        List<String> essentialSlugs = new ArrayList<>();
        for (PisanPack.Mod mod : PisanPack.MODS) {
            if (mod.essential) essentialSlugs.add(mod.slug);
        }

        JSONArray projects = getArray(API + "/projects?ids=" + encode(jsonArray(essentialSlugs)));
        Set<String> shared = null;
        for (int i = 0; i < projects.length(); i++) {
            JSONObject project = projects.optJSONObject(i);
            if (project == null) continue;
            Set<String> supported = new LinkedHashSet<>();
            JSONArray gameVersions = project.optJSONArray("game_versions");
            if (gameVersions == null) continue;
            for (int j = 0; j < gameVersions.length(); j++) {
                String version = gameVersions.optString(j, "");
                if (RELEASE_VERSION.matcher(version).matches()) supported.add(version);
            }
            if (shared == null) shared = supported;
            else shared.retainAll(supported);
        }
        if (shared == null) shared = new LinkedHashSet<>();

        Set<String> loaderVersions = fabricGameVersions();
        if (loaderVersions != null) shared.retainAll(loaderVersions);

        List<String> versions = new ArrayList<>(shared);
        Collections.sort(versions, Collections.reverseOrder(new VersionComparator()));
        return versions;
    }

    /**
     * The versions Fabric publishes a loader for.
     *
     * A failure here is not fatal — the pack's own version list is still
     * meaningful, and the loader download would report the real problem later.
     */
    @Nullable
    private static Set<String> fabricGameVersions() {
        try {
            FabricVersion[] versions = FabriclikeUtils.FABRIC_UTILS.downloadGameVersions();
            if (versions == null) return null;
            Set<String> names = new HashSet<>();
            for (FabricVersion version : versions) names.add(version.version);
            return names;
        } catch (IOException e) {
            Log.w(TAG, "Failed to read the Fabric game version list", e);
            return null;
        }
    }

    /**
     * Resolves the pack for one Minecraft version.
     *
     * Slugs are turned into project ids in a single bulk request, then each
     * project is asked for its newest build. A mod with nothing for this version
     * is reported rather than guessed at — installing a build for the wrong
     * version produces a profile that crashes on launch.
     *
     * Requests are made one after another on purpose: Modrinth rate-limits, and
     * a pack install that trips the limit halfway through is worse than one that
     * takes a few seconds longer.
     */
    public static Resolution resolve(String gameVersion, @Nullable ResolveListener listener) throws IOException {
        List<String> slugs = new ArrayList<>(PisanPack.MODS.length);
        for (PisanPack.Mod mod : PisanPack.MODS) slugs.add(mod.slug);

        Map<String, String> idBySlug = projectIds(slugs);
        List<ResolvedMod> ready = new ArrayList<>();
        List<SkippedMod> skipped = new ArrayList<>();

        // The pack's own entries go in first and the queue is drained in order,
        // so every one of them is resolved before the first dependency is —
        // which is what keeps a library that is also a pack entry from being
        // installed under the generic dependency name.
        Queue<Pending> pending = new ArrayDeque<>();
        for (PisanPack.Mod mod : PisanPack.MODS) {
            String projectId = idBySlug.get(mod.slug);
            if (projectId == null) {
                if (mod.essential) throw missing(mod.name, gameVersion);
                skipped.add(new SkippedMod(mod.name, "Modrinth’te bulunamadı"));
                continue;
            }
            pending.add(new Pending(projectId, mod.name, mod.role, mod.essential));
        }

        Set<String> visited = new HashSet<>();
        List<ResolvedMod> unnamed = new ArrayList<>();
        int packEntries = pending.size();
        int packEntriesDone = 0;
        while (!pending.isEmpty()) {
            Pending entry = pending.remove();
            if (!visited.add(entry.projectId)) continue;

            if (listener != null) {
                // Dependencies are queued behind the pack's own entries, so by
                // the time they come up the bar is already full and only the
                // name keeps moving.
                if (entry.name != null) packEntriesDone++;
                listener.onResolving(displayName(entry),
                        packEntries == 0 ? 100 : packEntriesDone * 100 / packEntries);
            }

            JSONObject version = bestVersion(entry.projectId, gameVersion);
            if (version == null) {
                if (entry.essential) throw missing(entry.name, gameVersion);
                skipped.add(new SkippedMod(describe(entry), gameVersion + " için sürümü yok"));
                continue;
            }

            JSONObject file = primaryFile(version);
            if (file == null) {
                if (entry.essential) throw missing(entry.name, gameVersion);
                skipped.add(new SkippedMod(describe(entry), "indirilebilir dosyası yok"));
                continue;
            }

            ResolvedMod resolved = new ResolvedMod(
                    entry.projectId,
                    entry.name,
                    entry.role,
                    file.optString("filename", entry.projectId + ".jar"),
                    file.optString("url"),
                    optSha1(file),
                    file.optInt("size", 0));
            ready.add(resolved);
            if (entry.name == null) unnamed.add(resolved);

            // The pack lists the libraries it knows about, so this normally finds
            // them already resolved. It stays on for the ones nobody anticipated —
            // a missing library is a profile that will not start, which is far
            // worse than an extra jar.
            for (String dependency : requiredDependencies(version)) {
                if (!visited.contains(dependency)) {
                    pending.add(new Pending(dependency, null, DEPENDENCY_ROLE, false));
                }
            }
        }

        nameDependencies(unnamed);
        return new Resolution(gameVersion, ready, skipped);
    }

    private static IOException missing(String name, String gameVersion) {
        return new IOException(PisanPack.NAME + " bu sürüme kurulamıyor: " + name + ", " + gameVersion
                + " için yayınlanmamış. Başka bir Minecraft sürümü seçin.");
    }

    private static String displayName(Pending entry) {
        return entry.name != null ? entry.name : entry.projectId;
    }

    /**
     * The name to put in the report for an entry that could not be installed.
     *
     * Worth one extra request for a dependency: the report is what the player
     * reads afterwards, and "AANobbMI has no build for 1.21.1" tells them
     * nothing they can act on.
     */
    private static String describe(Pending entry) {
        if (entry.name != null) return entry.name;
        try {
            String title = optString(getObject(API + "/project/" + encode(entry.projectId)), "title");
            if (title != null) return title;
        } catch (IOException e) {
            Log.w(TAG, "Failed to look up the name of " + entry.projectId, e);
        }
        return entry.projectId;
    }

    /** Modrinth ids for a list of slugs. Projects that do not exist are simply absent. */
    private static Map<String, String> projectIds(List<String> slugs) throws IOException {
        JSONArray projects = getArray(API + "/projects?ids=" + encode(jsonArray(slugs)));
        Map<String, String> ids = new HashMap<>();
        for (int i = 0; i < projects.length(); i++) {
            JSONObject project = projects.optJSONObject(i);
            if (project == null) continue;
            String slug = optString(project, "slug");
            String id = optString(project, "id");
            if (slug != null && id != null) ids.put(slug, id);
        }
        return ids;
    }

    /**
     * Gives the jars that came in as dependencies a name a player can read.
     *
     * One bulk request for the lot of them, because the alternative is a request
     * per jar for nothing but a title.
     */
    private static void nameDependencies(List<ResolvedMod> unnamed) {
        if (unnamed.isEmpty()) return;
        List<String> ids = new ArrayList<>(unnamed.size());
        for (ResolvedMod mod : unnamed) ids.add(mod.projectId);

        Map<String, String> titles = new HashMap<>();
        try {
            JSONArray projects = getArray(API + "/projects?ids=" + encode(jsonArray(ids)));
            for (int i = 0; i < projects.length(); i++) {
                JSONObject project = projects.optJSONObject(i);
                if (project == null) continue;
                String id = optString(project, "id");
                String title = optString(project, "title");
                if (id != null && title != null) titles.put(id, title);
            }
        } catch (IOException e) {
            Log.w(TAG, "Failed to look up dependency names", e);
        }

        for (ResolvedMod mod : unnamed) {
            String title = titles.get(mod.projectId);
            // The file is downloaded either way; a nameless one just shows its jar.
            mod.name = title != null ? title : mod.fileName;
        }
    }

    /** The newest build of one project for this version, preferring stable releases. */
    @Nullable
    private static JSONObject bestVersion(String projectId, String gameVersion) throws IOException {
        String url = API + "/project/" + encode(projectId) + "/version"
                + "?loaders=" + encode(jsonArray(Collections.singletonList(PisanPack.LOADER)))
                + "&game_versions=" + encode(jsonArray(Collections.singletonList(gameVersion)));

        JSONArray versions = getArray(url);
        JSONObject newest = null;
        for (int i = 0; i < versions.length(); i++) {
            JSONObject version = versions.optJSONObject(i);
            if (version == null) continue;
            if (newest == null) newest = version;
            if ("release".equals(version.optString("version_type"))) return version;
        }
        return newest;
    }

    @Nullable
    private static JSONObject primaryFile(JSONObject version) {
        JSONArray files = version.optJSONArray("files");
        if (files == null || files.length() == 0) return null;
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.optJSONObject(i);
            if (file != null && file.optBoolean("primary")) return file;
        }
        return files.optJSONObject(0);
    }

    @Nullable
    private static String optSha1(JSONObject file) {
        JSONObject hashes = file.optJSONObject("hashes");
        if (hashes == null) return null;
        return optString(hashes, "sha1");
    }

    /**
     * A string field, or null when the field is absent or JSON null.
     *
     * {@link JSONObject#optString(String, String)} does not do this: a JSON null
     * comes back as the four letters "null", which as a project id would send
     * the resolver looking for a project by that name.
     */
    @Nullable
    private static String optString(JSONObject object, String key) {
        if (object.isNull(key)) return null;
        return object.optString(key, null);
    }

    /**
     * The projects this build refuses to run without.
     *
     * Dependencies pinned to one specific version are followed by project rather
     * than by version id: the pinned build may well be for another Minecraft
     * version, and the newest build for the version being installed is the one
     * that will actually load.
     */
    private static List<String> requiredDependencies(JSONObject version) {
        List<String> projects = new ArrayList<>();
        JSONArray dependencies = version.optJSONArray("dependencies");
        if (dependencies == null) return projects;
        for (int i = 0; i < dependencies.length(); i++) {
            JSONObject dependency = dependencies.optJSONObject(i);
            if (dependency == null) continue;
            if (!"required".equals(dependency.optString("dependency_type"))) continue;
            String projectId = optString(dependency, "project_id");
            if (projectId != null) projects.add(projectId);
        }
        return projects;
    }

    private static JSONObject getObject(String url) throws IOException {
        String body = DownloadUtils.downloadString(url);
        try {
            return new JSONObject(body);
        } catch (JSONException e) {
            throw new IOException("Modrinth beklenmedik bir yanıt verdi", e);
        }
    }

    private static JSONArray getArray(String url) throws IOException {
        String body = DownloadUtils.downloadString(url);
        try {
            return new JSONArray(body);
        } catch (JSONException e) {
            throw new IOException("Modrinth beklenmedik bir yanıt verdi", e);
        }
    }

    private static String jsonArray(List<String> values) {
        return new JSONArray(values).toString();
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new RuntimeException("UTF-8 is required");
        }
    }

    /** Orders "1.21.11" after "1.21.2", which a plain string sort does not. */
    private static class VersionComparator implements Comparator<String> {
        @Override
        public int compare(String left, String right) {
            String[] leftParts = left.split("\\.");
            String[] rightParts = right.split("\\.");
            int length = Math.max(leftParts.length, rightParts.length);
            for (int i = 0; i < length; i++) {
                int difference = part(leftParts, i) - part(rightParts, i);
                if (difference != 0) return difference;
            }
            return 0;
        }

        private int part(String[] parts, int index) {
            if (index >= parts.length) return 0;
            try {
                return Integer.parseInt(parts[index]);
            } catch (NumberFormatException e) {
                return 0;
            }
        }
    }
}
