package net.kdt.pojavlaunch.skins;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

/**
 * Draws a skin the way its owner recognises it.
 *
 * A skin file is a texture sheet: heads, sleeves and trouser legs laid out flat
 * in an order nobody reads at a glance. Showing that sheet would technically be
 * showing the skin, and would still leave the player squinting to tell which of
 * their three blue ones this is. So the front of the character is assembled
 * here — the same faces the game puts on screen, in the same places.
 *
 * Everything is nearest-neighbour on purpose. These are 64-pixel textures; any
 * smoothing turns the pixel art the player made into mush.
 */
public class SkinRender {
    /** Canvas of the assembled front view, in skin pixels. */
    private static final int VIEW_WIDTH = 16;
    private static final int VIEW_HEIGHT = 32;

    private static final Paint PAINT = new Paint();

    static {
        PAINT.setFilterBitmap(false);
        PAINT.setAntiAlias(false);
        PAINT.setDither(false);
    }

    /**
     * Assembles the character's front.
     *
     * The second layer — hat, jacket, sleeves — is drawn over the first, because
     * that is what it is for and a skin that only uses the outer layer would
     * otherwise come out invisible.
     */
    public static Bitmap frontView(Bitmap skin, boolean slim) {
        Bitmap view = Bitmap.createBitmap(VIEW_WIDTH, VIEW_HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(view);

        // Skins from before 1.8 are half as tall and carry only the right arm and
        // leg; the game mirrors them onto the left, so this does too.
        boolean legacy = skin.getHeight() < 64;
        int arm = slim ? 3 : 4;

        // Head, with the hat layer over it.
        copy(canvas, skin, 8, 8, 8, 8, 4, 0, false);
        copy(canvas, skin, 40, 8, 8, 8, 4, 0, false);

        // Body, with the jacket layer.
        copy(canvas, skin, 20, 20, 8, 12, 4, 8, false);
        if (!legacy) copy(canvas, skin, 20, 36, 8, 12, 4, 8, false);

        // Facing us, the character's right side is on our left — which is why the
        // right arm and leg are drawn to the left of the body.
        copy(canvas, skin, 44, 20, arm, 12, 4 - arm, 8, false);
        if (!legacy) copy(canvas, skin, 44, 36, arm, 12, 4 - arm, 8, false);

        if (legacy) {
            copy(canvas, skin, 44, 20, arm, 12, 12, 8, true);
        } else {
            copy(canvas, skin, 36, 52, arm, 12, 12, 8, false);
            copy(canvas, skin, 52, 52, arm, 12, 12, 8, false);
        }

        copy(canvas, skin, 4, 20, 4, 12, 4, 20, false);
        if (!legacy) copy(canvas, skin, 4, 36, 4, 12, 4, 20, false);

        if (legacy) {
            copy(canvas, skin, 4, 20, 4, 12, 8, 20, true);
        } else {
            copy(canvas, skin, 20, 52, 4, 12, 8, 20, false);
            copy(canvas, skin, 4, 52, 4, 12, 8, 20, false);
        }

        return view;
    }

    /** The front of a cape, which is the part anyone ever sees of it. */
    public static Bitmap capeFront(Bitmap cape) {
        // Cape textures scale with their own resolution; the front panel always
        // sits in the same relative place.
        int unit = Math.max(1, cape.getWidth() / 64);
        Bitmap view = Bitmap.createBitmap(10 * unit, 16 * unit, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(view);
        canvas.drawBitmap(cape,
                new Rect(unit, unit, 11 * unit, 17 * unit),
                new Rect(0, 0, 10 * unit, 16 * unit),
                PAINT);
        return view;
    }

    /** Blows a texture up without smoothing it, so the pixels stay pixels. */
    public static Bitmap enlarge(Bitmap source, int maxSide) {
        int factor = Math.max(1, maxSide / Math.max(source.getWidth(), source.getHeight()));
        return Bitmap.createScaledBitmap(source, source.getWidth() * factor, source.getHeight() * factor, false);
    }

    private static void copy(Canvas canvas, Bitmap skin, int sourceX, int sourceY, int width, int height,
                             int targetX, int targetY, boolean mirror) {
        Rect source = new Rect(sourceX, sourceY, sourceX + width, sourceY + height);
        if (source.right > skin.getWidth() || source.bottom > skin.getHeight()) return;

        Rect target = new Rect(targetX, targetY, targetX + width, targetY + height);
        if (!mirror) {
            canvas.drawBitmap(skin, source, target, PAINT);
            return;
        }

        canvas.save();
        canvas.scale(-1f, 1f, target.centerX(), target.centerY());
        canvas.drawBitmap(skin, source, target, PAINT);
        canvas.restore();
    }
}
