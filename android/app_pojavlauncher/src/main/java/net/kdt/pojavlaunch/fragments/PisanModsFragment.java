package net.kdt.pojavlaunch.fragments;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.LruCache;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import net.kdt.pojavlaunch.PisanKusModrinth;
import net.kdt.pojavlaunch.PisanKusProfileTarget;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Installs single mods into the selected profile — the desktop launcher's
 * Keşfet, in the shape a phone can use.
 *
 * Upstream can install modpacks, which always create a profile of their own.
 * What was missing is the ordinary case: a player who already has a Fabric
 * profile and wants one more mod in it.
 */
public class PisanModsFragment extends Fragment {
    public static final String TAG = "PisanModsFragment";
    private static final int PAGE_SIZE = 30;
    /** Modrinth's own index names, in the order the spinner lists them. */
    private static final String[] SORTS = {"relevance", "downloads", "follows", "updated", "newest"};
    private static final int[] SORT_LABELS = {
            R.string.pisan_mods_sort_relevance,
            R.string.pisan_mods_sort_downloads,
            R.string.pisan_mods_sort_follows,
            R.string.pisan_mods_sort_updated,
            R.string.pisan_mods_sort_newest
    };

    private EditText mSearch;
    private ProgressBar mProgress;
    private TextView mStatus;
    private TextView mTarget;
    private RecyclerView mList;
    private Spinner mSort;
    private CheckBox mVersionFilter;

    private PisanKusProfileTarget mProfile;
    private final ModAdapter mAdapter = new ModAdapter();
    /** Where the next page starts, and how many there are in all. */
    private int mLoaded;
    private int mTotal;
    private String mQuery = "";
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
        mSort = view.findViewById(R.id.pisan_mods_sort);
        mVersionFilter = view.findViewById(R.id.pisan_mods_version_filter);
        mList = view.findViewById(R.id.pisan_mods_list);
        LinearLayoutManager layout = new LinearLayoutManager(requireContext());
        mList.setLayoutManager(layout);
        mList.setAdapter(mAdapter);

