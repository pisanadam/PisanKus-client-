package net.kdt.pojavlaunch.fragments;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.LruCache;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.RadioGroup;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import net.kdt.pojavlaunch.PisanKusModrinth;
import net.kdt.pojavlaunch.PisanKusInstalledContent;
import net.kdt.pojavlaunch.PisanKusProfileTarget;
import net.kdt.pojavlaunch.PisanKusSodium;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraConstants;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModpackApi;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModrinthApi;
import net.kdt.pojavlaunch.modloaders.modpacks.models.Constants;
import net.kdt.pojavlaunch.modloaders.modpacks.models.ModDetail;
import net.kdt.pojavlaunch.modloaders.modpacks.models.ModItem;
import net.kdt.pojavlaunch.profiles.VersionSelectorDialog;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * The store: the desktop launcher's Keşfet, in the shape a phone can use.
 *
 * Everything Modrinth publishes is reachable from here — mods, mod packs,
 * resource packs, shaders, data packs — and every filter can be set by hand.
 * That last part is the point: a store pinned to one profile's exact version
 * and loader hides most of its shelves, and the player has no way to look
 * behind them.
 */
public class PisanModsFragment extends Fragment {
    public static final String TAG = "PisanModsFragment";
    private static final int PAGE_SIZE = 30;

    /** The launcher's own publisher on Modrinth. */
    private static final String FEATURED_AUTHOR = "pisankusgaming";

    /**
     * What can be installed, and where it goes.
     *
     * The folder names are Minecraft's own, with one caveat: a data pack is
     * read from inside a world, not from the profile, so those land in the
     * profile's `datapacks` folder — the same staging place the desktop
     * launcher uses — and the player moves them into the world they want.
     *
     * `loaderApplies` says whether the loader facet means anything for the
     * kind. A resource pack lists `minecraft` as its loader and a shader lists
     * `iris`, so filtering those by the profile's loader matches nothing.
     */
    private enum Kind {
        MOD("mod", "mods", true, R.string.pisan_mods_kind_mod),
        MODPACK("modpack", null, true, R.string.pisan_mods_kind_modpack),
        RESOURCEPACK("resourcepack", "resourcepacks", false, R.string.pisan_mods_kind_resourcepack),
        SHADER("shader", "shaderpacks", false, R.string.pisan_mods_kind_shader),
        DATAPACK("datapack", "datapacks", false, R.string.pisan_mods_kind_datapack);

        final String projectType;
        /** Null for mod packs: those bring a whole profile rather than a file. */
        final String folder;
        final boolean loaderApplies;
        final int label;

        Kind(String projectType, String folder, boolean loaderApplies, int label) {
            this.projectType = projectType;
            this.folder = folder;
            this.loaderApplies = loaderApplies;
            this.label = label;
        }

        static Kind ofProjectType(String projectType) {
            for (Kind kind : values()) {
                if (kind.projectType.equals(projectType)) return kind;
            }
            return MOD;
        }
    }

    /** Modrinth's own index names, in the order the filter lists them. */
    private static final String[] SORTS = {"relevance", "downloads", "follows", "updated", "newest"};
    private static final int[] SORT_LABELS = {
            R.string.pisan_mods_sort_relevance,
            R.string.pisan_mods_sort_downloads,
            R.string.pisan_mods_sort_follows,
            R.string.pisan_mods_sort_updated,
            R.string.pisan_mods_sort_newest
    };

    /** Null means "whatever the profile uses"; empty means "any". */
    private static final String LOADER_PROFILE = null;
    private static final String LOADER_ANY = "";
    private static final String[] LOADERS = {LOADER_PROFILE, LOADER_ANY, "fabric", "quilt", "forge", "neoforge"};

    private EditText mSearch;
    private ProgressBar mProgress;
    private TextView mStatus;
    private TextView mTarget;
    private TextView mFilterSummary;
    private RecyclerView mList;
    private ImageButton mFilterButton;
    private ImageButton mFeaturedButton;

