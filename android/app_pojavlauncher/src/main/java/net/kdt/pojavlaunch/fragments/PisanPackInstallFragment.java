package net.kdt.pojavlaunch.fragments;

import android.content.Context;
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

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.ModloaderListenerProxy;
import net.kdt.pojavlaunch.modloaders.modpacks.SelfReferencingFuture;
import net.kdt.pojavlaunch.modloaders.pisan.PisanPack;
import net.kdt.pojavlaunch.modloaders.pisan.PisanPackInstallTask;
import net.kdt.pojavlaunch.modloaders.pisan.PisanPackResolver;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.Future;

/**
 * The one screen the Pisan Optimized pack needs: pick a Minecraft version, press
 * install.
 *
 * There is deliberately nothing else on it. Which mods go in, which loader build
 * runs them and where the profile lands are all decided by the pack — a player
 * who wants to make those choices has the plain Fabric installer next door.
 */
public class PisanPackInstallFragment extends Fragment implements ModloaderDownloadListener {
    public static final String TAG = "PisanPackInstallFragment";
    private static final String EXTRA_PROXY = TAG + "_proxy";

    private Spinner mGameVersionSpinner;
    private TextView mWhyLabel;
    private Button mInstallButton;
    private ProgressBar mProgressBar;
    private View mRetryView;
    private Future<?> mVersionFuture;
    private String mSelectedGameVersion;

    public PisanPackInstallFragment() {
        super(R.layout.fragment_pisan_pack_install);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mInstallButton = view.findViewById(R.id.pisan_pack_install_button);
        mInstallButton.setOnClickListener(this::onClickInstall);
        mGameVersionSpinner = view.findViewById(R.id.pisan_pack_game_ver_spinner);
        mGameVersionSpinner.setOnItemSelectedListener(new GameVersionSelectedListener());
        mWhyLabel = view.findViewById(R.id.pisan_pack_why);
        showContents(view);
        mProgressBar = view.findViewById(R.id.pisan_pack_progress_bar);
        mRetryView = view.findViewById(R.id.pisan_pack_retry_layout);
        view.findViewById(R.id.pisan_pack_retry_button).setOnClickListener(this::onClickRetry);

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
        PisanPackInstallTask task = new PisanPackInstallTask(proxy, mSelectedGameVersion);
        proxy.attachListener(this);
        setListenerProxy(proxy);
        mInstallButton.setEnabled(false);
        new Thread(task, "PisanPackInstall").start();
    }

    private void onClickRetry(View view) {
        mRetryView.setVisibility(View.GONE);
        loadVersions();
    }

