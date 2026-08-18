package net.kdt.pojavlaunch.prefs.screens;


import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;

import net.kdt.pojavlaunch.LauncherActivity;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;

/**
 * Preference for the main screen, any sub-screen should inherit this class for consistent behavior,
 * overriding only onCreatePreferences
 */
public class LauncherPreferenceFragment extends PreferenceFragmentCompat implements SharedPreferences.OnSharedPreferenceChangeListener {

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        // The ambient ground, drawn here rather than left transparent.
        //
        // A preference list recycles its rows, and with nothing opaque behind
        // them the previous frame is never cleared: rows smear over each other
        // as the list scrolls. The drawable's base layer is solid, so this keeps
        // the glow without that.
        view.setBackgroundResource(R.drawable.pk_ambient_background);
        super.onViewCreated(view, savedInstanceState);
    }

    @Override
    public void onCreatePreferences(Bundle b, String str) {
        addPreferencesFromResource(R.xml.pref_main);
        setupNotificationRequestPreference();
        setupUpdatePreference();
    }

    /**
     * Wires the update entry.
     *
     * Progress is reported into the entry's own summary rather than a dialog:
     * the download is large enough that the player will want to leave the
     * screen, and a modal would either block that or be dismissed and lose the
     * status.
     *
     * Which is exactly why nothing here may go through the fragment. Leaving
     * settings mid-download detaches it, and the next progress callback then
     * crashed on {@code getString} with "not attached to a context". The
     * strings come from the application context instead, and the summary is
     * only touched while the entry is still on screen.
     */
    private void setupUpdatePreference() {
        Preference update = findPreference("pisankus_check_update");
        if (update == null) return;

        update.setOnPreferenceClickListener(preference -> {
            final Context context = preference.getContext().getApplicationContext();

            preference.setEnabled(false);
            preference.setSummary(R.string.pisankus_update_checking);

            new net.kdt.pojavlaunch.PisanKusUpdater(context, new net.kdt.pojavlaunch.PisanKusUpdater.Listener() {
                /** A closed screen has no summary worth writing to. */
                private void show(String summary, boolean done) {
                    if (!isAdded()) return;
                    preference.setSummary(summary);
                    if (done) preference.setEnabled(true);
                }

                @Override public void onUpToDate(String currentVersion) {
                    show(context.getString(R.string.pisankus_update_none, currentVersion), true);
                }

                @Override public void onUpdateFound(String newVersion) {
                    show(context.getString(R.string.pisankus_update_downloading, newVersion), false);
                }

                @Override public void onProgress(int percent) {
                    show(percent < 0
                            ? context.getString(R.string.pisankus_update_downloading, "")
                            : context.getString(R.string.pisankus_update_progress, percent), false);
                }

                @Override public void onReadyToInstall() {
                    show(context.getString(R.string.pisankus_update_installing), true);
                }

                @Override public void onFailed(String message) {
                    // Worth saying out loud: a failure the player cannot see is
                    // a download that looks like it is still running.
                    if (!isAdded()) {
                        Toast.makeText(context,
                                context.getString(R.string.pisankus_update_failed, message),
                                Toast.LENGTH_LONG).show();
                        return;
                    }
                    show(context.getString(R.string.pisankus_update_failed, message), true);
                }
            }).checkAndInstall();
            return true;
        });
    }

    private void setupNotificationRequestPreference() {
        Preference mRequestNotificationPermissionPreference = requirePreference("notification_permission_request");
        Preference mMicrophonePermissionPreference = requirePreference("microphone_permission_request");
        Activity activity = getActivity();
        if(activity instanceof LauncherActivity) {
            LauncherActivity launcherActivity = (LauncherActivity)activity;
            mRequestNotificationPermissionPreference.setVisible(!launcherActivity.checkForNotificationPermission());
            mRequestNotificationPermissionPreference.setOnPreferenceClickListener(preference -> {
                launcherActivity.askForNotificationPermission(()->mRequestNotificationPermissionPreference.setVisible(false));
                return true;
            });
            mMicrophonePermissionPreference.setVisible(!launcherActivity.checkForMicrophonePermission());
            mMicrophonePermissionPreference.setOnPreferenceClickListener(preference -> {
                launcherActivity.askForMicrophonePermission(()->mMicrophonePermissionPreference.setVisible(false));
                return true;
            });
        }else{
            mRequestNotificationPermissionPreference.setVisible(false);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        SharedPreferences sharedPreferences = getPreferenceManager().getSharedPreferences();
        if(sharedPreferences != null) sharedPreferences.registerOnSharedPreferenceChangeListener(this);
    }

    @Override
    public void onPause() {
        SharedPreferences sharedPreferences = getPreferenceManager().getSharedPreferences();
        if(sharedPreferences != null) sharedPreferences.unregisterOnSharedPreferenceChangeListener(this);
        super.onPause();
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences p, String s) {
        LauncherPreferences.loadPreferences(getContext());
    }

    protected Preference requirePreference(CharSequence key) {
        Preference preference = findPreference(key);
        if(preference != null) return preference;
        throw new IllegalStateException("Preference "+key+" is null");
    }
    @SuppressWarnings("unchecked")
    protected <T extends Preference> T requirePreference(CharSequence key, Class<T> preferenceClass) {
        Preference preference = requirePreference(key);
        if(preferenceClass.isInstance(preference)) return (T)preference;
        throw new IllegalStateException("Preference "+key+" is not an instance of "+preferenceClass.getSimpleName());
    }
}
