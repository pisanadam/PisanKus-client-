package net.kdt.pojavlaunch.fragments;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.RadioGroup;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import net.kdt.pojavlaunch.PisanKusSkinLibrary;
import net.kdt.pojavlaunch.PisanKusSkinPreview;
import net.kdt.pojavlaunch.PisanKusSkins;
import net.kdt.pojavlaunch.PisanKusText;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.PojavProfile;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.contracts.OpenDocumentWithExtension;
import net.kdt.pojavlaunch.value.MinecraftAccount;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Skin changing, with the same pieces the desktop launcher's skin page has: the
 * account's current skin, a library of the player's own, and their capes.
 *
 * The skin belongs to the Microsoft account, not to this device: it is read
 * from and written to Mojang's profile service, so it is the same skin the
 * desktop launcher shows and the same one other players see. Only the library
 * is local, and it holds copies of the files rather than links to them — a
 * picture picked from the gallery can be moved or deleted by the phone at any
 * time.
 */
public class SkinFragment extends Fragment {
    public static final String TAG = "SkinFragment";
    /** Enough to fill the preview on a phone without blurring the pixels. */
    private static final int PREVIEW_SCALE = 8;
    private static final int THUMB_SCALE = 3;

    private ImageView mPreview;
    private TextView mStatus;
    private TextView mUsername;
    private TextView mLibraryHint;
    private TextView mCapesHint;
    private RadioGroup mVariantGroup;
    private Button mApplyButton;
    private Button mPickButton;
    private Button mResetButton;
    private Button mSaveButton;
    private RecyclerView mLibraryList;
    private RecyclerView mCapesList;

    private ActivityResultLauncher<Object> mPicker;
    /**
     * A context that outlives the screen.
     *
     * Every piece of work here — reading the account's skin, saving to the
     * library, rendering a thumbnail — runs off the main thread and can finish
     * after the player has left. Reaching for the fragment's own context at
     * that point throws "not attached to a context", so the background paths
     * use this instead and only the UI updates check that the screen is still
     * there.
     */
    private Context mContext;
    private MinecraftAccount mAccount;
    /** The picked or selected file, held until the player presses apply. */
    private byte[] mPending;
    private String mPendingName;
    /** The account's current skin bytes, so it can be saved into the library. */
    private byte[] mCurrent;

    private final LibraryAdapter mLibraryAdapter = new LibraryAdapter();
    private final CapeAdapter mCapeAdapter = new CapeAdapter();

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
        mContext = requireContext().getApplicationContext();
        mPreview = view.findViewById(R.id.pisan_skin_preview);
        mStatus = view.findViewById(R.id.pisan_skin_status);
        mUsername = view.findViewById(R.id.pisan_skin_username);
        mLibraryHint = view.findViewById(R.id.pisan_skin_library_hint);
        mCapesHint = view.findViewById(R.id.pisan_skin_capes_hint);
        mVariantGroup = view.findViewById(R.id.pisan_skin_variant);
        mApplyButton = view.findViewById(R.id.pisan_skin_apply);
        mPickButton = view.findViewById(R.id.pisan_skin_pick);
        mResetButton = view.findViewById(R.id.pisan_skin_reset);
        mSaveButton = view.findViewById(R.id.pisan_skin_save);

        mLibraryList = view.findViewById(R.id.pisan_skin_library_list);
        mLibraryList.setLayoutManager(new LinearLayoutManager(requireContext(), RecyclerView.HORIZONTAL, false));
        mLibraryList.setAdapter(mLibraryAdapter);
        mCapesList = view.findViewById(R.id.pisan_skin_capes_list);
        mCapesList.setLayoutManager(new LinearLayoutManager(requireContext(), RecyclerView.HORIZONTAL, false));
        mCapesList.setAdapter(mCapeAdapter);

        mPickButton.setOnClickListener(v -> mPicker.launch(null));
        mApplyButton.setOnClickListener(v -> apply());
        mResetButton.setOnClickListener(v -> reset());
        mSaveButton.setOnClickListener(v -> saveToLibrary());
        mApplyButton.setEnabled(false);
        mSaveButton.setEnabled(false);

