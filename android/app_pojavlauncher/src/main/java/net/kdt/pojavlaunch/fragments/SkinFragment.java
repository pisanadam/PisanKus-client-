package net.kdt.pojavlaunch.fragments;

import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Log;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.PojavProfile;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.contracts.OpenDocumentWithExtension;
import net.kdt.pojavlaunch.skins.SkinApi;
import net.kdt.pojavlaunch.skins.SkinLibrary;
import net.kdt.pojavlaunch.skins.SkinRender;
import net.kdt.pojavlaunch.utils.DownloadUtils;
import net.kdt.pojavlaunch.value.MinecraftAccount;

import org.apache.commons.io.IOUtils;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

/**
 * Changing the account's skin from the phone.
 *
 * The desktop launcher has had this since early on and Android had nothing, even
 * though the hard part — a signed-in Microsoft session — was already here for
 * starting the game. The screen therefore stays close to the desktop one: pick a
 * file or paste a link, choose the model, keep the ones you like in a
 * collection, and put a cape on.
 *
 * Every call to Minecraft's services blocks, so all of them go through
 * {@link #run}, which is also the one place that turns a failure into something
 * readable and puts the buttons back.
 */
public class SkinFragment extends Fragment {
    public static final String TAG = "SkinFragment";

    /** Big enough that a 64-pixel texture still looks deliberate, not blurry. */
    private static final int PREVIEW_SIDE = 256;

    private final Map<String, Bitmap> mCapeCache = new HashMap<>();

    private ImageView mPreview;
    private TextView mStatus;
    private ProgressBar mProgress;
    private RadioGroup mVariantGroup;
    private View mPickButton;
    private View mUrlButton;
    private View mResetButton;
    private View mSaveButton;
    private LinearLayout mLibraryStrip;
    private TextView mLibraryEmpty;
    private LinearLayout mCapeStrip;
    private TextView mCapesEmpty;

    private MinecraftAccount mAccount;
    private SkinApi.SkinInfo mInfo;
    private boolean mBusy;

    private final ActivityResultLauncher<Object> mPicker =
            registerForActivityResult(new OpenDocumentWithExtension("png"), this::onSkinPicked);

    public SkinFragment() {
        super(R.layout.fragment_skin);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mPreview = view.findViewById(R.id.skin_preview);
        mStatus = view.findViewById(R.id.skin_status);
        mProgress = view.findViewById(R.id.skin_progress);
        mVariantGroup = view.findViewById(R.id.skin_variant_group);
        mPickButton = view.findViewById(R.id.skin_pick_button);
        mUrlButton = view.findViewById(R.id.skin_url_button);
        mResetButton = view.findViewById(R.id.skin_reset_button);
        mSaveButton = view.findViewById(R.id.skin_save_button);
        mLibraryStrip = view.findViewById(R.id.skin_library_strip);
        mLibraryEmpty = view.findViewById(R.id.skin_library_empty);
        mCapeStrip = view.findViewById(R.id.skin_cape_strip);
        mCapesEmpty = view.findViewById(R.id.skin_capes_empty);

        mPickButton.setOnClickListener(v -> mPicker.launch(null));
        mUrlButton.setOnClickListener(v -> askForUrl());
        mResetButton.setOnClickListener(v -> confirmReset());
        mSaveButton.setOnClickListener(v -> saveCurrent());

        mAccount = PojavProfile.getCurrentProfileContent(requireContext(), null);
        if (mAccount == null || mAccount.isLocal() || mAccount.isDemo()) {
            // The skin belongs to a Minecraft account; there is nothing to change
            // without one, and saying so beats a 401 from Mojang.
            Tools.dialog(requireContext(), getString(R.string.no_minecraft_account_found),
                    getString(R.string.feature_requires_java_account));
            setEnabled(false);
            mStatus.setText(R.string.feature_requires_java_account);
            mProgress.setVisibility(View.GONE);
            return;
        }

        showLibrary();
        run(() -> SkinApi.fetch(mAccount), null);
    }

    // --- Minecraft services --------------------------------------------------

