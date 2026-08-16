package net.kdt.pojavlaunch.prefs.screens;


import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;

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
     */
    private void setupUpdatePreference() {
        Preference update = findPreference("pisankus_check_update");
        if (update == null) return;

        update.setOnPreferenceClickListener(preference -> {
            Activity activity = getActivity();
            if (activity == null) return true;

            preference.setEnabled(false);
            preference.setSummary(R.string.pisankus_update_checking);

            new net.kdt.pojavlaunch.PisanKusUpdater(activity, new net.kdt.pojavlaunch.PisanKusUpdater.Listener() {
                @Override public void onUpToDate(String currentVersion) {
                    preference.setSummary(getString(R.string.pisankus_update_none, currentVersion));
                    preference.setEnabled(true);
                }

                @Override public void onUpdateFound(String newVersion) {
                    preference.setSummary(getString(R.string.pisankus_update_downloading, newVersion));
                }

                @Override public void onProgress(int percent) {
                    preference.setSummary(percent < 0
                            ? getString(R.string.pisankus_update_downloading, "")
                            : getString(R.string.pisankus_update_progress, percent));
                }

                @Override public void onReadyToInstall() {
                    preference.setSummary(R.string.pisankus_update_installing);
                    preference.setEnabled(true);
                }

                @Override public void onFailed(String message) {
                    preference.setSummary(getString(R.string.pisankus_update_failed, message));
                    preference.setEnabled(true);
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
