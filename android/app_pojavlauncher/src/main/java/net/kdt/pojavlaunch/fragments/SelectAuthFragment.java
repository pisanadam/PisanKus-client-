package net.kdt.pojavlaunch.fragments;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;

/**
 * PisanKus change: the local ("offline") sign-in path is removed.
 *
 * Upstream offers a second button here that creates an account from a typed
 * username, with no Mojang session behind it. PisanKus signs in through
 * Microsoft only and verifies the account owns Minecraft: Java Edition, so the
 * button is hidden and its fragment is never reachable.
 *
 * Hiding the view rather than deleting it from the layout keeps this diff small
 * against upstream, which matters every time the vendored copy is updated.
 */
public class SelectAuthFragment extends Fragment {
    public static final String TAG = "AUTH_SELECT_FRAGMENT";

    public SelectAuthFragment(){
        super(R.layout.fragment_select_auth_method);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        Button mMicrosoftButton = view.findViewById(R.id.button_microsoft_authentication);
        Button mLocalButton = view.findViewById(R.id.button_local_authentication);

        mMicrosoftButton.setOnClickListener(v -> Tools.swapFragment(requireActivity(), MicrosoftLoginFragment.class, MicrosoftLoginFragment.TAG, null));

        // No listener is attached: an unreachable button that still responds to
        // taps would be worse than one that is simply not there.
        mLocalButton.setVisibility(View.GONE);
    }
}
