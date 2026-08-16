package net.kdt.pojavlaunch.modloaders.pisan;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.utils.DownloadUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The small part of Modrinth this launcher actually uses.
 *
 * Two screens need it — the Pisan Optimized pack and the PisanKus mod list —
 * and they need the same four things: look projects up, find the build that
 * fits a profile, get at its file, and follow what it depends on. Keeping that
 * in one place is what stops the two from drifting into disagreeing about which
 * build "fits".
 *
 * Everything here blocks and belongs on a background thread.
 */
public class ModrinthClient {
    private static final String API = "https://api.modrinth.com/v2";

    /** What the mod list needs to draw a row. */
    public static class Project {
        public final String id;
        public final String slug;
        public final String title;
        public final String description;
        @Nullable public final String iconUrl;
        public final int downloads;

        Project(String id, String slug, String title, String description,
                @Nullable String iconUrl, int downloads) {
            this.id = id;
            this.slug = slug;
            this.title = title;
            this.description = description;
            this.iconUrl = iconUrl;
            this.downloads = downloads;
        }
    }

    /** One file to download, with the name it has to keep. */
    public static class File {
        public final String fileName;
        public final String url;
        @Nullable public final String sha1;
        public final int size;

        File(String fileName, String url, @Nullable String sha1, int size) {
            this.fileName = fileName;
            this.url = url;
            this.sha1 = sha1;
            this.size = size;
        }
    }

    /**
     * Every project one account published.
     *
     * Modrinth has an endpoint for exactly this, which is why the launcher does
     * not search for the publisher's name instead: a name search returns
     * whatever else happens to mention it, and misses projects whose title does
     * not.
     */
    public static List<Project> listUserProjects(String username) throws IOException {
        JSONArray projects = getArray(API + "/user/" + encode(username) + "/projects");
        List<Project> found = new ArrayList<>(projects.length());
        for (int i = 0; i < projects.length(); i++) {
            JSONObject project = projects.optJSONObject(i);
            if (project == null) continue;
            String id = optString(project, "id");
            if (id == null) continue;
            found.add(new Project(
                    id,
                    project.optString("slug", id),
                    project.optString("title", id),
                    project.optString("description", ""),
                    optString(project, "icon_url"),
                    project.optInt("downloads", 0)));
        }
        return found;
    }

    /** Ids for a list of slugs, in one request. Projects that do not exist are absent. */
    public static Map<String, String> projectIds(List<String> slugs) throws IOException {
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

    /** Titles for a list of ids, in one request. */
    public static Map<String, String> projectTitles(List<String> ids) throws IOException {
        JSONArray projects = getArray(API + "/projects?ids=" + encode(jsonArray(ids)));
        Map<String, String> titles = new HashMap<>();
        for (int i = 0; i < projects.length(); i++) {
            JSONObject project = projects.optJSONObject(i);
            if (project == null) continue;
            String id = optString(project, "id");
            String title = optString(project, "title");
            if (id != null && title != null) titles.put(id, title);
        }
        return titles;
    }

    @Nullable
    public static String projectTitle(String projectId) throws IOException {
        return optString(getObject(API + "/project/" + encode(projectId)), "title");
    }

    /**
     * The newest build of a project for one Minecraft version and loader,
     * preferring stable releases.
     *
     * Modrinth answers newest first, so the first release in the list is the
     * newest release; a project with nothing but pre-releases falls back to
     * whatever is newest.
     */
    @Nullable
    public static JSONObject bestVersion(String projectId, String gameVersion, String loader)
            throws IOException {
        StringBuilder url = new StringBuilder(API + "/project/" + encode(projectId) + "/version"
                + "?game_versions=" + encode(jsonArray(Collections.singletonList(gameVersion))));
        // Resource packs and the like are published without a loader, and asking
        // for one would hide them.
        if (loader != null && !loader.isEmpty()) {
            url.append("&loaders=").append(encode(jsonArray(Collections.singletonList(loader))));
        }

        JSONArray versions = getArray(url.toString());
        JSONObject newest = null;
        for (int i = 0; i < versions.length(); i++) {
            JSONObject version = versions.optJSONObject(i);
            if (version == null) continue;
            if (newest == null) newest = version;
            if ("release".equals(version.optString("version_type"))) return version;
        }
        return newest;
    }

    /** The file a build is, or null when it carries none. */
    @Nullable
    public static File primaryFile(JSONObject version) {
        JSONArray files = version.optJSONArray("files");
        if (files == null || files.length() == 0) return null;

        JSONObject chosen = null;
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.optJSONObject(i);
            if (file == null) continue;
            if (chosen == null) chosen = file;
            if (file.optBoolean("primary")) {
                chosen = file;
                break;
            }
        }
        if (chosen == null) return null;

        String url = optString(chosen, "url");
        if (url == null) return null;
        JSONObject hashes = chosen.optJSONObject("hashes");
        return new File(
                chosen.optString("filename", "mod.jar"),
                url,
                hashes == null ? null : optString(hashes, "sha1"),
                chosen.optInt("size", 0));
    }

    /**
     * The projects a build refuses to run without.
     *
     * Dependencies pinned to one specific build are followed by project rather
     * than by build id: the pinned one may well be for another Minecraft
     * version, and what will actually load is the newest build for the version
     * being installed.
     */
    public static List<String> requiredDependencies(JSONObject version) {
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

    /**
     * A string field, or null when the field is absent or JSON null.
     *
     * {@link JSONObject#optString(String, String)} does not do this: a JSON null
     * comes back as the four letters "null", which as a project id would send
     * the caller looking for a project by that name.
     */
    @Nullable
    public static String optString(JSONObject object, String key) {
        if (object.isNull(key)) return null;
        return object.optString(key, null);
    }

    public static JSONArray getArray(String url) throws IOException {
        try {
            return new JSONArray(DownloadUtils.downloadString(url));
        } catch (JSONException e) {
            throw new IOException("Modrinth beklenmedik bir yanıt verdi", e);
        }
    }

    public static JSONObject getObject(String url) throws IOException {
        try {
            return new JSONObject(DownloadUtils.downloadString(url));
        } catch (JSONException e) {
            throw new IOException("Modrinth beklenmedik bir yanıt verdi", e);
        }
    }

    public static String jsonArray(List<String> values) {
        return new JSONArray(values).toString();
    }

    public static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new RuntimeException("UTF-8 is required");
        }
    }
}
