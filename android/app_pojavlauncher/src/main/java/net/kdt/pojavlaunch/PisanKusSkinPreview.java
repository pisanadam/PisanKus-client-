package net.kdt.pojavlaunch;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;

/**
 * Draws the front of a character from a skin texture.
 *
 * A skin file is an unfolded sheet — showing it as-is tells a player nothing
 * about how it will look in game. The desktop launcher renders the model in
 * three dimensions; here the front faces are laid out flat, which is enough to
 * recognise a skin and costs no renderer.
 */
public class PisanKusSkinPreview {
    /** Character proportions in pixels, at the texture's own scale. */
    private static final int WIDTH = 16;
    private static final int HEIGHT = 32;

    /**
     * Composes the front view, magnified by {@code scale}.
     *
     * The second layer (hat, jacket, sleeves) is drawn over the first, because
     * that is where most skins put the part that makes them recognisable.
     */
    public static Bitmap front(Bitmap skin, boolean slim, int scale) {
        Bitmap flat = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(flat);

        // Pre-1.8 sheets are half as tall and carry only the right limbs; the
        // left ones are the same faces mirrored, which is what the game does too.
        boolean legacy = skin.getHeight() < 64;
        int armWidth = slim ? 3 : 4;

        // Head
        blit(canvas, skin, 8, 8, 8, 8, 4, 0, false);
        blit(canvas, skin, 40, 8, 8, 8, 4, 0, false);

        // Body
        blit(canvas, skin, 20, 20, 8, 12, 4, 8, false);
        if (!legacy) blit(canvas, skin, 20, 36, 8, 12, 4, 8, false);

        // Arms. The character's right arm is on the viewer's left, which is the
        // difference between a front view and a mirror of one — it shows on any
        // skin whose sides differ.
        int rightArmX = 4 - armWidth;
        blit(canvas, skin, 44, 20, armWidth, 12, rightArmX, 8, false);
        if (!legacy) blit(canvas, skin, 44, 36, armWidth, 12, rightArmX, 8, false);

        int leftArmX = 4 + 8;
        if (legacy) {
            blit(canvas, skin, 44, 20, armWidth, 12, leftArmX, 8, true);
        } else {
            blit(canvas, skin, 36, 52, armWidth, 12, leftArmX, 8, false);
            blit(canvas, skin, 52, 52, armWidth, 12, leftArmX, 8, false);
        }

        // Legs, same handedness as the arms.
        blit(canvas, skin, 4, 20, 4, 12, 4, 20, false);
        if (!legacy) blit(canvas, skin, 4, 36, 4, 12, 4, 20, false);
        if (legacy) {
            blit(canvas, skin, 4, 20, 4, 12, 8, 20, true);
        } else {
            blit(canvas, skin, 20, 52, 4, 12, 8, 20, false);
            blit(canvas, skin, 4, 52, 4, 12, 8, 20, false);
        }

        // Nearest-neighbour on purpose: smoothing turns a 16-pixel-wide
        // character into a smear.
        Bitmap scaled = Bitmap.createScaledBitmap(flat, WIDTH * scale, HEIGHT * scale, false);
        flat.recycle();
        return scaled;
    }

    private static void blit(Canvas canvas, Bitmap skin, int sourceX, int sourceY,
                             int width, int height, int destX, int destY, boolean mirror) {
        if (sourceX + width > skin.getWidth() || sourceY + height > skin.getHeight()) return;
        Bitmap part = Bitmap.createBitmap(skin, sourceX, sourceY, width, height);
        if (mirror) {
            android.graphics.Matrix flip = new android.graphics.Matrix();
            flip.preScale(-1, 1);
            Bitmap flipped = Bitmap.createBitmap(part, 0, 0, width, height, flip, false);
            part.recycle();
            part = flipped;
        }
        canvas.drawBitmap(part, new Rect(0, 0, width, height),
                new Rect(destX, destY, destX + width, destY + height), null);
        part.recycle();
    }
}
