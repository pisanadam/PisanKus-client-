package net.kdt.pojavlaunch.fragments;

import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.PisanOptimizedInstaller;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.ModloaderListenerProxy;
import net.kdt.pojavlaunch.modloaders.PisanOptimizedDownloadTask;
import net.kdt.pojavlaunch.modloaders.modpacks.SelfReferencingFuture;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.concurrent.Future;

/**
 * The Pisan Optimized screen: pick a Minecraft version, get a Fabric profile
 * with the whole pack already in it.
 *
 * Deliberately one choice. The plain Fabric screen also asks for a loader
 * build, which is a question a player installing a curated pack has no way to
 * answer and no reason to be asked.
 */
public class PisanOptimizedInstallFragment extends Fragment implements ModloaderDownloadListener {
    public static final String TAG = "PisanOptimizedInstallFragment";
    private static final String EXTRA_TAG = TAG + "_proxy";

    private Spinner mGameVersionSpinner;
    private FabricVersion[] mGameVersionArray;
    private Future<?> mGameVersionFuture;
    private String mSelectedGameVersion;
    private ProgressBar mProgressBar;
    private Button mStartButton;
    private View mRetryView;

    public PisanOptimizedInstallFragment() {
        super(R.layout.fragment_pisan_optimized_install);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mStartButton = view.findViewById(R.id.pisan_optimized_start_button);
        mStartButton.setOnClickListener(this::onClickStart);
        mGameVersionSpinner = view.findViewById(R.id.pisan_optimized_game_ver_spinner);
        mGameVersionSpinner.setOnItemSelectedListener(new GameVersionSelectedListener());
        mProgressBar = view.findViewById(R.id.pisan_optimized_progress_bar);
        mRetryView = view.findViewById(R.id.pisan_optimized_retry_layout);
        view.findViewById(R.id.pisan_optimized_retry_button).setOnClickListener(this::onClickRetry);

        ((TextView) view.findViewById(R.id.pisan_optimized_summary))
                .setText(getString(R.string.pisan_optimized_summary, PisanOptimizedInstaller.modCount()));

        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) {
            // An install started before a rotation is still running; rejoin it
            // instead of offering to start a second one.
            mStartButton.setEnabled(false);
            proxy.attachListener(this);
        }
        updateGameVersions();
    }

    @Override
    public void onStop() {
        if (mGameVersionFuture != null && !mGameVersionFuture.isCancelled()) mGameVersionFuture.cancel(true);
        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) proxy.detachListener();
        super.onStop();
    }

    private void onClickStart(View v) {
        if (ProgressKeeper.hasOngoingTasks()) {
            Toast.makeText(v.getContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
            return;
        }
        ModloaderListenerProxy proxy = new ModloaderListenerProxy();
        PisanOptimizedDownloadTask task = new PisanOptimizedDownloadTask(proxy, mSelectedGameVersion);
        proxy.attachListener(this);
        setListenerProxy(proxy);
        mStartButton.setEnabled(false);
        new Thread(task).start();
    }

    private void onClickRetry(View v) {
        mStartButton.setEnabled(false);
        mRetryView.setVisibility(View.GONE);
        mGameVersionSpinner.setAdapter(null);
        updateGameVersions();
    }

    @Override
    public void onDownloadFinished(File downloadedFile) {
        Tools.runOnUiThread(() -> {
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mStartButton.setEnabled(true);
            // Same as the modloader screens: this fragment replaced the previous
            // one without its own back stack entry, so one pop lands on the main
            // menu, where the new profile is waiting.
            getParentFragmentManager().popBackStackImmediate();
        });
    }

    @Override
    public void onDataNotAvailable() {
        Tools.runOnUiThread(() -> {
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mStartButton.setEnabled(true);
            Tools.dialog(requireContext(),
                    getString(R.string.global_error),
                    getString(R.string.pisan_optimized_no_loader, mSelectedGameVersion));
        });
    }

    @Override
    public void onDownloadError(Exception e) {
        Tools.runOnUiThread(() -> {
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mStartButton.setEnabled(true);
            if (e instanceof PisanOptimizedInstaller.EssentialMissingException) {
                // Not a fault the player can act on by retrying: the pack simply
                // has no build for that version yet, so say which one is missing.
                Tools.dialog(requireContext(),
                        getString(R.string.global_error),
                        getString(R.string.pisan_optimized_essential_missing,
                                ((PisanOptimizedInstaller.EssentialMissingException) e).mod.name,
                                mSelectedGameVersion));
                return;
            }
            Tools.showError(requireContext(), e);
        });
    }

    private void startLoading() {
        mProgressBar.setVisibility(View.VISIBLE);
        mStartButton.setEnabled(false);
    }

    private void stopLoading() {
        mProgressBar.setVisibility(View.GONE);
    }

    private void updateGameVersions() {
        startLoading();
        mGameVersionFuture = new SelfReferencingFuture(new LoadGameVersionsTask())
                .startOnExecutor(PojavApplication.sExecutorService);
    }

    /** Releases only: the pack's mods are not published for snapshots. */
    private void updateGameSpinner() {
        if (mGameVersionArray == null) return;
        ArrayList<FabricVersion> releases = new ArrayList<>(mGameVersionArray.length);
        for (FabricVersion version : mGameVersionArray) {
            if (version.stable) releases.add(version);
        }
        releases.trimToSize();
        mGameVersionSpinner.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, releases));
    }

    private void onException(Future<?> myFuture, Exception e) {
        Tools.runOnUiThread(() -> {
            if (myFuture.isCancelled()) return;
            stopLoading();
            if (e != null) Tools.showError(requireContext(), e);
            mRetryView.setVisibility(View.VISIBLE);
        });
    }

    class GameVersionSelectedListener implements AdapterView.OnItemSelectedListener {
        @Override
        public void onItemSelected(AdapterView<?> adapterView, View view, int i, long l) {
            mSelectedGameVersion = ((FabricVersion) adapterView.getAdapter().getItem(i)).version;
            mStartButton.setEnabled(true);
        }

        @Override
        public void onNothingSelected(AdapterView<?> adapterView) {
            mSelectedGameVersion = null;
            mStartButton.setEnabled(false);
        }
    }

    class LoadGameVersionsTask implements SelfReferencingFuture.FutureInterface {
        @Override
        public void run(Future<?> myFuture) {
            try {
                mGameVersionArray = FabriclikeUtils.FABRIC_UTILS.downloadGameVersions();
                if (mGameVersionArray == null) {
                    onException(myFuture, null);
                    return;
                }
                Tools.runOnUiThread(() -> {
                    if (myFuture.isCancelled()) return;
                    stopLoading();
                    updateGameSpinner();
                });
            } catch (IOException e) {
                onException(myFuture, e);
            }
        }
    }

    private ModloaderListenerProxy getListenerProxy() {
        return (ModloaderListenerProxy) ExtraCore.getValue(EXTRA_TAG);
    }

    private void setListenerProxy(ModloaderListenerProxy listenerProxy) {
        ExtraCore.setValue(EXTRA_TAG, listenerProxy);
    }
}