        // Modrinth pages its search, so the rest of the catalogue arrives as the
        // player reaches the end of what is on screen rather than stopping at
        // the first thirty.
        mList.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                if (dy <= 0 || mLoading || mLoaded >= mTotal) return;
                if (layout.findLastVisibleItemPosition() >= mAdapter.getItemCount() - 5) loadMore();
            }
        });

        mProfile = PisanKusProfileTarget.current();
        if (mProfile == null) {
            mTarget.setText(R.string.pisan_mods_no_profile);
            mSearch.setEnabled(false);
            return;
        }
        mTarget.setText(getString(R.string.pisan_mods_target,
                mProfile.profileName,
                mProfile.loadsMods() ? mProfile.loader : getString(R.string.pisan_mods_no_loader_word),
                mProfile.gameVersion));

        if (!mProfile.loadsMods()) {
            // Nothing here can help a vanilla profile: a mod dropped into it is
            // simply not read.
            mSearch.setEnabled(false);
            mStatus.setText(R.string.pisan_mods_needs_loader);
            return;
        }

        mSearch.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                mQuery = mSearch.getText().toString();
                restart();
                return true;
            }
            return false;
        });

        String[] labels = new String[SORT_LABELS.length];
        for (int i = 0; i < labels.length; i++) labels[i] = getString(SORT_LABELS[i]);
        mSort.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, labels));
        mSort.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View v, int position, long id) {
                // Fires once while the spinner is being set up, which is also
                // what performs the screen's first search.
                restart();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        mVersionFilter.setOnCheckedChangeListener((v, checked) -> restart());
    }

    /** A new set of results: back to the first page. */
    private void restart() {
        mGeneration++;
        mLoaded = 0;
        mTotal = 0;
        // Whatever is in flight belongs to the previous search, so the new one
        // must not be held back waiting for it.
        mLoading = false;
        mAdapter.replace(new ArrayList<>());
        loadMore();
    }

    private void loadMore() {
        if (mLoading) return;
        mLoading = true;
        final int generation = mGeneration;
        final int offset = mLoaded;
        setBusy(true);
        mStatus.setText(offset == 0 ? getString(R.string.pisan_mods_searching)
                : getString(R.string.pisan_mods_loading_more));
        final String sort = SORTS[Math.max(0, Math.min(SORTS.length - 1, mSort.getSelectedItemPosition()))];
        final String gameVersion = mVersionFilter.isChecked() ? mProfile.gameVersion : null;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusModrinth.SearchPage page = PisanKusModrinth.searchMods(
                        mQuery, mProfile.loader, gameVersion, sort, offset, PAGE_SIZE);
                final List<ModHit> results = new ArrayList<>();
                JSONArray hits = page.hits;
                if (hits != null) {
                    for (int i = 0; i < hits.length(); i++) {
                        JSONObject hit = hits.optJSONObject(i);
                        if (hit == null) continue;
                        results.add(new ModHit(
                                hit.optString("slug", hit.optString("project_id")),
                                hit.optString("title"),
                                hit.optString("description"),
                                hit.optString("icon_url", null)));
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

    private void confirmInstall(ModHit hit) {
        new AlertDialog.Builder(requireContext())
                .setTitle(hit.title)
                .setMessage(getString(R.string.pisan_mods_confirm, hit.title, mProfile.profileName))
                .setPositiveButton(R.string.pisan_mods_install, (d, w) -> install(hit))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void install(ModHit hit) {
        setBusy(true);
        mStatus.setText(getString(R.string.pisan_mods_installing, hit.title));
        PojavApplication.sExecutorService.execute(() -> {
            try {
                JSONObject version = PisanKusModrinth.latestVersion(
                        hit.slug, mProfile.loader, mProfile.gameVersion);
                if (version == null) {
                    Tools.runOnUiThread(() -> {
                        if (!isAdded()) return;
                        setBusy(false);
                        mStatus.setText(getString(R.string.pisan_mods_no_version,
                                hit.title, mProfile.gameVersion));
                    });
                    return;
                }
                final String fileName = PisanKusModrinth.downloadPrimaryFile(version, mProfile.modsDir);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    mStatus.setText(getString(R.string.pisan_mods_installed, fileName));
                });
            } catch (Exception e) {
                showError(e);
            }
        });
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

    private static class ModHit {
        final String slug;
        final String title;
        final String description;
        final String iconUrl;

        ModHit(String slug, String title, String description, String iconUrl) {
            this.slug = slug;
            this.title = title;
            this.description = description;
            this.iconUrl = iconUrl;
        }
    }

    private class ModAdapter extends RecyclerView.Adapter<ModAdapter.Holder> {
        private final List<ModHit> mItems = new ArrayList<>();
        /**
         * Icons are small and the same ones come back on every search; a cache
         * keeps scrolling from re-fetching what is already on screen.
         */
        private final LruCache<String, Bitmap> mIcons = new LruCache<>(64);

        void replace(List<ModHit> items) {
            mItems.clear();
            mItems.addAll(items);
            notifyDataSetChanged();
        }

        void append(List<ModHit> items) {
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

            Holder(@NonNull View itemView) {
                super(itemView);
                mIcon = itemView.findViewById(R.id.pk_mod_icon);
                mTitle = itemView.findViewById(R.id.pk_mod_title);
                mDescription = itemView.findViewById(R.id.pk_mod_description);
            }

            void bind(ModHit hit) {
                mTitle.setText(hit.title);
                mDescription.setText(hit.description);
                itemView.setOnClickListener(v -> confirmInstall(hit));
                loadIcon(hit);
            }

            private void loadIcon(ModHit hit) {
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
                            // The row may have been recycled onto another mod
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
