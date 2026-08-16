package net.kdt.pojavlaunch.fragments;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.modloaders.pisan.ModrinthClient;
import net.kdt.pojavlaunch.modloaders.pisan.PisanModInstaller;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.DownloadUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The mods PisanKus publishes, and a way to put one in the profile you are
 * playing.
 *
 * The desktop launcher has a whole Modrinth browser with this as one tab; the
 * phone gets the tab. Searching all of Modrinth on a small screen is a
 * different piece of work, while the list of our own mods is short, fixed and
 * the reason most players would go looking in the first place.
 *
 * Where a mod lands is not asked. It goes to the profile selected on the main
 * screen — the one about to be launched — and the line at the top says which
 * that is, so the answer is visible rather than assumed.
 */
public class PisanModsFragment extends Fragment {
    public static final String TAG = "PisanModsFragment";

    /** The publisher whose catalogue this screen is. Same account the desktop tab reads. */
    private static final String AUTHOR = "pisankusgaming";

    /** Where a long press goes, for the details a list row has no room for. */
    private static final String MODRINTH_PAGE = "https://modrinth.com/mod/";

    private final Map<String, Bitmap> mIcons = new HashMap<>();
    private final Set<String> mIconsLoading = new HashSet<>();
    private final List<ModrinthClient.Project> mProjects = new ArrayList<>();

    private TextView mTargetLabel;
    private ProgressBar mProgressBar;
    private View mRetryView;
    private ListView mListView;
    private ModAdapter mAdapter;

    @Nullable private PisanModInstaller.Target mTarget;

    public PisanModsFragment() {
        super(R.layout.fragment_pisan_mods);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mTargetLabel = view.findViewById(R.id.pisan_mods_target);
        mProgressBar = view.findViewById(R.id.pisan_mods_progress);
        mRetryView = view.findViewById(R.id.pisan_mods_retry_layout);
        mListView = view.findViewById(R.id.pisan_mods_list);
        view.findViewById(R.id.pisan_mods_retry_button).setOnClickListener(v -> load());

        mAdapter = new ModAdapter();
        mListView.setAdapter(mAdapter);
        mListView.setOnItemClickListener((parent, itemView, position, id) -> confirm(mProjects.get(position)));
        // A row says a title and a sentence; the page says what the mod is,
        // what it looks like and which versions it runs on.
        mListView.setOnItemLongClickListener((parent, itemView, position, id) -> {
            ModrinthClient.Project project = mProjects.get(position);
            Tools.openURL(requireActivity(), MODRINTH_PAGE + project.slug);
            return true;
        });

        load();
    }

