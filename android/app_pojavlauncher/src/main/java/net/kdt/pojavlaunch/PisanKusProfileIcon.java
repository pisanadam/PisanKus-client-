package net.kdt.pojavlaunch;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.util.Locale;
import java.util.Random;

/**
 * Builds a profile icon out of a background and a symbol.
 *
 * The table is the same one the desktop app carries (`src/shared/profileIcon.ts`)
 * and the shapes are geometry in a 0..1 square rather than image files, so an
 * icon made on the phone is the same picture on the computer — and neither side
 * needs a sprite sheet to draw it at any size.
 */
public final class PisanKusProfileIcon {

    public static final class Background {
        public final String id;
        public final int from;
        public final int to;

        Background(String id, int from, int to) {
            this.id = id;
            this.from = from;
            this.to = to;
        }
    }

    /** A polygon, or a circle when {@code points} is null. */
    public static final class Shape {
        final float[] points;
        final float cx;
        final float cy;
        final float radius;
        final int color;

        Shape(float[] points, float cx, float cy, float radius, int color) {
            this.points = points;
            this.cx = cx;
            this.cy = cy;
            this.radius = radius;
            this.color = color;
        }
    }

    public static final class Symbol {
        public final String id;
        /** String resource for the name shown under the grid. */
        public final int labelRes;
        final Shape[] shapes;

        Symbol(String id, int labelRes, Shape[] shapes) {
            this.id = id;
            this.labelRes = labelRes;
            this.shapes = shapes;
        }
    }

    private static Shape poly(int color, float... points) {
        return new Shape(points, 0f, 0f, 0f, color);
    }

    private static Shape circle(int color, float cx, float cy, float radius) {
        return new Shape(null, cx, cy, radius, color);
    }

    /** The symbol drawn from the profile's own name instead of from shapes. */
    public static final String INITIALS = "initials";

    public static final Background[] BACKGROUNDS = new Background[] {
            new Background("turquoise", 0xFF2AD4D4, 0xFF0E8F8F),
            new Background("ocean", 0xFF4AA8FF, 0xFF1F5FD0),
            new Background("indigo", 0xFF8A7CFF, 0xFF4B3FC4),
            new Background("violet", 0xFFC07CF0, 0xFF7C3FB8),
            new Background("rose", 0xFFFF7D9E, 0xFFC9385F),
            new Background("ember", 0xFFFF8A5C, 0xFFD1441F),
            new Background("amber", 0xFFFFC94A, 0xFFD18C0F),
            new Background("lime", 0xFFA8E05A, 0xFF5F9C18),
            new Background("forest", 0xFF4CC47A, 0xFF1C7A44),
            new Background("mint", 0xFF79E6C2, 0xFF2A9E7D),
            new Background("slate", 0xFF8A97A8, 0xFF48535F),
            new Background("charcoal", 0xFF4A5058, 0xFF22262B),
            new Background("sand", 0xFFE8D5A8, 0xFFB99A5E),
            new Background("cocoa", 0xFFB98A63, 0xFF7A5436),
            new Background("cherry", 0xFFE05A5A, 0xFF9C2626),
            new Background("night", 0xFF3A3F6B, 0xFF171A30)
    };

