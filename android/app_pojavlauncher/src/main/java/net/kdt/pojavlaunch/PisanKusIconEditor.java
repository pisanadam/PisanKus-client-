package net.kdt.pojavlaunch;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;

import java.util.Random;

/**
 * The screen that builds a profile icon out of a background and a symbol.
 *
 * Every swatch and every cell is the real icon rather than a coloured square, so
 * what the player picks from is exactly what they get — including the initials,
 * which are drawn from the profile's own name.
 */
public final class PisanKusIconEditor {

    public interface Listener {
        /** The finished picture, plus the two ids so the editor can reopen on it. */
        void onIconChosen(Bitmap bitmap, String backgroundId, String symbolId);
    }

    private final Context mContext;
    private final String mProfileName;
    private final Listener mListener;
    private final Random mRandom = new Random();

    private String mBackgroundId;
    private String mSymbolId;

    private ImageView mPreview;
    private ImageView mPreviewMedium;
    private ImageView mPreviewSmall;
    private LinearLayout mBackgrounds;
    private GridLayout mSymbols;

    public PisanKusIconEditor(Context context, String profileName, String backgroundId,
                              String symbolId, Listener listener) {
        mContext = context;
        mProfileName = profileName;
        mListener = listener;
        mBackgroundId = backgroundId == null
                ? PisanKusProfileIcon.BACKGROUNDS[0].id : backgroundId;
        mSymbolId = symbolId == null ? PisanKusProfileIcon.SYMBOLS[0].id : symbolId;
    }

    public void show() {
        View view = LayoutInflater.from(mContext).inflate(R.layout.pk_dialog_icon_editor, null);
        mPreview = view.findViewById(R.id.pk_icon_preview);
        mPreviewMedium = view.findViewById(R.id.pk_icon_preview_medium);
        mPreviewSmall = view.findViewById(R.id.pk_icon_preview_small);
        mBackgrounds = view.findViewById(R.id.pk_icon_backgrounds);
        mSymbols = view.findViewById(R.id.pk_icon_symbols);

        view.findViewById(R.id.pk_icon_random).setOnClickListener(v -> {
            mBackgroundId = PisanKusProfileIcon.randomBackground(mRandom);
            mSymbolId = PisanKusProfileIcon.randomSymbol(mRandom);
            refresh();
        });

        buildChoices();
        refresh();

        new AlertDialog.Builder(mContext)
                .setTitle(R.string.pisan_icon_editor_title)
                .setView(view)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(R.string.pisan_icon_save, (dialog, which) ->
                        mListener.onIconChosen(
                                PisanKusProfileIcon.render(mBackgroundId, mSymbolId, mProfileName, 192),
                                mBackgroundId, mSymbolId))
                .show();
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                mContext.getResources().getDisplayMetrics()));
    }

    private ImageView cell(Bitmap bitmap, int sizeDp, boolean selected) {
        ImageView image = new ImageView(mContext);
        int size = dp(sizeDp);
        int padding = dp(3);
        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = size + padding * 2;
        params.height = size + padding * 2;
        image.setLayoutParams(params);
        image.setPadding(padding, padding, padding, padding);
        image.setImageBitmap(bitmap);
        // The selected cell is marked by a background rather than by a border
        // drawable, so the same code works for both rows without a second asset.
        image.setBackgroundResource(selected ? R.drawable.pk_card_selected_background : 0);
        return image;
    }

    private void buildChoices() {
        for (final PisanKusProfileIcon.Background background : PisanKusProfileIcon.BACKGROUNDS) {
            ImageView image = cell(
                    PisanKusProfileIcon.render(background.id, mSymbolId, mProfileName, dp(40)),
                    40, background.id.equals(mBackgroundId));
            LinearLayout.LayoutParams params =
                    new LinearLayout.LayoutParams(image.getLayoutParams().width,
                            image.getLayoutParams().height);
            image.setLayoutParams(params);
            image.setOnClickListener(v -> {
                mBackgroundId = background.id;
                refresh();
            });
            mBackgrounds.addView(image);
        }

        for (final PisanKusProfileIcon.Symbol symbol : PisanKusProfileIcon.SYMBOLS) {
            ImageView image = cell(
                    PisanKusProfileIcon.render(mBackgroundId, symbol.id, mProfileName, dp(44)),
                    44, symbol.id.equals(mSymbolId));
            image.setContentDescription(mContext.getString(symbol.labelRes));
            image.setOnClickListener(v -> {
                mSymbolId = symbol.id;
                refresh();
            });
            mSymbols.addView(image);
        }
    }

    /**
     * Redraws every cell.
     *
     * Both rows depend on the other choice — a background swatch shows the chosen
     * symbol on it and the other way round — so there is nothing to update
     * selectively; the whole thing is 39 small bitmaps.
     */
    private void refresh() {
        mPreview.setImageBitmap(
                PisanKusProfileIcon.render(mBackgroundId, mSymbolId, mProfileName, dp(56)));
        mPreviewMedium.setImageBitmap(
                PisanKusProfileIcon.render(mBackgroundId, mSymbolId, mProfileName, dp(28)));
        mPreviewSmall.setImageBitmap(
                PisanKusProfileIcon.render(mBackgroundId, mSymbolId, mProfileName, dp(18)));

        for (int i = 0; i < mBackgrounds.getChildCount(); i++) {
            PisanKusProfileIcon.Background background = PisanKusProfileIcon.BACKGROUNDS[i];
            ImageView image = (ImageView) mBackgrounds.getChildAt(i);
            image.setImageBitmap(
                    PisanKusProfileIcon.render(background.id, mSymbolId, mProfileName, dp(40)));
            image.setBackgroundResource(
                    background.id.equals(mBackgroundId) ? R.drawable.pk_card_selected_background : 0);
        }
        for (int i = 0; i < mSymbols.getChildCount(); i++) {
            PisanKusProfileIcon.Symbol symbol = PisanKusProfileIcon.SYMBOLS[i];
            ImageView image = (ImageView) mSymbols.getChildAt(i);
            image.setImageBitmap(
                    PisanKusProfileIcon.render(mBackgroundId, symbol.id, mProfileName, dp(44)));
            image.setBackgroundResource(
                    symbol.id.equals(mSymbolId) ? R.drawable.pk_card_selected_background : 0);
        }
    }
}
