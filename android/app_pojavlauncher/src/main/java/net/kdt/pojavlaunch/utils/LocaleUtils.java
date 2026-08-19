package net.kdt.pojavlaunch.utils;


import static net.kdt.pojavlaunch.prefs.LauncherPreferences.DEFAULT_PREF;
import static net.kdt.pojavlaunch.prefs.LauncherPreferences.PREF_FORCE_ENGLISH;

import android.content.*;
import android.content.res.*;
import android.os.Build;
import android.os.LocaleList;

import androidx.preference.*;
import java.util.*;

public class LocaleUtils extends ContextWrapper {
    /** Which language the player chose; "system" means "whatever the phone says". */
    public static final String PREF_LANGUAGE = "pisankus_language";
    public static final String SYSTEM = "system";

    public LocaleUtils(Context base) {
        super(base);
    }

    /**
     * The language tag to run in, or null to follow the phone.
     *
     * Upstream had one switch here — force English — for players whose phone
     * language the launcher had no translation for. PisanKus ships a real list
     * instead, and a phone's language is often not the one its owner wants an
     * app in, so the choice is theirs. The old switch keeps working: someone who
     * turned it on still gets English until they pick something else.
     */
    public static String chosenLanguage(Context context) {
        String language = DEFAULT_PREF.getString(PREF_LANGUAGE, SYSTEM);
        if (SYSTEM.equals(language)) {
            return DEFAULT_PREF.getBoolean("force_english", false) ? "en" : null;
        }
        return language;
    }

    public static ContextWrapper setLocale(Context context) {
        if (DEFAULT_PREF == null) {
            DEFAULT_PREF = PreferenceManager.getDefaultSharedPreferences(context);
            // Too early to initialize all prefs here, as this is called by PojavApplication
            // before storage checks are done and before the storage paths are initialized.
            // So only initialize PREF_FORCE_ENGLISH for the check below.
            PREF_FORCE_ENGLISH = DEFAULT_PREF.getBoolean("force_english", false);
        }

        String language = chosenLanguage(context);
        if (language != null) {
            Locale locale = Locale.forLanguageTag(language);
            Resources resources = context.getResources();
            Configuration configuration = resources.getConfiguration();

            configuration.setLocale(locale);
            Locale.setDefault(locale);
            if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N){
                LocaleList localeList = new LocaleList(locale);
                LocaleList.setDefault(localeList);
                configuration.setLocales(localeList);
            }

            resources.updateConfiguration(configuration, resources.getDisplayMetrics());
            if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1){
                context = context.createConfigurationContext(configuration);
            }
        }

        return new LocaleUtils(context);
    }
}
