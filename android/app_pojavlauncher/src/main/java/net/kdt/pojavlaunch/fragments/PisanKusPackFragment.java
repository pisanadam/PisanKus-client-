package net.kdt.pojavlaunch.fragments;

import android.content.Intent;
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

import net.kdt.pojavlaunch.JavaGUILauncherActivity;
import net.kdt.pojavlaunch.PisanKusPackInstaller;
import net.kdt.pojavlaunch.PisanKusPacks;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.modloaders.ForgeDownloadTask;
import net.kdt.pojavlaunch.modloaders.ForgeUtils;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.ModloaderListenerProxy;
import net.kdt.pojavlaunch.modloaders.PisanKusPackDownloadTask;
import net.kdt.pojavlaunch.modloaders.modpacks.SelfReferencingFuture;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;

/**
 * Installs one of the launcher's own packs: pick a Minecraft version, get a
 * profile with the whole pack already in it.
 *
 * Deliberately few choices. The plain loader screens also ask for a loader
 * build, which is a question a player installing a curated pack has no way to
 * answer and no reason to be asked.
 *
 * A Forge pack takes one extra step, and the screen says so rather than hiding
 * it: Forge is installed by running its own installer, which on Android is a
 * separate screen that finishes on its own time. So the player installs Forge
 * first, comes back, and the pack goes on top.
 */
public class PisanKusPackFragment extends Fragment implements ModloaderDownloadListener {
    public static final String TAG = "PisanKusPackFragment";
    public static final String ARG_PACK = "pack";
    private static final String EXTRA_TAG = TAG + "_proxy";

    private Spinner mGameVersionSpinner;
    private FabricVersion[] mGameVersionArray;
    private Future<?> mGameVersionFuture;
    private String mSelectedGameVersion;
    private ProgressBar mProgressBar;
    private Button mStartButton;
    private Button mLoaderButton;
    private TextView mNote;
    private View mRetryView;

    private PisanKusPacks.Pack mPack;