        mAccount = PojavProfile.getCurrentProfileContent(requireContext(), null);
        if (mAccount == null || mAccount.isLocal() || mAccount.isDemo()) {
            // Changing a skin needs the account it belongs to; there is nothing
            // useful this screen can do without one.
            Tools.hasNoOnlineProfileDialog(requireActivity());
            return;
        }
        mUsername.setText(mAccount.username);
        reloadLibrary();
        loadCurrent();
    }

    /** Reads the account's active skin and capes, and shows them. */
    private void loadCurrent() {
        mStatus.setText(R.string.pisan_skin_loading);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusSkins.SkinInfo info = PisanKusSkins.current(mAccount.accessToken);
                final byte[] skin = info.skinUrl == null ? null : PisanKusSkins.download(info.skinUrl);
                final Bitmap preview = skin == null
                        ? null
                        : render(skin, PisanKusSkins.SLIM.equals(info.variant));
                final List<CapeItem> capes = loadCapes(info);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mCurrent = skin;
                    mSaveButton.setEnabled(skin != null);
                    mVariantGroup.check(PisanKusSkins.SLIM.equals(info.variant)
                            ? R.id.pisan_skin_variant_slim
                            : R.id.pisan_skin_variant_classic);
                    if (preview != null) mPreview.setImageBitmap(preview);
                    mStatus.setText(info.skinUrl == null
                            ? getString(R.string.pisan_skin_none)
                            : getString(R.string.pisan_skin_current));
                    mCapeAdapter.replace(capes);
                    mCapesHint.setText(info.capes.isEmpty()
                            ? getString(R.string.pisan_skin_capes_empty)
                            : getString(R.string.pisan_skin_capes_hint));
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    /**
     * Capes come with their own textures, fetched here so the list shows the
     * cape rather than its name. A cape whose image will not load still gets a
     * row — the player can put it on regardless.
     */
    private List<CapeItem> loadCapes(PisanKusSkins.SkinInfo info) {
        List<CapeItem> items = new ArrayList<>();
        items.add(new CapeItem(null, mContext.getString(R.string.pisan_skin_cape_none), null,
                info.capes.stream().noneMatch(cape -> cape.active)));
        for (PisanKusSkins.Cape cape : info.capes) {
            Bitmap image = null;
            try {
                byte[] data = PisanKusSkins.download(cape.url);
                Bitmap texture = BitmapFactory.decodeByteArray(data, 0, data.length);
                if (texture != null) {
                    image = PisanKusSkinPreview.cape(texture, THUMB_SCALE);
                    texture.recycle();
                }
            } catch (Exception ignored) {
                // An image that will not load is not worth an error screen.
            }
            items.add(new CapeItem(cape.id, cape.name, image, cape.active));
        }
        return items;
    }

    private void reloadLibrary() {
        List<PisanKusSkinLibrary.Entry> entries = PisanKusSkinLibrary.list(requireContext());
        mLibraryAdapter.replace(entries);
        mLibraryHint.setText(entries.isEmpty()
                ? getString(R.string.pisan_skin_library_empty)
                : getString(R.string.pisan_skin_library_hint));
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
                // A picked skin goes into the library straight away: a player
                // who found a skin once should not have to find the file again.
                PisanKusSkinLibrary.add(mContext, png,
                        Tools.getFileName(mContext, uri),
                        isSlimSelected() ? PisanKusSkins.SLIM : PisanKusSkins.CLASSIC);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mPending = png;
                    mPendingName = uri.getLastPathSegment();
                    if (preview != null) mPreview.setImageBitmap(preview);
                    mApplyButton.setEnabled(true);
                    mStatus.setText(R.string.pisan_skin_picked);
                    reloadLibrary();
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void select(PisanKusSkinLibrary.Entry entry) {
        PojavApplication.sExecutorService.execute(() -> {
            try {
                byte[] png = PisanKusSkinLibrary.bytes(mContext, entry);
                final Bitmap preview = render(png, PisanKusSkins.SLIM.equals(entry.variant));
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mPending = png;
                    mPendingName = entry.name + ".png";
                    mVariantGroup.check(PisanKusSkins.SLIM.equals(entry.variant)
                            ? R.id.pisan_skin_variant_slim
                            : R.id.pisan_skin_variant_classic);
                    if (preview != null) mPreview.setImageBitmap(preview);
                    mApplyButton.setEnabled(true);
                    mStatus.setText(R.string.pisan_skin_picked);
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void confirmDelete(PisanKusSkinLibrary.Entry entry) {
        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.pisan_skin_delete_title)
                .setMessage(getString(R.string.pisan_skin_delete_message, entry.name))
                .setPositiveButton(android.R.string.ok, (d, w) -> {
                    PisanKusSkinLibrary.remove(requireContext(), entry);
                    reloadLibrary();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    /** Keeps the skin the account is wearing, so it can be returned to later. */
    private void saveToLibrary() {
        if (mCurrent == null) return;
        try {
            PisanKusSkinLibrary.add(requireContext(), mCurrent, mAccount.username,
                    isSlimSelected() ? PisanKusSkins.SLIM : PisanKusSkins.CLASSIC);
            reloadLibrary();
            mStatus.setText(R.string.pisan_skin_saved);
        } catch (Exception e) {
            showError(e);
        }
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
                // The head shown next to the account is drawn from the old skin
                // until it is fetched again.
                mAccount.updateSkinFace();
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    mPending = null;
                    setBusy(false);
                    mApplyButton.setEnabled(false);
                    mStatus.setText(R.string.pisan_skin_applied);
                });
            } catch (Exception e) {
                Tools.runOnUiThread(() -> setBusy(false));
                showError(e);
            }
        });
    }

    private void applyCape(CapeItem item) {
        setBusy(true);
        mStatus.setText(R.string.pisan_skin_uploading);
        PojavApplication.sExecutorService.execute(() -> {
            try {
                PisanKusSkins.setCape(mAccount.accessToken, item.id);
                Tools.runOnUiThread(() -> {
                    if (!isAdded()) return;
                    setBusy(false);
                    mStatus.setText(R.string.pisan_skin_cape_applied);
                    loadCurrent();
                });
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
                    loadCurrent();
                });
            } catch (Exception e) {
                Tools.runOnUiThread(() -> setBusy(false));
                showError(e);
            }
        });
    }

    private boolean isSlimSelected() {
        return mVariantGroup.getCheckedRadioButtonId() == R.id.pisan_skin_variant_slim;
    }

    private void setBusy(boolean busy) {
        mPickButton.setEnabled(!busy);
        mResetButton.setEnabled(!busy);
        mSaveButton.setEnabled(!busy && mCurrent != null);
        mApplyButton.setEnabled(!busy && mPending != null);
    }

    private void showError(Exception e) {
        final String message = e.getMessage() == null ? e.toString() : e.getMessage();
        Tools.runOnUiThread(() -> {
            if (isAdded()) mStatus.setText(message);
        });
    }

    private Bitmap render(byte[] png, boolean slim) {
        return render(png, slim, PREVIEW_SCALE);
    }

    private Bitmap render(byte[] png, boolean slim, int scale) {
        Bitmap skin = BitmapFactory.decodeByteArray(png, 0, png.length);
        if (skin == null) return null;
        Bitmap preview = PisanKusSkinPreview.front(skin, slim, scale);
        skin.recycle();
        return preview;
    }

    private byte[] readAll(Uri uri) throws Exception {
        try (InputStream in = mContext.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception(PisanKusText.get(R.string.pisan_skin_file_open_failed));
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = in.read(chunk)) != -1) buffer.write(chunk, 0, count);
            return buffer.toByteArray();
        }
    }

    private class LibraryAdapter extends RecyclerView.Adapter<LibraryAdapter.Holder> {
        private final List<PisanKusSkinLibrary.Entry> mItems = new ArrayList<>();

        void replace(List<PisanKusSkinLibrary.Entry> items) {
            mItems.clear();
            mItems.addAll(items);
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new Holder(LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.pk_skin_item, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull Holder holder, int position) {
            holder.bind(mItems.get(position));
        }

        @Override
        public int getItemCount() {
            return mItems.size();
        }

        class Holder extends RecyclerView.ViewHolder {
            private final ImageView mImage;
            private final TextView mName;

            Holder(@NonNull View itemView) {
                super(itemView);
                mImage = itemView.findViewById(R.id.pk_skin_item_image);
                mName = itemView.findViewById(R.id.pk_skin_item_name);
            }

            void bind(PisanKusSkinLibrary.Entry entry) {
                mName.setText(entry.name);
                mImage.setImageDrawable(null);
                itemView.setOnClickListener(v -> select(entry));
                itemView.setOnLongClickListener(v -> {
                    confirmDelete(entry);
                    return true;
                });
                PojavApplication.sExecutorService.execute(() -> {
                    try {
                        byte[] png = PisanKusSkinLibrary.bytes(mContext, entry);
                        final Bitmap thumb = render(png, PisanKusSkins.SLIM.equals(entry.variant), THUMB_SCALE);
                        if (thumb == null) return;
                        Tools.runOnUiThread(() -> {
                            // The row may have been recycled onto another skin
                            // while the file was being read.
                            int position = getBindingAdapterPosition();
                            if (position >= 0 && position < mItems.size()
                                    && mItems.get(position).id.equals(entry.id)) {
                                mImage.setImageBitmap(thumb);
                            }
                        });
                    } catch (Exception ignored) {
                        // A thumbnail that will not render is not worth reporting.
                    }
                });
            }
        }
    }

    private static class CapeItem {
        /** Null means "no cape", which is a choice the player can make. */
        final String id;
        final String name;
        final Bitmap image;
        final boolean active;

        CapeItem(String id, String name, Bitmap image, boolean active) {
            this.id = id;
            this.name = name;
            this.image = image;
            this.active = active;
        }
    }

    private class CapeAdapter extends RecyclerView.Adapter<CapeAdapter.Holder> {
        private final List<CapeItem> mItems = new ArrayList<>();

        void replace(List<CapeItem> items) {
            mItems.clear();
            mItems.addAll(items);
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new Holder(LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.pk_cape_item, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull Holder holder, int position) {
            holder.bind(mItems.get(position));
        }

        @Override
        public int getItemCount() {
            return mItems.size();
        }

        class Holder extends RecyclerView.ViewHolder {
            private final ImageView mImage;
            private final TextView mName;

            Holder(@NonNull View itemView) {
                super(itemView);
                mImage = itemView.findViewById(R.id.pk_cape_item_image);
                mName = itemView.findViewById(R.id.pk_cape_item_name);
            }

            void bind(CapeItem item) {
                // The one in use is named as such, since nothing else on a small
                // row shows which is selected.
                mName.setText(item.active ? "✓ " + item.name : item.name);
                mImage.setImageBitmap(item.image);
                itemView.setOnClickListener(v -> {
                    if (!item.active) applyCape(item);
                });
            }
        }
    }
}
