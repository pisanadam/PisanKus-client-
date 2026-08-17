package net.kdt.pojavlaunch.modloaders.pisan;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import net.kdt.pojavlaunch.modloaders.modpacks.api.ApiHandler;
import net.kdt.pojavlaunch.utils.GsonJsonUtils;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Resolves {@link PisanPack} against Modrinth for one Minecraft version.
 *
 * Nothing here downloads or writes anything: it turns the pack's slugs into concrete
 * files, and says which entries had nothing to offer for the chosen version.
 */
public class PisanPackUtils {
    private static final ApiHandler sApiHandler = new ApiHandler("https://api.modrinth.com/v2");

    /**
     * Full releases only. Snapshots, pre-releases and the April Fools' versions are
     * filtered out of the version list — offering one would produce a profile that
     * almost nothing in the pack has a build for.
     */
    private static final Pattern RELEASE_VERSION = Pattern.compile("^\\d+\\.\\d+(\\.\\d+)?$");

    /** One pack entry, resolved to the exact file that fits this Minecraft version. */
    public static class ResolvedMod {
        public final String name;
        /** What the mod is for, or null for a dependency the pack does not list itself. */
        public final String role;
        public final String projectId;
        public final String fileName;
        public final String url;
        public final String sha1;
        public final int fileSize;
        /** Project ids this build requires, used for the dependency pass. */
        public final List<String> requiredDependencies;

        private ResolvedMod(String name, String role, String projectId, ModrinthFile file) {
            this.name = name;
            this.role = role;
            this.projectId = projectId;
            this.fileName = file.fileName;
            this.url = file.url;
            this.sha1 = file.sha1;
            this.fileSize = file.fileSize;
            this.requiredDependencies = file.requiredDependencies;
        }
    }

    /** A pack entry with no build for this Minecraft version, and why. */
    public static class SkippedMod {
        public final String name;
        public final String reason;

        private SkippedMod(String name, String reason) {
            this.name = name;
            this.reason = reason;
        }
    }

    public static class Resolution {
        public final List<ResolvedMod> ready;
        public final List<SkippedMod> skipped;

        private Resolution(List<ResolvedMod> ready, List<SkippedMod> skipped) {
            this.ready = ready;
            this.skipped = skipped;
        }
    }

    /** Raised when an essential entry has no build — the install cannot go ahead. */
    public static class EssentialMissingException extends IOException {
        public final String modName;

        private EssentialMissingException(String modName) {
            super("No build of " + modName + " for the requested version");
            this.modName = modName;
        }
    }

    private static class ModrinthFile {
        String fileName;
        String url;
        String sha1;
        int fileSize;
        String versionName;
        List<String> requiredDependencies = new ArrayList<>();
    }

    /**
     * Which Minecraft versions the pack can be installed on, newest first.
     *
     * Only the versions every essential mod supports: the rest of the pack is allowed to
     * be missing, these are not.
     */
    public static List<String> gameVersions() throws IOException {
        List<String> essentialSlugs = new ArrayList<>();
        for (PisanPack.Mod mod : PisanPack.MODS) {
            if (mod.essential) essentialSlugs.add(mod.slug);
        }

        JsonArray projects = getProjects(essentialSlugs);
        List<String> shared = null;
        for (JsonElement element : projects) {
            JsonObject project = GsonJsonUtils.getJsonObjectSafe(element);
            JsonArray supportedArray = GsonJsonUtils.getJsonArraySafe(project, "game_versions");
            if (supportedArray == null) continue;

            List<String> supported = new ArrayList<>();
            for (JsonElement version : supportedArray) {
                String value = version.getAsString();
                if (RELEASE_VERSION.matcher(value).matches()) supported.add(value);
            }

            if (shared == null) shared = supported;
            else shared.retainAll(supported);
        }

        if (shared == null) return Collections.emptyList();
        // Collections.sort rather than List.sort: minSdk is 21, and the latter is API 24.
        Collections.sort(shared, PisanPackUtils::compareVersions);
        Collections.reverse(shared);
        return shared;
    }

