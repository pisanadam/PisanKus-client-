package net.kdt.pojavlaunch.fragments;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.kdt.mcgui.MineButton;

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.ModloaderListenerProxy;
import net.kdt.pojavlaunch.modloaders.modpacks.SelfReferencingFuture;
import net.kdt.pojavlaunch.modloaders.pisan.PisanPackDownloadTask;
import net.kdt.pojavlaunch.modloaders.pisan.PisanPackUtils;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.Future;

/**
 * The one screen the pack needs: pick a Minecraft version, press install.
 *
 * The version list is not the full Minecraft one. It is the set of versions every
 * essential mod has a build for, so a version that cannot carry the pack is never
 * offered in the first place.
 */
public class PisanPackInstallFragment extends Fragment implements ModloaderDownloadListener {
    public static final String TAG = "PisanPackInstallFragment";
    private static final String PROXY_TAG = TAG + "_proxy";

    private Spinner mVersionSpinner;
    private MineButton mInstallButton;
    private ProgressBar mProgressBar;
    private View mRetryView;
    private Future<?> mVersionFuture;
    private String mSelectedVersion;

    public PisanPackInstallFragment() {
        super(R.layout.fragment_pisan_pack_install);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mVersionSpinner = view.findViewById(R.id.pisan_pack_version_spinner);
        mVersionSpinner.setOnItemSelectedListener(new VersionSelectedListener());
        mInstallButton = view.findViewById(R.id.pisan_pack_install_button);
        mInstallButton.setOnClickListener(this::onClickInstall);
        mProgressBar = view.findViewById(R.id.pisan_pack_progress_bar);
        mRetryView = view.findViewById(R.id.pisan_pack_retry_layout);
        view.findViewById(R.id.pisan_pack_retry_button).setOnClickListener(v -> loadVersions());

        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) {
            mInstallButton.setEnabled(false);
            proxy.attachListener(this);
        }
        loadVersions();
    }

    @Override
    public void onStop() {
        if (mVersionFuture != null && !mVersionFuture.isCancelled()) mVersionFuture.cancel(true);
        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) proxy.detachListener();
        super.onStop();
    }

    private void onClickInstall(View view) {
        if (ProgressKeeper.hasOngoingTasks()) {
            Toast.makeText(view.getContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
            return;
        }
        ModloaderListenerProxy proxy = new ModloaderListenerProxy();
        PisanPackDownloadTask task = new PisanPackDownloadTask(proxy, view.getContext(), mSelectedVersion);
        proxy.attachListener(this);
        setListenerProxy(proxy);
        mInstallButton.setEnabled(false);
        new Thread(task).start();
    }

    private void loadVersions() {
        mRetryView.setVisibility(View.GONE);
        mProgressBar.setVisibility(View.VISIBLE);
        mInstallButton.setEnabled(false);
        mVersionFuture = new SelfReferencingFuture(new LoadVersionsTask())
                .startOnExecutor(PojavApplication.sExecutorService);
    }

    class LoadVersionsTask implements SelfReferencingFuture.FutureInterface {
        @Override
        public void run(Future<?> myFuture) {
            try {
                List<String> versions = PisanPackUtils.gameVersions();
                Tools.runOnUiThread(() -> {
                    if (myFuture.isCancelled() || getContext() == null) return;
                    mProgressBar.setVisibility(View.GONE);
                    if (versions.isEmpty()) {
                        mRetryView.setVisibility(View.VISIBLE);
                        return;
                    }
                    mVersionSpinner.setAdapter(new ArrayAdapter<>(requireContext(),
                            android.R.layout.simple_spinner_dropdown_item, versions));
                });
            } catch (IOException e) {
                Tools.runOnUiThread(() -> {
                    if (myFuture.isCancelled() || getContext() == null) return;
                    mProgressBar.setVisibility(View.GONE);
                    mRetryView.setVisibility(View.VISIBLE);
                    Tools.showError(requireContext(), e);
                });
            }
        }
    }

    class VersionSelectedListener implements AdapterView.OnItemSelectedListener {
        @Override
        public void onItemSelected(AdapterView<?> adapterView, View view, int position, long id) {
            mSelectedVersion = (String) adapterView.getAdapter().getItem(position);
            updateInstallButton();
        }

        @Override
        public void onNothingSelected(AdapterView<?> adapterView) {
            mSelectedVersion = null;
            updateInstallButton();
        }
    }

    /**
     * Installing needs a version to install and no install already running.
     *
     * The second half matters after a rotation: the screen is rebuilt while the task
     * carries on in the background, and the version list finishing its reload would
     * otherwise hand back a button that starts a second install on top of the first.
     */
    private void updateInstallButton() {
        mInstallButton.setEnabled(mSelectedVersion != null && getListenerProxy() == null);
    }

    @Override
    public void onDownloadFinished(File downloadedFile) {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            clearListenerProxy();
            PisanPackUtils.Resolution report = (PisanPackUtils.Resolution) ExtraCore.getValue(PisanPackDownloadTask.REPORT_TAG);
            ExtraCore.removeValue(PisanPackDownloadTask.REPORT_TAG);
            // Read the comment in FabricInstallFragment.onDownloadFinished() to see why
            // one pop is enough to get back to the main menu.
            getParentFragmentManager().popBackStackImmediate();
            if (report != null) Tools.dialog(context, context.getString(R.string.pisankus_pack_done_title), describe(context, report));
        });
    }

    @Override
    public void onDataNotAvailable() {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            clearListenerProxy();
            updateInstallButton();
            Tools.dialog(context, context.getString(R.string.global_error),
                    context.getString(R.string.pisankus_pack_loader_failed));
        });
    }

    @Override
    public void onDownloadError(Exception e) {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            clearListenerProxy();
            updateInstallButton();
            Tools.showError(context, e);
        });
    }

    /**
     * What the install actually produced.
     *
     * The skipped entries are the whole reason this is shown: a pack resolved against a
     * version nobody has caught up with yet installs fine and quietly lacks a few mods,
     * and the player should hear that from the launcher rather than notice it in game.
     */
    private String describe(Context context, PisanPackUtils.Resolution report) {
        StringBuilder message = new StringBuilder(
                context.getString(R.string.pisankus_pack_done, report.ready.size()));
        if (!report.skipped.isEmpty()) {
            message.append("\n\n").append(context.getString(R.string.pisankus_pack_done_skipped));
            for (PisanPackUtils.SkippedMod skipped : report.skipped) {
                message.append("\n• ").append(skipped.name).append(" — ").append(skipped.reason);
            }
        }
        return message.toString();
    }

    private ModloaderListenerProxy getListenerProxy() {
        return (ModloaderListenerProxy) ExtraCore.getValue(PROXY_TAG);
    }

    private void setListenerProxy(ModloaderListenerProxy proxy) {
        ExtraCore.setValue(PROXY_TAG, proxy);
    }

    private void clearListenerProxy() {
        ExtraCore.removeValue(PROXY_TAG);
    }
}
