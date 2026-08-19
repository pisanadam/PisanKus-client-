package net.kdt.pojavlaunch;

import android.app.Application;

/**
 * The launcher's own messages, looked up without a Context in hand.
 *
 * Most of what PisanKus adds runs off the main thread and away from any screen:
 * a pack installer, a Modrinth client, the skin service. Their failures still
 * reach the player as text, so they cannot stay as literals in the code — and
 * threading a Context through every one of them would touch far more of the
 * upstream tree than the messages are worth.
 *
 * The reference is strong on purpose. An Application lives as long as the
 * process, so holding it leaks nothing that the process was not keeping anyway.
 */
public final class PisanKusText {
    private static Application sApplication;

    private PisanKusText() {}

    /** Called once, from {@code PojavApplication.onCreate}. */
    public static void setApplication(Application application) {
        sApplication = application;
    }

    /**
     * The translated string, or an empty one if the process is already gone.
     *
     * An empty message is not useful, but neither is a crash inside an error
     * path: the caller is already reporting a failure when it asks.
     */
    public static String get(int resId, Object... formatArgs) {
        Application application = sApplication;
        if (application == null) return "";
        return formatArgs.length == 0
                ? application.getString(resId)
                : application.getString(resId, formatArgs);
    }
}