    /**
     * Resolves the whole pack for one Minecraft version.
     *
     * Slugs are turned into project ids in a single bulk request, then each project is
     * asked for its newest build. A mod with nothing for this version is reported rather
     * than guessed at — installing a build for the wrong version would produce a profile
     * that crashes on launch.
     */
    public static Resolution resolve(String gameVersion) throws IOException {
        List<String> slugs = new ArrayList<>(PisanPack.MODS.length);
        for (PisanPack.Mod mod : PisanPack.MODS) slugs.add(mod.slug);

        Map<String, String> idBySlug = new HashMap<>();
        for (JsonElement element : getProjects(slugs)) {
            JsonObject project = GsonJsonUtils.getJsonObjectSafe(element);
            String slug = GsonJsonUtils.getStringSafe(project, "slug");
            String id = GsonJsonUtils.getStringSafe(project, "id");
            if (slug != null && id != null) idBySlug.put(slug, id);
        }

        List<ResolvedMod> ready = new ArrayList<>();
        List<SkippedMod> skipped = new ArrayList<>();

        // Sequential on purpose: Modrinth rate-limits, and a pack install that trips the
        // limit halfway through is worse than one that takes a few seconds longer.
        for (PisanPack.Mod mod : PisanPack.MODS) {
            String projectId = idBySlug.get(mod.slug);
            if (projectId == null) {
                if (mod.essential) throw new EssentialMissingException(mod.name);
                skipped.add(new SkippedMod(mod.name, "Modrinth’te bulunamadı"));
                continue;
            }

            ModrinthFile file = bestFile(projectId, gameVersion);
            if (file == null) {
                if (mod.essential) throw new EssentialMissingException(mod.name);
                skipped.add(new SkippedMod(mod.name, gameVersion + " için sürümü yok"));
                continue;
            }
            ready.add(new ResolvedMod(mod.name, mod.role, projectId, file));
        }

        ready.addAll(resolveDependencies(ready, gameVersion));
        return new Resolution(ready, skipped);
    }

    /**
     * Required dependencies the pack does not list itself.
     *
     * The libraries it knows about are resolved first, so this normally finds everything
     * already queued. It stays on for the ones nobody anticipated — a missing library is
     * a profile that will not start, which is far worse than an extra jar.
     *
     * One level deep, like the desktop: a dependency of a dependency is rare enough that
     * chasing it would cost more requests than it saves installs.
     */
    private static List<ResolvedMod> resolveDependencies(List<ResolvedMod> ready, String gameVersion) {
        Set<String> queued = new HashSet<>();
        for (ResolvedMod resolved : ready) queued.add(resolved.projectId);

        List<ResolvedMod> extra = new ArrayList<>();
        for (ResolvedMod resolved : ready) {
            for (String dependencyId : resolved.requiredDependencies) {
                if (!queued.add(dependencyId)) continue;
                try {
                    ModrinthFile file = bestFile(dependencyId, gameVersion);
                    if (file == null) continue;
                    extra.add(new ResolvedMod(file.versionName, null, dependencyId, file));
                } catch (IOException ignored) {
                    // A dependency we cannot reach should not block the mods that resolved.
                }
            }
        }
        return extra;
    }

    private static JsonArray getProjects(List<String> idsOrSlugs) throws IOException {
        if (idsOrSlugs.isEmpty()) return new JsonArray();
        HashMap<String, Object> params = new HashMap<>();
        params.put("ids", jsonStringArray(idsOrSlugs));

        JsonArray response = sApiHandler.get("projects", params, JsonArray.class);
        if (response == null) throw new IOException("Modrinth did not answer the project query");
        return response;
    }

