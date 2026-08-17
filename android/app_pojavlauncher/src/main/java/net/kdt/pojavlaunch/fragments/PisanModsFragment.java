package net.kdt.pojavlaunch.fragments;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.LruCache;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ProgressBar;
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

    private EditText mSearch;
    private ProgressBar mProgress;
    private TextView mStatus;
    private TextView mTarget;
    private RecyclerView mList;

    private PisanKusProfileTarget mProfile;
    private final ModAdapter mAdapter = new ModAdapter();

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
        mList = view.findViewById(R.id.pisan_mods_list);
        mList.setLayoutManager(new LinearLayoutManager(requireContext()));
        mList.setAdapter(mAdapter);

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
                search(mSearch.getText().toString());
                return true;
            }
            return false;
        });
        // Opens on the popular mods for this profile, so the screen is useful
        // before anything is typed.
        search("");
    }

    private void search(String query) {
        setBusy(true);
        mStatus.setText(R.string.pisan_mods_searching);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                JSONArray hits = PisanKusModrinth.searchMods(
                        query, mProfile.loader, mProfile.gameVersion, 0, PAGE_SIZE);
                final List<ModHit> results = new ArrayList<>();
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
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    mAdapter.replace(results);
                    mStatus.setText(results.isEmpty()
                            ? getString(R.string.pisan_mods_empty)
                            : getString(R.string.pisan_mods_found, results.size()));
                });
            } catch (Exception e) {
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
        mSearch.setEnabled(!busy);
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