    public static final Symbol[] SYMBOLS = new Symbol[] {
            new Symbol("grass", R.string.pisan_icon_grass, new Shape[] {
                    poly(0xFF7CC25A, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF9C6F4A, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF7A5537, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("dirt", R.string.pisan_icon_dirt, new Shape[] {
                    poly(0xFFA97A52, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF8B6242, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF6C4A30, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("stone", R.string.pisan_icon_stone, new Shape[] {
                    poly(0xFFB4B4B4, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF949494, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF767676, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("oak", R.string.pisan_icon_oak, new Shape[] {
                    poly(0xFFD2AC74, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFB08A54, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF8A6A3E, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("sand", R.string.pisan_icon_sand, new Shape[] {
                    poly(0xFFF0E0AE, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFD8C68E, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFFB5A271, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("gold", R.string.pisan_icon_gold, new Shape[] {
                    poly(0xFFFFDC5E, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFE6B52F, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFFB8891A, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("iron", R.string.pisan_icon_iron, new Shape[] {
                    poly(0xFFE8E8E8, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFC4C4C4, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF9D9D9D, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("diamond", R.string.pisan_icon_diamond, new Shape[] {
                    poly(0xFF7CF0E4, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF4FC9BE, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF329A91, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("emerald", R.string.pisan_icon_emerald, new Shape[] {
                    poly(0xFF5CE68A, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF38BD62, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF238A44, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("redstone", R.string.pisan_icon_redstone, new Shape[] {
                    poly(0xFFFF6161, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFD13C3C, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFFA22828, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("lapis", R.string.pisan_icon_lapis, new Shape[] {
                    poly(0xFF5A80E8, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF3A58B5, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF2A4285, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("amethyst", R.string.pisan_icon_amethyst, new Shape[] {
                    poly(0xFFC69AF5, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF9C6AD8, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF7548A8, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("copper", R.string.pisan_icon_copper, new Shape[] {
                    poly(0xFFEF9A66, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFFC4713F, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF96502A, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("ice", R.string.pisan_icon_ice, new Shape[] {
                    poly(0xFFC6ECFF, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF96CDF2, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF6FA9D2, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("netherite", R.string.pisan_icon_netherite, new Shape[] {
                    poly(0xFF7A6862, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF574845, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF3C3130, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("obsidian", R.string.pisan_icon_obsidian, new Shape[] {
                    poly(0xFF4A3F6B, 0.5f, 0.14f, 0.9f, 0.36f, 0.5f, 0.58f, 0.1f, 0.36f),
                    poly(0xFF372D52, 0.1f, 0.36f, 0.5f, 0.58f, 0.5f, 0.86f, 0.1f, 0.64f),
                    poly(0xFF241D38, 0.9f, 0.36f, 0.9f, 0.64f, 0.5f, 0.86f, 0.5f, 0.58f)
            }),
            new Symbol("star", R.string.pisan_icon_star, new Shape[] {
                    poly(0xFFFFD766, 0.5f, 0.12f, 0.6f, 0.382f, 0.88f, 0.396f, 0.662f, 0.573f, 0.735f, 0.844f, 0.5f, 0.69f, 0.265f, 0.844f, 0.338f, 0.573f, 0.12f, 0.396f, 0.4f, 0.382f),
                    poly(0xFFFFEFB0, 0.5f, 0.3f, 0.556f, 0.443f, 0.709f, 0.452f, 0.59f, 0.549f, 0.629f, 0.698f, 0.5f, 0.615f, 0.371f, 0.698f, 0.41f, 0.549f, 0.291f, 0.452f, 0.444f, 0.443f)
            }),
            new Symbol("heart", R.string.pisan_icon_heart, new Shape[] {
                    circle(0xFFFF6B81, 0.335f, 0.375f, 0.195f),
                    circle(0xFFFF6B81, 0.665f, 0.375f, 0.195f),
                    poly(0xFFFF6B81, 0.145f, 0.44f, 0.855f, 0.44f, 0.5f, 0.9f),
                    circle(0xFFFFA8B6, 0.335f, 0.345f, 0.075f)
            }),
            new Symbol("sword", R.string.pisan_icon_sword, new Shape[] {
                    poly(0xFFDBE4EE, 0.5f, 0.08f, 0.61f, 0.24f, 0.61f, 0.6f, 0.39f, 0.6f, 0.39f, 0.24f),
                    poly(0xFFA9B7C6, 0.5f, 0.08f, 0.61f, 0.24f, 0.5f, 0.24f),
                    poly(0xFFB9C5D2, 0.5f, 0.24f, 0.61f, 0.24f, 0.61f, 0.6f, 0.5f, 0.6f),
                    poly(0xFFC9973F, 0.26f, 0.6f, 0.74f, 0.6f, 0.74f, 0.69f, 0.26f, 0.69f),
                    poly(0xFF7A5537, 0.44f, 0.69f, 0.56f, 0.69f, 0.56f, 0.88f, 0.44f, 0.88f),
                    circle(0xFFC9973F, 0.5f, 0.9f, 0.075f)
            }),
            new Symbol("potion", R.string.pisan_icon_potion, new Shape[] {
                    circle(0xFFDBE4EE, 0.5f, 0.63f, 0.27f),
                    poly(0xFFDBE4EE, 0.41f, 0.24f, 0.59f, 0.24f, 0.59f, 0.46f, 0.41f, 0.46f),
                    circle(0xFFC455E0, 0.5f, 0.67f, 0.2f),
                    poly(0xFF9C6F4A, 0.37f, 0.13f, 0.63f, 0.13f, 0.63f, 0.27f, 0.37f, 0.27f),
                    circle(0xFFF0D8F7, 0.41f, 0.56f, 0.055f)
            }),
            new Symbol("gem", R.string.pisan_icon_gem, new Shape[] {
                    poly(0xFF8FF0E6, 0.5f, 0.12f, 0.22f, 0.38f, 0.5f, 0.38f),
                    poly(0xFF5FD6C8, 0.5f, 0.12f, 0.78f, 0.38f, 0.5f, 0.38f),
                    poly(0xFF48BDB0, 0.22f, 0.38f, 0.5f, 0.38f, 0.5f, 0.9f),
                    poly(0xFF2F9A8F, 0.78f, 0.38f, 0.5f, 0.38f, 0.5f, 0.9f)
            }),
            new Symbol("bolt", R.string.pisan_icon_bolt, new Shape[] {
                    poly(0xFFFFD766, 0.6f, 0.08f, 0.26f, 0.55f, 0.45f, 0.55f, 0.38f, 0.92f, 0.74f, 0.43f, 0.53f, 0.43f),
                    poly(0xFFFFEFB0, 0.6f, 0.08f, 0.53f, 0.43f, 0.74f, 0.43f)
            }),
            new Symbol("initials", R.string.pisan_icon_initials, new Shape[0])
    };

    private static final int SHADOW = 0x45000000;
    private static final float SHADOW_X = 0.02f;
    private static final float SHADOW_Y = 0.035f;

    private PisanKusProfileIcon() {}

    public static Background background(String id) {
        for (Background background : BACKGROUNDS) {
            if (background.id.equals(id)) return background;
        }
        return BACKGROUNDS[0];
    }

    public static Symbol symbol(String id) {
        for (Symbol symbol : SYMBOLS) {
            if (symbol.id.equals(id)) return symbol;
        }
        return SYMBOLS[0];
    }

    /** Up to two letters for the {@link #INITIALS} symbol, from the profile's name. */
    public static String initialsFor(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) return "?";
        String[] words = trimmed.split("[\\s_-]+");
        if (words.length == 1) {
            String word = words[0];
            return word.substring(0, Math.min(2, word.length())).toUpperCase(new Locale("tr"));
        }
        return (words[0].charAt(0) + "" + words[1].charAt(0)).toUpperCase(new Locale("tr"));
    }

    public static String randomBackground(Random random) {
        return BACKGROUNDS[random.nextInt(BACKGROUNDS.length)].id;
    }

    public static String randomSymbol(Random random) {
        return SYMBOLS[random.nextInt(SYMBOLS.length)].id;
    }

    private static void fill(Canvas canvas, Shape[] shapes, int size, Paint paint,
                             Integer override, float dx, float dy) {
        Path path = new Path();
        for (Shape shape : shapes) {
            paint.setColor(override == null ? shape.color : override);
            if (shape.points == null) {
                canvas.drawCircle((shape.cx + dx) * size, (shape.cy + dy) * size,
                        shape.radius * size, paint);
                continue;
            }
            path.reset();
            for (int i = 0; i < shape.points.length; i += 2) {
                float x = (shape.points[i] + dx) * size;
                float y = (shape.points[i + 1] + dy) * size;
                if (i == 0) path.moveTo(x, y);
                else path.lineTo(x, y);
            }
            path.close();
            canvas.drawPath(path, paint);
        }
    }

    /**
     * Draws one icon.
     *
     * The symbol is drawn twice, first offset in translucent black: without that
     * pass a dark symbol vanishes into a dark background and half the
     * combinations would be unusable.
     */
    public static Bitmap render(String backgroundId, String symbolId, String name, int size) {
        Background background = background(backgroundId);
        Symbol symbol = symbol(symbolId);

        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        // The rounded square is drawn, not clipped to: `clipPath` is not
        // antialiased on Android, and at 18 px a jagged corner is the first
        // thing anyone notices. The symbols stay well inside it, so the clip is
        // only there to catch the shadow pass at the very edge.
        Path rounded = new Path();
        rounded.addRoundRect(new RectF(0, 0, size, size), size * 0.22f, size * 0.22f,
                Path.Direction.CW);
        paint.setShader(new LinearGradient(0, 0, 0, size, background.from, background.to,
                Shader.TileMode.CLAMP));
        canvas.drawPath(rounded, paint);
        paint.setShader(null);
        canvas.clipPath(rounded);

        if (INITIALS.equals(symbol.id)) {
            String text = initialsFor(name);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextSize(size * 0.44f);
            paint.setTextAlign(Paint.Align.CENTER);
            Paint.FontMetrics metrics = paint.getFontMetrics();
            float baseline = size / 2f - (metrics.ascent + metrics.descent) / 2f;
            paint.setColor(SHADOW);
            canvas.drawText(text, size / 2f + size * SHADOW_X, baseline + size * SHADOW_Y, paint);
            paint.setColor(0xF0FFFFFF);
            canvas.drawText(text, size / 2f, baseline, paint);
        } else {
            fill(canvas, symbol.shapes, size, paint, SHADOW, SHADOW_X, SHADOW_Y);
            fill(canvas, symbol.shapes, size, paint, null, 0f, 0f);
        }
        return bitmap;
    }

    /** The form a profile stores its icon in. */
    public static String toDataUrl(Bitmap bitmap) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