    public PisanKusPackFragment() {
        super(R.layout.fragment_pisan_optimized_install);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        Bundle args = getArguments();
        mPack = PisanKusPacks.byId(args == null ? "" : args.getString(ARG_PACK, ""));

        mStartButton = view.findViewById(R.id.pisan_optimized_start_button);
        mStartButton.setOnClickListener(this::onClickStart);
        mLoaderButton = view.findViewById(R.id.pisan_optimized_loader_button);
        mLoaderButton.setOnClickListener(v -> installForge());
        mGameVersionSpinner = view.findViewById(R.id.pisan_optimized_game_ver_spinner);
        mGameVersionSpinner.setOnItemSelectedListener(new GameVersionSelectedListener());
        mProgressBar = view.findViewById(R.id.pisan_optimized_progress_bar);
        mNote = view.findViewById(R.id.pisan_optimized_note);
        mRetryView = view.findViewById(R.id.pisan_optimized_retry_layout);
        view.findViewById(R.id.pisan_optimized_retry_button).setOnClickListener(this::onClickRetry);

        ((TextView) view.findViewById(R.id.title_textview)).setText(mPack.name);
        ((TextView) view.findViewById(R.id.pisan_optimized_summary))
                .setText(getString(R.string.pisan_pack_summary, mPack.mods.length,
                        mPack.loader.substring(0, 1).toUpperCase() + mPack.loader.substring(1)));
        mNote.setText(needsForge()
                ? getString(R.string.pisan_pack_note_forge)
                : getString(R.string.pisan_optimized_note));
        mLoaderButton.setVisibility(needsForge() ? View.VISIBLE : View.GONE);

        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) {
            // An install started before a rotation is still running; rejoin it
            // instead of offering to start a second one.
            mStartButton.setEnabled(false);
            proxy.attachListener(this);
        }
        updateGameVersions();
    }

    private boolean needsForge() {
        return "forge".equals(mPack.loader);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Coming back from the Forge installer: the step may be done now.
        refreshLoaderState();
    }

    @Override
    public void onStop() {
        if (mGameVersionFuture != null && !mGameVersionFuture.isCancelled()) mGameVersionFuture.cancel(true);
        ModloaderListenerProxy proxy = getListenerProxy();
        if (proxy != null) proxy.detachListener();
        super.onStop();
    }

    /** For a Forge pack, whether step one is behind us. */
    private void refreshLoaderState() {
        if (!needsForge() || mSelectedGameVersion == null) return;
        String installed = PisanKusPackDownloadTask.installedForgeVersion(mSelectedGameVersion);
        mLoaderButton.setText(installed == null
                ? getString(R.string.pisan_pack_install_forge, mSelectedGameVersion)
                : getString(R.string.pisan_pack_forge_ready, installed));
        mLoaderButton.setEnabled(installed == null);
        mStartButton.setEnabled(installed != null && !ProgressKeeper.hasOngoingTasks());
    }

    /**
     * Step one of a Forge pack: hand Forge's own installer to the Java activity.
     *
     * The loader build is chosen the same way the pack chooses everything else —
     * the newest Forge for this Minecraft version — so the player is not asked.
     */
    private void installForge() {
        if (mSelectedGameVersion == null) return;
        mLoaderButton.setEnabled(false);
        mStartButton.setEnabled(false);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                List<String> versions = ForgeUtils.downloadForgeVersions();
                String prefix = mSelectedGameVersion + "-";
                String newest = null;
                if (versions != null) {
                    for (String version : versions) {
                        if (version.startsWith(prefix)) {
                            newest = version;
                            break;
                        }
                    }
                }
                if (newest == null) {
                    Tools.runOnUiThread(() -> {
                        if (!isAdded()) return;
                        Toast.makeText(requireContext(),
                                getString(R.string.pisan_pack_no_forge, mSelectedGameVersion),
                                Toast.LENGTH_LONG).show();
                        refreshLoaderState();
                    });
                    return;
                }

                final String forgeVersion = newest;
                ModloaderListenerProxy proxy = new ModloaderListenerProxy();
                proxy.attachListener(new ModloaderDownloadListener() {
                    @Override
                    public void onDownloadFinished(File file) {
                        Tools.runOnUiThread(() -> {
                            if (!isAdded()) return;
                            Intent intent = new Intent(requireContext(), JavaGUILauncherActivity.class);
                            ForgeUtils.addAutoInstallArgs(intent, file, true);
                            startActivity(intent);
                        });
                    }

                    @Override
                    public void onDataNotAvailable() {
                        Tools.runOnUiThread(() -> {
                            if (!isAdded()) return;
                            Toast.makeText(requireContext(),
                                    getString(R.string.pisan_pack_no_forge, mSelectedGameVersion),
                                    Toast.LENGTH_LONG).show();
                            refreshLoaderState();
                        });
                    }

                    @Override
                    public void onDownloadError(Exception e) {
                        Tools.runOnUiThread(() -> {
                            if (!isAdded()) return;
                            Tools.showError(requireContext(), e);
                            refreshLoaderState();
                        });
                    }
                });
                new ForgeDownloadTask(proxy, forgeVersion).run();
            } catch (Exception e) {
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    Tools.showError(requireContext(), e);
                    refreshLoaderState();
                });
            }
        });
    }

    private void onClickStart(View v) {
        if (ProgressKeeper.hasOngoingTasks()) {
            Toast.makeText(v.getContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
            return;
        }
        ModloaderListenerProxy proxy = new ModloaderListenerProxy();
        PisanKusPackDownloadTask task =
                new PisanKusPackDownloadTask(proxy, mPack, mSelectedGameVersion);
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
            if (e instanceof PisanKusPackInstaller.EssentialMissingException) {
                // Not a fault the player can act on by retrying: the pack simply
                // has no build for that version yet, so say which one is missing.
                Tools.dialog(requireContext(),
                        getString(R.string.global_error),
                        getString(R.string.pisan_optimized_essential_missing,
                                ((PisanKusPackInstaller.EssentialMissingException) e).mod.name,
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

    /**
     * Releases only, and the pack's own version first.
     *
     * A pack is built around one version — the one nearly all of its mods have a
     * build for — so that is what the screen opens on, with the rest still
     * selectable for anyone who wants to try.
     */
    private void updateGameSpinner() {
        if (mGameVersionArray == null) return;
        ArrayList<FabricVersion> releases = new ArrayList<>(mGameVersionArray.length);
        int defaultIndex = 0;
        for (FabricVersion version : mGameVersionArray) {
            if (!version.stable) continue;
            if (mPack.defaultVersion.equals(version.version)) defaultIndex = releases.size();
            releases.add(version);
        }
        releases.trimToSize();
        mGameVersionSpinner.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, releases));
        mGameVersionSpinner.setSelection(defaultIndex);
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
            if (needsForge()) refreshLoaderState();
            else mStartButton.setEnabled(true);
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