    private PisanKusProfileTarget mProfile;
    private PisanKusInstalledContent mInstalled;
    private final ModAdapter mAdapter = new ModAdapter();

    // The filters, as they currently stand.
    private Kind mKind = Kind.MOD;
    private String mLoader = LOADER_PROFILE;
    /** Null means every version; otherwise the one chosen by hand. */
    private String mGameVersion;
    private int mSortIndex;
    private boolean mFeatured;

    private String mQuery = "";
    private int mLoaded;
    private int mTotal;
    private boolean mLoading;
    /**
     * Which search the pages in flight belong to.
     *
     * Changing a filter starts a new search while the previous page may still
     * be on its way back; without this, those results would be appended to a
     * list they no longer match.
     */
    private int mGeneration;

    public PisanModsFragment() {
        super(R.layout.fragment_pisan_mods);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mSearch = view.findViewById(R.id.pisan_mods_search);
        mProgress = view.findViewById(R.id.pisan_mods_progress);
        mStatus = view.findViewById(R.id.pisan_mods_status);
        mTarget = view.findViewById(R.id.pisan_mods_target);
        mFilterSummary = view.findViewById(R.id.pisan_mods_filter_summary);
        mFilterButton = view.findViewById(R.id.pisan_mods_filter);
        mFeaturedButton = view.findViewById(R.id.pisan_mods_featured);
        mList = view.findViewById(R.id.pisan_mods_list);
        LinearLayoutManager layout = new LinearLayoutManager(requireContext());
        mList.setLayoutManager(layout);
        mList.setAdapter(mAdapter);

        // Modrinth pages its search, so the rest of the catalogue arrives as the
        // player reaches the end of what is on screen rather than stopping at
        // the first page.
        mList.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                if (dy <= 0 || mLoading || mFeatured || mLoaded >= mTotal) return;
                if (layout.findLastVisibleItemPosition() >= mAdapter.getItemCount() - 5) loadMore();
            }
        });

        mProfile = PisanKusProfileTarget.current();
        if (mProfile == null) {
            mTarget.setText(R.string.pisan_mods_no_profile);
            mSearch.setEnabled(false);
            mFilterButton.setEnabled(false);
            mFeaturedButton.setEnabled(false);
            return;
        }
        mInstalled = new PisanKusInstalledContent(mProfile.gameDir);
        mTarget.setText(getString(R.string.pisan_mods_target,
                mProfile.profileName,
                mProfile.loadsMods() ? mProfile.loader : getString(R.string.pisan_mods_no_loader_word),
                mProfile.gameVersion));
        mGameVersion = mProfile.gameVersion;

        mSearch.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                mQuery = mSearch.getText().toString();
                restart();
                return true;
            }
            return false;
        });
        mFilterButton.setOnClickListener(v -> openFilters());
        mFeaturedButton.setOnClickListener(v -> {
            mFeatured = !mFeatured;
            mFeaturedButton.setSelected(mFeatured);
            restart();
        });

        restart();
    }

    // --- filters -----------------------------------------------------------

    private void openFilters() {
        View content = LayoutInflater.from(requireContext())
                .inflate(R.layout.dialog_pisan_filters, null);

        RadioGroup kinds = content.findViewById(R.id.pisan_filter_kind);
        kinds.check(kindRadioId(mKind));

        Spinner loader = content.findViewById(R.id.pisan_filter_loader);
        loader.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, loaderLabels()));
        loader.setSelection(loaderIndex(mLoader));

        Spinner sort = content.findViewById(R.id.pisan_filter_sort);
        String[] sortLabels = new String[SORT_LABELS.length];
        for (int i = 0; i < sortLabels.length; i++) sortLabels[i] = getString(SORT_LABELS[i]);
        sort.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, sortLabels));
        sort.setSelection(mSortIndex);

        Button version = content.findViewById(R.id.pisan_filter_version);
        CheckBox allVersions = content.findViewById(R.id.pisan_filter_all_versions);

        // Held separately from the fields: nothing changes until Uygula.
        final String[] pendingVersion = {mGameVersion};
        version.setText(pendingVersion[0] == null
                ? getString(R.string.pisan_mods_version_any) : pendingVersion[0]);
        allVersions.setChecked(pendingVersion[0] == null);

        version.setOnClickListener(v -> {
            // The picker reads the launcher's own version list, which is filled
            // in on start-up; without it the dialog would open empty.
            if (ExtraCore.getValue(ExtraConstants.RELEASE_TABLE) == null) {
                Toast.makeText(requireContext(), R.string.pisan_mods_versions_not_ready,
                        Toast.LENGTH_LONG).show();
                return;
            }
            VersionSelectorDialog.open(requireContext(), true, (selected, isSnapshot) -> {
                pendingVersion[0] = selected;
                version.setText(selected);
                allVersions.setChecked(false);
            });
        });
        allVersions.setOnCheckedChangeListener((v, checked) -> {
            if (checked) {
                pendingVersion[0] = null;
                version.setText(R.string.pisan_mods_version_any);
            } else if (pendingVersion[0] == null) {
                pendingVersion[0] = mProfile.gameVersion;
                version.setText(pendingVersion[0]);
            }
        });

        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.pisan_mods_filters)
                .setView(content)
                .setPositiveButton(R.string.pisan_mods_filter_apply, (d, w) -> {
                    mKind = kindOf(kinds.getCheckedRadioButtonId());
                    mLoader = LOADERS[loader.getSelectedItemPosition()];
                    mSortIndex = sort.getSelectedItemPosition();
                    mGameVersion = pendingVersion[0];
                    restart();
                })
                .setNeutralButton(R.string.pisan_mods_filter_reset, (d, w) -> {
                    mKind = Kind.MOD;
                    mLoader = LOADER_PROFILE;
                    mSortIndex = 0;
                    mGameVersion = mProfile.gameVersion;
                    restart();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private String[] loaderLabels() {
        String[] labels = new String[LOADERS.length];
        labels[0] = getString(R.string.pisan_mods_loader_profile) + " ("
                + (mProfile.loadsMods() ? mProfile.loader : getString(R.string.pisan_mods_no_loader_word)) + ")";
        labels[1] = getString(R.string.pisan_mods_loader_any);
        for (int i = 2; i < LOADERS.length; i++) labels[i] = LOADERS[i];
        return labels;
    }

    private int loaderIndex(String loader) {
        for (int i = 0; i < LOADERS.length; i++) {
            if (LOADERS[i] == null ? loader == null : LOADERS[i].equals(loader)) return i;
        }
        return 0;
    }

    private int kindRadioId(Kind kind) {
        switch (kind) {
            case MODPACK: return R.id.pisan_filter_kind_modpack;
            case RESOURCEPACK: return R.id.pisan_filter_kind_resourcepack;
            case SHADER: return R.id.pisan_filter_kind_shader;
            case DATAPACK: return R.id.pisan_filter_kind_datapack;
            default: return R.id.pisan_filter_kind_mod;
        }
    }

    private Kind kindOf(int radioId) {
        if (radioId == R.id.pisan_filter_kind_modpack) return Kind.MODPACK;
        if (radioId == R.id.pisan_filter_kind_resourcepack) return Kind.RESOURCEPACK;
        if (radioId == R.id.pisan_filter_kind_shader) return Kind.SHADER;
        if (radioId == R.id.pisan_filter_kind_datapack) return Kind.DATAPACK;
        return Kind.MOD;
    }

    /**
     * The loader the search actually asks for, once the filter is resolved.
     *
     * Left unset it follows the profile — which is what a player wants when
     * installing into it. Mod packs are the exception even then: a pack brings
     * its own loader, so narrowing the shelf by the current profile's would
     * hide most of them for no reason.
     */
    private String effectiveLoader() {
        if (!mKind.loaderApplies || LOADER_ANY.equals(mLoader)) return null;
        if (mLoader != null) return mLoader;
        if (mKind == Kind.MODPACK) return null;
        return mProfile.loadsMods() ? mProfile.loader : null;
    }

    private void showFilterSummary() {
        String loader = effectiveLoader();
        mFilterSummary.setText(getString(R.string.pisan_mods_filter_summary,
                getString(mKind.label),
                loader == null ? getString(R.string.pisan_mods_loader_any) : loader,
                mGameVersion == null ? getString(R.string.pisan_mods_version_any) : mGameVersion));
    }

    // --- loading -----------------------------------------------------------

    /** A new set of results: back to the first page. */
    private void restart() {
        mGeneration++;
        mLoaded = 0;
        mTotal = 0;
        // Whatever is in flight belongs to the previous search, so the new one
        // must not be held back waiting for it.
        mLoading = false;
        mAdapter.replace(new ArrayList<>());
        showFilterSummary();
        if (mFeatured) loadFeatured();
        else loadMore();
    }

    /**
     * The publisher's own project list.
     *
     * Not a search: it returns everything they released, of every kind, in one
     * answer — so it neither pages nor filters.
     */
    private void loadFeatured() {
        final int generation = mGeneration;
        setBusy(true);
        mStatus.setText(R.string.pisan_mods_searching);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                JSONArray projects = PisanKusModrinth.userProjects(FEATURED_AUTHOR);
                final List<Hit> results = new ArrayList<>();
                for (int i = 0; i < projects.length(); i++) {
                    JSONObject project = projects.optJSONObject(i);
                    if (project == null) continue;
                    results.add(new Hit(
                            project.optString("slug", project.optString("id")),
                            project.optString("id"),
                            project.optString("title"),
                            project.optString("description"),
                            project.optString("icon_url", null),
                            null,
                            Kind.ofProjectType(project.optString("project_type", "mod"))));
                }
                Tools.runOnUiThread(() -> {
                    if (generation != mGeneration) return;
                    if (!isAdded()) return;
                    setBusy(false);
                    mAdapter.replace(results);
                    mStatus.setText(results.isEmpty()
                            ? getString(R.string.pisan_mods_empty)
                            : getString(R.string.pisan_mods_featured_on, results.size()));
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void loadMore() {
        if (mLoading) return;
        mLoading = true;
        final int generation = mGeneration;
        final int offset = mLoaded;
        setBusy(true);
        mStatus.setText(offset == 0 ? getString(R.string.pisan_mods_searching)
                : getString(R.string.pisan_mods_loading_more));
        final String sort = SORTS[Math.max(0, Math.min(SORTS.length - 1, mSortIndex))];
        final String loader = effectiveLoader();
        final String gameVersion = mGameVersion;
        final Kind kind = mKind;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusModrinth.SearchPage page = PisanKusModrinth.search(
                        kind.projectType, mQuery, loader, gameVersion, sort, offset, PAGE_SIZE);
                final List<Hit> results = new ArrayList<>();
                JSONArray hits = page.hits;
                if (hits != null) {
                    for (int i = 0; i < hits.length(); i++) {
                        JSONObject hit = hits.optJSONObject(i);
                        if (hit == null) continue;
                        results.add(new Hit(
                                hit.optString("slug", hit.optString("project_id")),
                                hit.optString("project_id"),
                                hit.optString("title"),
                                hit.optString("description"),
                                hit.optString("icon_url", null),
                                null,
                                kind));
                    }
                }
                final int total = page.total;
                Tools.runOnUiThread(() -> {
                    // A page from an abandoned search is dropped — and must not
                    // clear the flag belonging to the search that replaced it.
                    if (generation != mGeneration) return;
                    mLoading = false;
                    if (!isAdded()) return;
                    setBusy(false);
                    mTotal = total;
                    mLoaded += results.size();
                    mAdapter.append(results);
                    mStatus.setText(mAdapter.getItemCount() == 0
                            ? getString(R.string.pisan_mods_empty)
                            : getString(R.string.pisan_mods_found, mAdapter.getItemCount(), total));
                });
            } catch (Exception e) {
                Tools.runOnUiThread(() -> {
                    if (generation == mGeneration) mLoading = false;
                });
                showError(e);
            }
        });
    }

    // --- installing --------------------------------------------------------

    private void confirmInstall(Hit hit) {
        // A mod dropped into a profile with no loader is simply never read, and
        // the store should say that rather than report a successful install.
        if (hit.kind == Kind.MOD && !mProfile.loadsMods()) {
            new AlertDialog.Builder(requireContext())
                    .setTitle(hit.title)
                    .setMessage(R.string.pisan_mods_needs_loader)
                    .setPositiveButton(android.R.string.ok, null)
                    .show();
            return;
        }

        boolean modpack = hit.kind == Kind.MODPACK;
        if (!modpack) {
            resolveInstall(hit);
            return;
        }
        new AlertDialog.Builder(requireContext())
                .setTitle(hit.title)
                .setMessage(modpack
                        ? getString(R.string.pisan_mods_modpack_confirm, hit.title)
                        : getString(R.string.pisan_mods_confirm, hit.title, mProfile.profileName))
                .setPositiveButton(R.string.pisan_mods_install, (d, w) -> {
                    installModpack(hit);
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    /** Resolves the exact compatible build before deciding whether this is an update. */
    private void resolveInstall(Hit hit) {
        final String loader = hit.kind.loaderApplies ? effectiveLoader() : null;
        final String gameVersion = mGameVersion;
        setBusy(true);
        mStatus.setText(getString(R.string.pisan_mods_checking_version, hit.title));
        PojavApplication.sExecutorService.execute(() -> {
            try {
                final JSONObject version = PisanKusModrinth.latestVersion(hit.slug, loader, gameVersion);
                final PisanKusInstalledContent.Entry installed = mInstalled.get(hit.projectId);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    if (version == null) {
                        mStatus.setText(getString(R.string.pisan_mods_no_version, hit.title,
                                gameVersion == null ? "" : gameVersion));
                        return;
                    }

                    hit.latestVersionNumber = version.optString("version_number", version.optString("id"));
                    mAdapter.notifyDataSetChanged();
                    if (installed != null && installed.versionId.equals(version.optString("id"))) {
                        mStatus.setText(getString(R.string.pisan_mods_installed_current, hit.title));
                        return;
                    }
                    if (installed != null) showUpdateConfirmation(hit, version, installed);
                    else showInstallConfirmation(hit, version);
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    /** Checks only installed rows, against this profile's exact compatibility filters. */
    private void resolveUpdateBadge(Hit hit) {
        if (hit.checkingUpdate || hit.latestVersionNumber != null) return;
        hit.checkingUpdate = true;
        final String loader = hit.kind.loaderApplies ? effectiveLoader() : null;
        final String gameVersion = mGameVersion;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                JSONObject version = PisanKusModrinth.latestVersion(hit.slug, loader, gameVersion);
                hit.latestVersionNumber = version == null
                        ? ""
                        : version.optString("version_number", version.optString("id"));
            } catch (Exception ignored) {
                // A badge check is advisory. Keep the installed mod usable and
                // let the next manual search retry after a network failure.
                hit.latestVersionNumber = "";
            } finally {
                hit.checkingUpdate = false;
                Tools.runOnUiThread(() -> {
                    if (isAdded()) mAdapter.notifyDataSetChanged();
                });
            }
        });
    }

    private void showInstallConfirmation(Hit hit, JSONObject version) {
        new AlertDialog.Builder(requireContext())
                .setTitle(hit.title)
                .setMessage(getString(R.string.pisan_mods_confirm, hit.title, mProfile.profileName))
                .setPositiveButton(R.string.pisan_mods_install,
                        (dialog, which) -> install(hit, version, null))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void showUpdateConfirmation(Hit hit, JSONObject version,
                                        PisanKusInstalledContent.Entry installed) {
        TextView warning = new TextView(requireContext());
        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        warning.setPadding(padding, padding / 2, padding, padding);
        warning.setText(R.string.pisan_mods_update_warning);
        warning.setTextColor(ContextCompat.getColor(requireContext(), R.color.warning));

        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.pisan_mods_update_available)
                .setMessage(getString(R.string.pisan_mods_update_confirm, hit.title))
                // Kept below the normal explanation, matching the requested
                // orange warning under the update action.
                .setView(warning)
                .setPositiveButton(R.string.pisan_mods_update_anyway,
                        (dialog, which) -> install(hit, version, installed))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void install(Hit hit, JSONObject version, PisanKusInstalledContent.Entry previous) {
        final File target = mProfile.dirFor(hit.kind.folder);
        setBusy(true);
        mStatus.setText(getString(R.string.pisan_mods_installing, hit.title));
        final String gameVersion = mGameVersion;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                final String fileName = PisanKusModrinth.downloadPrimaryFile(version, target);
                mInstalled.put(
                        hit.projectId,
                        version.optString("id"),
                        version.optString("version_number", version.optString("id")),
                        fileName,
                        hit.kind.projectType
                );
                // The working file survives until the replacement has fully
                // downloaded and the registry has been saved.
                if (previous != null && !previous.fileName.equals(fileName)) {
                    new File(target, previous.fileName).delete();
                }
                // Sodium alone does not start on this launcher; it needs the
                // patch mod and a renderer that can carry it. A player who
                // installs it here should get the same working setup the pack
                // gives them, not a profile that refuses to launch.
                final boolean sodium = hit.kind == Kind.MOD && PisanKusSodium.isSodium(hit.slug);
                if (sodium) {
                    PisanKusSodium.installPatch(target, gameVersion == null ? mProfile.gameVersion : gameVersion);
                    PisanKusSodium.useRendererFor(mProfile.profileKey);
                    PisanKusSodium.allow();
                }
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    hit.latestVersionNumber = version.optString("version_number", version.optString("id"));
                    mAdapter.notifyDataSetChanged();
                    if (sodium) {
                        mStatus.setText(getString(R.string.pisan_mods_installed_sodium, fileName));
                    } else if (hit.kind == Kind.DATAPACK) {
                        mStatus.setText(getString(R.string.pisan_mods_installed_datapack, fileName));
                    } else {
                        mStatus.setText(getString(R.string.pisan_mods_installed, fileName));
                    }
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    /**
     * Mod packs go through the launcher's own installer.
     *
     * A pack is not a file to drop in a folder: it names a Minecraft version, a
     * loader and a list of downloads, and it ends up as a profile of its own.
     * All of that already exists here and works — this screen only has to hand
     * the project over.
     */
    private void installModpack(Hit hit) {
        setBusy(true);
        mStatus.setText(getString(R.string.pisan_mods_installing, hit.title));
        PojavApplication.sExecutorService.execute(() -> {
            try {
                ModpackApi api = new ModrinthApi();
                ModItem item = new ModItem(Constants.SOURCE_MODRINTH, true,
                        hit.projectId, hit.title, hit.description, hit.iconUrl);
                ModDetail detail = api.getModDetails(item);
                if (detail == null || detail.versionNames == null || detail.versionNames.length == 0) {
                    Tools.runOnUiThread(() -> {
                        if (!isAdded()) return;
                        setBusy(false);
                        mStatus.setText(getString(R.string.pisan_mods_no_version, hit.title,
                                mGameVersion == null ? "" : mGameVersion));
                    });
                    return;
                }
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    pickModpackVersion(detail, api);
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    /** The pack's own versions, newest first, as the installer lists them. */
    private void pickModpackVersion(ModDetail detail, ModpackApi api) {
        new AlertDialog.Builder(requireContext())
                .setTitle(detail.title)
                .setItems(detail.versionNames, (d, index) -> {
                    api.handleInstallation(requireContext(), detail, index);
                    Toast.makeText(requireContext(), R.string.pisan_mods_modpack_started,
                            Toast.LENGTH_LONG).show();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void setBusy(boolean busy) {
        mProgress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }

    private void showError(Exception e) {
        final String message = e.getMessage() == null ? e.toString() : e.getMessage();
        Tools.runOnUiThread(() -> {
            if (!isAdded()) return;
            setBusy(false);
            mStatus.setText(message);
        });
    }

    private static class Hit {
        final String slug;
        final String projectId;
        final String title;
        final String description;
        final String iconUrl;
        volatile String latestVersionNumber;
        volatile boolean checkingUpdate;
        /** Carried per result: the featured list mixes every kind together. */
        final Kind kind;

        Hit(String slug, String projectId, String title, String description, String iconUrl,
            String latestVersionNumber, Kind kind) {
            this.slug = slug;
            this.projectId = projectId;
            this.title = title;
            this.description = description;
            this.iconUrl = iconUrl;
            this.latestVersionNumber = latestVersionNumber;
            this.kind = kind;
        }
    }

    private class ModAdapter extends RecyclerView.Adapter<ModAdapter.Holder> {
        private final List<Hit> mItems = new ArrayList<>();
        /**
         * Icons are small and the same ones come back on every search; a cache
         * keeps scrolling from re-fetching what is already on screen.
         */
        private final LruCache<String, Bitmap> mIcons = new LruCache<>(64);

        void replace(List<Hit> items) {
            mItems.clear();
            mItems.addAll(items);
            notifyDataSetChanged();
        }

        void append(List<Hit> items) {
            int start = mItems.size();
            mItems.addAll(items);
            notifyItemRangeInserted(start, items.size());
        }

        @NonNull
        @Override
        public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new Holder(LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.pk_mod_item, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull Holder holder, int position) {
            holder.bind(mItems.get(position));
        }

        @Override
        public int getItemCount() {
            return mItems.size();
        }

        class Holder extends RecyclerView.ViewHolder {
            private final ImageView mIcon;
            private final TextView mTitle;
            private final TextView mDescription;
            private final TextView mUpdate;

            Holder(@NonNull View itemView) {
                super(itemView);
                mIcon = itemView.findViewById(R.id.pk_mod_icon);
                mTitle = itemView.findViewById(R.id.pk_mod_title);
                mDescription = itemView.findViewById(R.id.pk_mod_description);
                mUpdate = itemView.findViewById(R.id.pk_mod_update);
            }

            void bind(Hit hit) {
                // The featured list mixes kinds, so each row says what it is.
                mTitle.setText(mFeatured
                        ? hit.title + " · " + getString(hit.kind.label)
                        : hit.title);
                mDescription.setText(hit.description);
                PisanKusInstalledContent.Entry installed = mInstalled.get(hit.projectId);
                if (installed != null && hit.latestVersionNumber == null) resolveUpdateBadge(hit);
                boolean update = installed != null && hit.latestVersionNumber != null
                        && !hit.latestVersionNumber.isEmpty()
                        && !hit.latestVersionNumber.equals(installed.versionNumber);
                mUpdate.setVisibility(update ? View.VISIBLE : View.GONE);
                itemView.setOnClickListener(v -> confirmInstall(hit));
                loadIcon(hit);
            }

            private void loadIcon(Hit hit) {
                mIcon.setImageDrawable(null);
                if (hit.iconUrl == null || hit.iconUrl.isEmpty()) return;
                Bitmap cached = mIcons.get(hit.iconUrl);
                if (cached != null) {
                    mIcon.setImageBitmap(cached);
                    return;
                }
                final String url = hit.iconUrl;
                PojavApplication.sExecutorService.execute(() -> {
                    try {
                        byte[] data = PisanKusModrinth.downloadBytes(url);
                        final Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length);
                        if (bitmap == null) return;
                        mIcons.put(url, bitmap);
                        Tools.runOnUiThread(() -> {
                            // The row may have been recycled onto another item
                            // while the icon was in flight.
                            if (url.equals(currentUrl())) mIcon.setImageBitmap(bitmap);
                        });
                    } catch (Exception ignored) {
                        // An icon that will not load is not worth reporting.
                    }
                });
            }

            private String currentUrl() {
                int position = getBindingAdapterPosition();
                if (position < 0 || position >= mItems.size()) return null;
                return mItems.get(position).iconUrl;
            }
        }
    }
}