    /**
     * Runs one call to Minecraft's services and folds the answer back into the
     * screen.
     *
     * Everything the screen does is one of these, so this is where the buttons
     * are locked, the progress bar appears, and a failure becomes a sentence
     * instead of a stack trace.
     */
    private void run(Callable<SkinApi.SkinInfo> call, @Nullable String successMessage) {
        if (mBusy) {
            Toast.makeText(requireContext(), R.string.tasks_ongoing, Toast.LENGTH_SHORT).show();
            return;
        }
        mBusy = true;
        setEnabled(false);
        mProgress.setVisibility(View.VISIBLE);
        mStatus.setText(R.string.skin_working);

        PojavApplication.sExecutorService.execute(() -> {
            try {
                SkinApi.SkinInfo info = call.call();
                Bitmap preview = renderPreview(info);
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    finish();
                    mInfo = info;
                    applyInfo(info, preview);
                    if (successMessage != null) mStatus.setText(successMessage);
                });
            } catch (Exception e) {
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    finish();
                    mStatus.setText(message(e));
                    Tools.dialog(requireContext(), getString(R.string.global_error), message(e));
                });
            }
        });
    }

    private void finish() {
        mBusy = false;
        setEnabled(true);
        mProgress.setVisibility(View.GONE);
    }

    private String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.toString() : detail;
    }

    private void setEnabled(boolean enabled) {
        mPickButton.setEnabled(enabled);
        mUrlButton.setEnabled(enabled);
        mResetButton.setEnabled(enabled);
        mSaveButton.setEnabled(enabled);
        // Disabling the group alone leaves its buttons pressable, and a model
        // switched mid-upload would apply to the next upload, not this one.
        mVariantGroup.setEnabled(enabled);
        for (int i = 0; i < mVariantGroup.getChildCount(); i++) {
            mVariantGroup.getChildAt(i).setEnabled(enabled);
        }
    }

    /**
     * Draws the character as the game would, off the main thread.
     *
     * Done here rather than after the fact because it needs the texture
     * downloaded, and downloading is not something the interface thread may do.
     */
    @Nullable
    private Bitmap renderPreview(SkinApi.SkinInfo info) {
        if (info.skinUrl == null) return null;
        Bitmap skin = downloadBitmap(info.skinUrl);
        if (skin == null) return null;
        return SkinRender.enlarge(SkinRender.frontView(skin, SkinApi.SLIM.equals(info.variant)), PREVIEW_SIDE);
    }

    private void applyInfo(SkinApi.SkinInfo info, @Nullable Bitmap preview) {
        if (preview != null) {
            mPreview.setImageBitmap(preview);
            mStatus.setText(getString(R.string.skin_current, mAccount.username));
        } else {
            mPreview.setImageDrawable(null);
            mStatus.setText(R.string.skin_none);
        }
        checkVariant(info.variant);
        showCapes(info);
    }

    private void checkVariant(String variant) {
        mVariantGroup.check(SkinApi.SLIM.equals(variant) ? R.id.skin_variant_slim : R.id.skin_variant_classic);
    }

    private String selectedVariant() {
        return mVariantGroup.getCheckedRadioButtonId() == R.id.skin_variant_slim
                ? SkinApi.SLIM
                : SkinApi.CLASSIC;
    }

    // --- applying a skin -----------------------------------------------------

    /**
     * Uploads a picked file, and keeps a copy.
     *
     * Mojang stores one skin and limits how often it changes, so the file the
     * player just chose is worth keeping: without the copy, going back to it
     * later would mean finding the original again.
     */
    private void onSkinPicked(@Nullable Uri uri) {
        if (uri == null) return;

        final byte[] png;
        final String name;
        try {
            png = readAll(requireContext(), uri);
            name = displayName(uri);
            SkinApi.validate(png);
        } catch (IOException e) {
            Tools.dialog(requireContext(), getString(R.string.global_error), message(e));
            return;
        }

        // Kept before it is sent, not after: if Mojang refuses because the
        // account changed its skin a minute ago, the file the player picked is
        // still in the collection to try again with later.
        try {
            SkinLibrary.save(png, name, selectedVariant());
            showLibrary();
        } catch (IOException e) {
            Log.w(TAG, "Failed to keep a copy of the picked skin", e);
        }

        String variant = selectedVariant();
        run(() -> {
            SkinApi.SkinInfo info = SkinApi.upload(mAccount, png, name, variant);
            refreshAccountFace();
            return info;
        }, getString(R.string.skin_applied));
    }

    private void askForUrl() {
        EditText input = new EditText(requireContext());
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(R.string.skin_url_hint);

        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.skin_from_url)
                .setMessage(R.string.skin_url_message)
                .setView(input)
                .setPositiveButton(R.string.skin_apply, (dialog, which) -> {
                    String url = input.getText().toString().trim();
                    if (url.isEmpty()) return;
                    String variant = selectedVariant();
                    run(() -> {
                        SkinApi.SkinInfo info = SkinApi.applyUrl(mAccount, url, variant);
                        refreshAccountFace();
                        return info;
                    }, getString(R.string.skin_applied));
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void confirmReset() {
        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.skin_reset)
                .setMessage(R.string.skin_reset_message)
                .setPositiveButton(R.string.skin_reset, (dialog, which) -> run(() -> {
                    SkinApi.SkinInfo info = SkinApi.reset(mAccount);
                    refreshAccountFace();
                    return info;
                }, getString(R.string.skin_reset_done)))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    /** Keeps the face on the launcher's own screens in step with the change. */
    private void refreshAccountFace() {
        try {
            mAccount.updateSkinFace();
            mAccount.save();
        } catch (IOException e) {
            // Cosmetic only: the account still works, its little picture is just stale.
            Log.w(TAG, "Failed to refresh the account's face", e);
        }
    }

    /**
     * Keeps whatever the account is wearing now.
     *
     * The texture is downloaded rather than linked, so a skin set from a website
     * years ago survives that website going away — and so the collection holds
     * skins the player never had a file for in the first place.
     */
    private void saveCurrent() {
        if (mInfo == null || mInfo.skinUrl == null) {
            Tools.dialog(requireContext(), getString(R.string.global_error), getString(R.string.skin_none));
            return;
        }

        final String url = mInfo.skinUrl;
        final String variant = mInfo.variant;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                DownloadUtils.download(url, buffer);
                SkinLibrary.save(buffer.toByteArray(), mAccount.username, variant);
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    showLibrary();
                    mStatus.setText(R.string.skin_saved);
                });
            } catch (IOException e) {
                Tools.runOnUiThread(() -> {
                    if (getContext() == null) return;
                    Tools.dialog(requireContext(), getString(R.string.global_error), message(e));
                });
            }
        });
    }

    // --- the collection ------------------------------------------------------

    private void showLibrary() {
        List<SkinLibrary.Entry> entries = SkinLibrary.list();
        mLibraryStrip.removeAllViews();
        mLibraryEmpty.setVisibility(entries.isEmpty() ? View.VISIBLE : View.GONE);

        for (SkinLibrary.Entry entry : entries) {
            Bitmap texture = BitmapFactory.decodeFile(SkinLibrary.file(entry).getAbsolutePath());
            if (texture == null) continue;

            ImageView thumbnail = thumbnail(
                    SkinRender.enlarge(SkinRender.frontView(texture, SkinApi.SLIM.equals(entry.variant)), 128),
                    entry.name);
            thumbnail.setOnClickListener(v -> applySaved(entry));
            thumbnail.setOnLongClickListener(v -> {
                confirmDelete(entry);
                return true;
            });
            mLibraryStrip.addView(thumbnail);
        }
    }

    private void applySaved(SkinLibrary.Entry entry) {
        run(() -> {
            byte[] png = readAll(SkinLibrary.file(entry));
            SkinApi.SkinInfo info = SkinApi.upload(mAccount, png, entry.name, entry.variant);
            refreshAccountFace();
            return info;
        }, getString(R.string.skin_applied));
        checkVariant(entry.variant);
    }

    private void confirmDelete(SkinLibrary.Entry entry) {
        new AlertDialog.Builder(requireContext())
                .setTitle(entry.name)
                .setMessage(R.string.skin_library_delete_message)
                .setPositiveButton(R.string.skin_library_delete, (dialog, which) -> {
                    SkinLibrary.remove(entry.id);
                    showLibrary();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    // --- capes ---------------------------------------------------------------

    /**
     * Shows the capes the account owns, the worn one marked.
     *
     * Textures are fetched on a background thread and dropped into place as they
     * arrive, so a slow one does not hold up the rest of the screen.
     */
    private void showCapes(SkinApi.SkinInfo info) {
        mCapeStrip.removeAllViews();
        mCapesEmpty.setVisibility(info.capes.isEmpty() ? View.VISIBLE : View.GONE);

        for (SkinApi.Cape cape : info.capes) {
            ImageView thumbnail = thumbnail(null, cape.alias);
            thumbnail.setAlpha(cape.active ? 1f : 0.45f);
            thumbnail.setOnClickListener(v -> toggleCape(cape));
            mCapeStrip.addView(thumbnail);

            Bitmap cached = mCapeCache.get(cape.id);
            if (cached != null) {
                thumbnail.setImageBitmap(cached);
                continue;
            }
            PojavApplication.sExecutorService.execute(() -> {
                Bitmap texture = cape.url == null ? null : downloadBitmap(cape.url);
                if (texture == null) return;
                Bitmap front = SkinRender.enlarge(SkinRender.capeFront(texture), 128);
                Tools.runOnUiThread(() -> {
                    mCapeCache.put(cape.id, front);
                    thumbnail.setImageBitmap(front);
                });
            });
        }
    }

    private void toggleCape(SkinApi.Cape cape) {
        boolean wearing = cape.active;
        run(() -> SkinApi.setCape(mAccount, wearing ? null : cape.id),
                getString(wearing ? R.string.skin_cape_removed : R.string.skin_cape_applied, cape.alias));
    }

    // --- small helpers -------------------------------------------------------

    private ImageView thumbnail(@Nullable Bitmap bitmap, String description) {
        ImageView view = new ImageView(requireContext());
        int side = getResources().getDimensionPixelSize(R.dimen._64sdp);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(side, side);
        params.setMarginEnd(getResources().getDimensionPixelSize(R.dimen.padding_large));
        view.setLayoutParams(params);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setAdjustViewBounds(true);
        view.setContentDescription(description);
        view.setBackgroundResource(R.drawable.pk_card_selectable);
        int padding = getResources().getDimensionPixelSize(R.dimen.padding_small);
        view.setPadding(padding, padding, padding, padding);
        if (bitmap != null) view.setImageBitmap(bitmap);
        return view;
    }

    @Nullable
    private Bitmap downloadBitmap(String url) {
        try {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            DownloadUtils.download(url, buffer);
            byte[] bytes = buffer.toByteArray();
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] readAll(Context context, Uri uri) throws IOException {
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IOException("Seçilen dosya açılamadı.");
            return IOUtils.toByteArray(stream);
        }
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream stream = new FileInputStream(file)) {
            return IOUtils.toByteArray(stream);
        }
    }

    /**
     * The name the picker showed, so the collection does not fill up with
     * "msf:1000000042".
     *
     * A document uri's last path segment is the provider's own identifier and
     * only sometimes looks like a file name, so the provider is asked for the
     * display name and the segment is the fallback.
     */
    private String displayName(Uri uri) {
        try (Cursor cursor = requireContext().getContentResolver()
                .query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "The picker would not say what the file is called", e);
        }

        String path = uri.getLastPathSegment();
        if (path == null) return "skin.png";
        int slash = path.lastIndexOf('/');
        String name = slash == -1 ? path : path.substring(slash + 1);
        return name.isEmpty() ? "skin.png" : name;
    }

    @Override
    public void onDestroyView() {
        // Bitmaps outlive the views that showed them otherwise, and every one of
        // these is a scaled copy this screen made.
        mCapeCache.clear();
        super.onDestroyView();
    }
}