    /**
     * Reads the catalogue and the profile it would install into.
     *
     * Both together, because neither is useful alone: a list of mods with
     * nowhere to put them is a catalogue, and a profile with no list is a blank
     * screen.
     */
    private void load() {
        mRetryView.setVisibility(View.GONE);
        mProgressBar.setVisibility(View.VISIBLE);
        mTargetLabel.setText(R.string.pisan_mods_loading);

        PojavApplication.sExecutorService.execute(() -> {
            PisanModInstaller.Target target = null;
            String targetProblem = null;
            try {
                target = PisanModInstaller.currentTarget();
            } catch (IOException e) {
                targetProblem = message(e);
            }

            final PisanModInstaller.Target readTarget = target;
            final String problem = targetProblem;
            try {
                List<ModrinthClient.Project> projects = ModrinthClient.listUserProjects(AUTHOR);
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    mProgressBar.setVisibility(View.GONE);
                    mTarget = readTarget;
                    mProjects.clear();
                    mProjects.addAll(projects);
                    mAdapter.notifyDataSetChanged();
                    describeTarget(readTarget, problem, projects.size());
                });
            } catch (IOException e) {
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    mProgressBar.setVisibility(View.GONE);
                    mRetryView.setVisibility(View.VISIBLE);
                    mTargetLabel.setText(message(e));
                });
            }
        });
    }

    private void describeTarget(@Nullable PisanModInstaller.Target target, @Nullable String problem, int count) {
        if (target == null) {
            mTargetLabel.setText(problem == null ? getString(R.string.pisan_mods_no_target) : problem);
        } else if (!target.acceptsMods()) {
            mTargetLabel.setText(getString(R.string.pisan_mods_vanilla_target, target.profileName, target.gameVersion));
        } else {
            mTargetLabel.setText(getString(R.string.pisan_mods_target, count, target.profileName,
                    target.gameVersion, target.loader));
        }
    }

    private void confirm(ModrinthClient.Project project) {
        if (mTarget == null) {
            Tools.dialog(requireContext(), getString(R.string.global_error), mTargetLabel.getText().toString());
            return;
        }
        if (!mTarget.acceptsMods()) {
            // A vanilla profile has no loader to run a mod, and dropping a jar
            // into its folder would do nothing but look like it worked.
            Tools.dialog(requireContext(), getString(R.string.global_error),
                    getString(R.string.pisan_mods_needs_loader));
            return;
        }
        if (ProgressKeeper.hasOngoingTasks()) {
            Toast.makeText(requireContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
            return;
        }

        new AlertDialog.Builder(requireContext())
                .setTitle(project.title)
                .setMessage(getString(R.string.pisan_mods_confirm, project.title, mTarget.profileName,
                        mTarget.gameVersion, mTarget.loader))
                .setPositiveButton(R.string.pisan_mods_install, (dialog, which) -> install(project))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void install(ModrinthClient.Project project) {
        final PisanModInstaller.Target target = mTarget;
        if (target == null) return;

        mListView.setEnabled(false);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanModInstaller.Report report = PisanModInstaller.install(project, target);
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    mListView.setEnabled(true);
                    Tools.dialog(requireContext(), getString(R.string.pisan_mods_installed_title),
                            summary(project, report));
                });
            } catch (IOException e) {
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    mListView.setEnabled(true);
                    Tools.dialog(requireContext(), getString(R.string.global_error), message(e));
                });
            } finally {
                ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
            }
        });
    }

    /** What went in, and what the mod asked for that could not be found. */
    private String summary(ModrinthClient.Project project, PisanModInstaller.Report report) {
        StringBuilder message = new StringBuilder(getString(R.string.pisan_mods_installed,
                project.title, report.installed.size()));
        for (String name : report.installed) message.append("\n• ").append(name);
        if (!report.skipped.isEmpty()) {
            message.append(getString(R.string.pisan_mods_skipped));
            for (String name : report.skipped) message.append("\n• ").append(name);
        }
        return message.toString();
    }

    private String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.toString() : detail;
    }

    /**
     * Fetches a project's icon once, when its row first appears.
     *
     * The catalogue is small, but the icons are still a request each and the
     * list is drawn long before they arrive, so a row shows its text
     * immediately and gains its picture later.
     */
    private void requestIcon(ModrinthClient.Project project) {
        if (project.iconUrl == null || mIcons.containsKey(project.id) || !mIconsLoading.add(project.id)) return;

        PojavApplication.sExecutorService.execute(() -> {
            Bitmap icon = null;
            try {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                DownloadUtils.download(project.iconUrl, buffer);
                byte[] bytes = buffer.toByteArray();
                icon = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (IOException ignored) {
                // A row without its picture is still a row that installs.
            }
            final Bitmap loaded = icon;
            Tools.runOnUiThread(() -> {
                if (getContext() == null || loaded == null) return;
                mIcons.put(project.id, loaded);
                mAdapter.notifyDataSetChanged();
            });
        });
    }

    private class ModAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return mProjects.size();
        }

        @Override
        public Object getItem(int position) {
            return mProjects.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View row = convertView;
            if (row == null) {
                row = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_pisan_mod, parent, false);
            }

            ModrinthClient.Project project = mProjects.get(position);
            ((TextView) row.findViewById(R.id.pisan_mod_title)).setText(project.title);
            ((TextView) row.findViewById(R.id.pisan_mod_description)).setText(project.description);

            ImageView icon = row.findViewById(R.id.pisan_mod_icon);
            Bitmap loaded = mIcons.get(project.id);
            if (loaded != null) icon.setImageBitmap(loaded);
            else {
                icon.setImageDrawable(null);
                requestIcon(project);
            }
            return row;
        }
    }
}