    @Override
    public void onDownloadFinished(File downloadedFile) {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mInstallButton.setEnabled(true);
            // Same one-pop return as the other installers — read the comment in
            // FabriclikeInstallFragment.onDownloadFinished() for why one is enough.
            getParentFragmentManager().popBackStackImmediate();
            showReport(context);
        });
    }

    @Override
    public void onDataNotAvailable() {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mInstallButton.setEnabled(true);
            Tools.dialog(context, context.getString(R.string.global_error),
                    context.getString(R.string.modloader_dl_failed_to_load_list));
        });
    }

    @Override
    public void onDownloadError(Exception e) {
        Tools.runOnUiThread(() -> {
            Context context = requireContext();
            getListenerProxy().detachListener();
            setListenerProxy(null);
            mInstallButton.setEnabled(true);
            Tools.showError(context, e);
        });
    }

    /**
     * Tells the player what actually went in.
     *
     * A pack that quietly dropped four mods because they have no build for the
     * chosen version would otherwise look identical to one that installed whole,
     * and the difference only shows up in game.
     */
    private void showReport(Context context) {
        Object report = ExtraCore.consumeValue(PisanPackInstallTask.EXTRA_REPORT);
        if (!(report instanceof PisanPackResolver.Resolution)) return;
        PisanPackResolver.Resolution resolution = (PisanPackResolver.Resolution) report;

        StringBuilder message = new StringBuilder(context.getString(R.string.pisan_pack_done_message,
                resolution.gameVersion, resolution.ready.size()));
        if (!resolution.skipped.isEmpty()) {
            StringBuilder skipped = new StringBuilder();
            for (PisanPackResolver.SkippedMod mod : resolution.skipped) {
                skipped.append("\n• ").append(mod.name).append(" — ").append(mod.reason);
            }
            message.append(context.getString(R.string.pisan_pack_done_skipped, skipped.toString()));
        }
        Tools.dialog(context, context.getString(R.string.pisan_pack_done_title), message.toString());
    }

    /**
     * Writes out what the pack is, before it is installed.
     *
     * The desktop dialog lists this and the phone did not, which left the player
     * pressing install on thirty-one unnamed mods. The list is the pack's own,
     * so it costs nothing to show and stays right when the pack changes.
     */
    private void showContents(View view) {
        StringBuilder text = new StringBuilder();
        for (PisanPack.Mod mod : PisanPack.MODS) {
            if (text.length() > 0) text.append('\n');
            text.append("• ").append(mod.name).append(" — ").append(mod.role);
        }
        text.append("\n\n").append(getString(R.string.pisan_pack_contents_note));
        ((TextView) view.findViewById(R.id.pisan_pack_contents)).setText(text);
    }

    private void loadVersions() {
        mProgressBar.setVisibility(View.VISIBLE);
        mInstallButton.setEnabled(false);
        mVersionFuture = new SelfReferencingFuture(new LoadVersionsTask())
                .startOnExecutor(PojavApplication.sExecutorService);
    }

    class LoadVersionsTask implements SelfReferencingFuture.FutureInterface {
        @Override
        public void run(Future<?> myFuture) {
            try {
                List<String> versions = PisanPackResolver.supportedVersions();
                Tools.runOnUiThread(() -> {
                    if (myFuture.isCancelled() || getContext() == null) return;
                    mProgressBar.setVisibility(View.GONE);
                    if (versions.isEmpty()) {
                        mRetryView.setVisibility(View.VISIBLE);
                        return;
                    }
                    fillSpinner(versions);
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

    private void fillSpinner(List<String> versions) {
        mGameVersionSpinner.setAdapter(new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_dropdown_item, versions));
        mGameVersionSpinner.setSelection(defaultSelection(versions));
    }

    /**
     * Lands on the first of the pack's recommended versions that is actually
     * installable today, and on the newest one when none of them is.
     */
    private int defaultSelection(List<String> versions) {
        for (PisanPack.Recommended recommended : PisanPack.RECOMMENDED_VERSIONS) {
            int index = versions.indexOf(recommended.version);
            if (index != -1) return index;
        }
        return 0;
    }

    /** Says why a version is recommended, and says nothing about the others. */
    private void showWhy(String version) {
        String why = version == null ? null : PisanPack.whyRecommended(version);
        mWhyLabel.setText(why == null ? "" : getString(R.string.pisan_pack_why, why));
        mWhyLabel.setVisibility(why == null ? View.GONE : View.VISIBLE);
    }

    class GameVersionSelectedListener implements AdapterView.OnItemSelectedListener {
        @Override
        public void onItemSelected(AdapterView<?> adapterView, View view, int i, long l) {
            mSelectedGameVersion = (String) adapterView.getAdapter().getItem(i);
            mInstallButton.setEnabled(getListenerProxy() == null);
            showWhy(mSelectedGameVersion);
        }

        @Override
        public void onNothingSelected(AdapterView<?> adapterView) {
            mSelectedGameVersion = null;
            mInstallButton.setEnabled(false);
            showWhy(null);
        }
    }

    private ModloaderListenerProxy getListenerProxy() {
        return (ModloaderListenerProxy) ExtraCore.getValue(EXTRA_PROXY);
    }

    private void setListenerProxy(ModloaderListenerProxy proxy) {
        if (proxy == null) ExtraCore.removeValue(EXTRA_PROXY);
        else ExtraCore.setValue(EXTRA_PROXY, proxy);
    }
}