    /**
     * The newest build of one project for this Minecraft version, preferring stable
     * releases. Modrinth answers newest first, so the first release in the list wins.
     */
    private static ModrinthFile bestFile(String projectId, String gameVersion) throws IOException {
        HashMap<String, Object> params = new HashMap<>();
        params.put("game_versions", jsonStringArray(Collections.singletonList(gameVersion)));
        params.put("loaders", jsonStringArray(Collections.singletonList(PisanPack.LOADER)));

        JsonArray versions = sApiHandler.get("project/" + projectId + "/version", params, JsonArray.class);
        if (versions == null) throw new IOException("Modrinth did not answer the version query");
        if (versions.size() == 0) return null;

        JsonObject chosen = null;
        for (JsonElement element : versions) {
            JsonObject version = GsonJsonUtils.getJsonObjectSafe(element);
            if (version == null) continue;
            if (chosen == null) chosen = version;
            if ("release".equals(GsonJsonUtils.getStringSafe(version, "version_type"))) {
                chosen = version;
                break;
            }
        }
        return chosen == null ? null : toFile(chosen);
    }

    private static ModrinthFile toFile(JsonObject version) {
        JsonArray files = GsonJsonUtils.getJsonArraySafe(version, "files");
        if (files == null || files.size() == 0) return null;

        // The primary file is the jar; a project may also publish sources or a javadoc
        // alongside it, and installing one of those would leave the mod itself missing.
        JsonObject primary = null;
        for (JsonElement element : files) {
            JsonObject candidate = GsonJsonUtils.getJsonObjectSafe(element);
            if (candidate == null) continue;
            if (primary == null) primary = candidate;
            JsonElement isPrimary = GsonJsonUtils.getElementSafe(candidate, "primary");
            if (isPrimary != null && isPrimary.getAsBoolean()) {
                primary = candidate;
                break;
            }
        }
        if (primary == null) return null;

        String url = GsonJsonUtils.getStringSafe(primary, "url");
        String fileName = GsonJsonUtils.getStringSafe(primary, "filename");
        if (url == null || fileName == null) return null;

        ModrinthFile file = new ModrinthFile();
        file.url = url;
        file.fileName = leafName(fileName);
        file.fileSize = GsonJsonUtils.getIntSafe(primary, "size", 0);
        file.versionName = GsonJsonUtils.getStringSafe(version, "name");
        if (file.versionName == null) file.versionName = file.fileName;

        JsonObject hashes = GsonJsonUtils.getJsonObjectSafe(primary, "hashes");
        file.sha1 = hashes == null ? null : GsonJsonUtils.getStringSafe(hashes, "sha1");

        JsonArray dependencies = GsonJsonUtils.getJsonArraySafe(version, "dependencies");
        if (dependencies != null) {
            for (JsonElement element : dependencies) {
                JsonObject dependency = GsonJsonUtils.getJsonObjectSafe(element);
                if (dependency == null) continue;
                if (!"required".equals(GsonJsonUtils.getStringSafe(dependency, "dependency_type"))) continue;
                String dependencyId = GsonJsonUtils.getStringSafe(dependency, "project_id");
                if (dependencyId != null) file.requiredDependencies.add(dependencyId);
            }
        }
        return file;
    }

    /**
     * The file name without any directory part.
     *
     * Modrinth file names are plain names in practice, but they arrive from the network
     * and are joined onto the instance path — a name carrying separators would write
     * outside mods/.
     */
    private static String leafName(String fileName) {
        int separator = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
        return separator == -1 ? fileName : fileName.substring(separator + 1);
    }

    private static String jsonStringArray(List<String> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) builder.append(',');
            builder.append('"').append(values.get(i)).append('"');
        }
        return builder.append(']').toString();
    }

    private static int compareVersions(String left, String right) {
        String[] leftParts = left.split("\\.");
        String[] rightParts = right.split("\\.");
        for (int i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
            int difference = versionPart(leftParts, i) - versionPart(rightParts, i);
            if (difference != 0) return difference;
        }
        return 0;
    }

    private static int versionPart(String[] parts, int index) {
        if (index >= parts.length) return 0;
        try {
            return Integer.parseInt(parts[index]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
