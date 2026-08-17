package net.kdt.pojavlaunch.fragments;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.RadioGroup;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.PisanKusSkinPreview;
import net.kdt.pojavlaunch.PisanKusSkins;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.PojavProfile;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.contracts.OpenDocumentWithExtension;
import net.kdt.pojavlaunch.value.MinecraftAccount;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Skin changing, the piece the Android launcher was missing.
 *
 * The skin belongs to the Microsoft account, not to this device: it is read
 * from and written to Mojang's profile service, so it is the same skin the
 * desktop launcher shows and the same one other players see.
 */
public class SkinFragment extends Fragment {
    public static final String TAG = "SkinFragment";
    /** Enough to fill the preview on a phone without blurring the pixels. */
    private static final int PREVIEW_SCALE = 8;

    private ImageView mPreview;
    private TextView mStatus;
    private TextView mUsername;
    private RadioGroup mVariantGroup;
    private Button mApplyButton;
    private Button mPickButton;
    private Button mResetButton;

    private ActivityResultLauncher<Object> mPicker;
    private MinecraftAccount mAccount;
    /** The picked file, held until the player presses apply. */
    private byte[] mPending;
    private String mPendingName;

    public SkinFragment() {
        super(R.layout.fragment_pisan_skin);
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mPicker = registerForActivityResult(new OpenDocumentWithExtension("png"), this::onPicked);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        mPreview = view.findViewById(R.id.pisan_skin_preview);
        mStatus = view.findViewById(R.id.pisan_skin_status);
        mUsername = view.findViewById(R.id.pisan_skin_username);
        mVariantGroup = view.findViewById(R.id.pisan_skin_variant);
        mApplyButton = view.findViewById(R.id.pisan_skin_apply);
        mPickButton = view.findViewById(R.id.pisan_skin_pick);
        mResetButton = view.findViewById(R.id.pisan_skin_reset);

        mPickButton.setOnClickListener(v -> mPicker.launch(null));
        mApplyButton.setOnClickListener(v -> apply());
        mResetButton.setOnClickListener(v -> reset());
        mApplyButton.setEnabled(false);

        mAccount = PojavProfile.getCurrentProfileContent(requireContext(), null);
        if (mAccount == null || mAccount.isLocal() || mAccount.isDemo()) {
            // Changing a skin needs the account it belongs to; there is nothing
            // useful this screen can do without one.
            Tools.hasNoOnlineProfileDialog(requireActivity());
            return;
        }
        mUsername.setText(mAccount.username);
        loadCurrent();
    }

    /** Reads the account's active skin and shows it. */
    private void loadCurrent() {
        mStatus.setText(R.string.pisan_skin_loading);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusSkins.SkinInfo info = PisanKusSkins.current(mAccount.accessToken);
                final Bitmap preview = info.skinUrl == null
                        ? null
                        : render(PisanKusSkins.download(info.skinUrl), PisanKusSkins.SLIM.equals(info.variant));
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mVariantGroup.check(PisanKusSkins.SLIM.equals(info.variant)
                            ? R.id.pisan_skin_variant_slim
                            : R.id.pisan_skin_variant_classic);
                    if (preview != null) mPreview.setImageBitmap(preview);
                    mStatus.setText(info.skinUrl == null
                            ? getString(R.string.pisan_skin_none)
                            : getString(R.string.pisan_skin_current));
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void onPicked(@Nullable Uri uri) {
        if (uri == null) return;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                byte[] png = readAll(uri);
                // Checked here rather than on send: the service answers a bare
                // 400 for a wrong-sized image, which explains nothing.
                PisanKusSkins.assertValidSkin(png);
                final Bitmap preview = render(png, isSlimSelected());
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mPending = png;
                    mPendingName = uri.getLastPathSegment();
                    if (preview != null) mPreview.setImageBitmap(preview);
                    mApplyButton.setEnabled(true);
                    mStatus.setText(R.string.pisan_skin_picked);
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void apply() {
        if (mPending == null) return;
        final byte[] png = mPending;
        final String name = mPendingName;
        final String variant = isSlimSelected() ? PisanKusSkins.SLIM : PisanKusSkins.CLASSIC;
        setBusy(true);
        mStatus.setText(R.string.pisan_skin_uploading);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusSkins.upload(mAccount.accessToken, png, name, variant);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mPending = null;
                    setBusy(false);
                    mApplyButton.setEnabled(false);
                    mStatus.setText(R.string.pisan_skin_applied);
                });
                // The head shown next to the account is drawn from the old skin
                // until it is fetched again.
                mAccount.updateSkinFace();
            } catch (Exception e) {
                Tools.runOnUiThread(() -> setBusy(false));
                showError(e);
            }
        });
    }

    private void reset() {
        setBusy(true);
        mStatus.setText(R.string.pisan_skin_uploading);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusSkins.reset(mAccount.accessToken);
                mAccount.updateSkinFace();
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    mPending = null;
                    mApplyButton.setEnabled(false);
                });
                loadCurrentOnUi();
            } catch (Exception e) {
                Tools.runOnUiThread(() -> setBusy(false));
                showError(e);
            }
        });
    }

    private void loadCurrentOnUi() {
        Tools.runOnUiThread(() -> {
            if (isAdded()) loadCurrent();
        });
    }

    private boolean isSlimSelected() {
        return mVariantGroup.getCheckedRadioButtonId() == R.id.pisan_skin_variant_slim;
    }

    private void setBusy(boolean busy) {
        mPickButton.setEnabled(!busy);
        mResetButton.setEnabled(!busy);
        mApplyButton.setEnabled(!busy && mPending != null);
    }

    private void showError(Exception e) {
        final String message = e.getMessage() == null ? e.toString() : e.getMessage();
        Tools.runOnUiThread(() -> {
            if (isAdded()) mStatus.setText(message);
        });
    }

    private Bitmap render(byte[] png, boolean slim) {
        Bitmap skin = BitmapFactory.decodeByteArray(png, 0, png.length);
        if (skin == null) return null;
        Bitmap preview = PisanKusSkinPreview.front(skin, slim, PREVIEW_SCALE);
        skin.recycle();
        return preview;
    }

    private byte[] readAll(Uri uri) throws Exception {
        try (InputStream in = requireContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("Dosya açılamadı.");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = in.read(chunk)) != -1) buffer.write(chunk, 0, count);
            return buffer.toByteArray();
        }
    }
}
