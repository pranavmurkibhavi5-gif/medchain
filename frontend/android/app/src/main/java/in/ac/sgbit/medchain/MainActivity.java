package in.ac.sgbit.medchain;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * The single Activity hosting the web application.
 *
 * FLAG_SECURE is set for the whole app. Android then refuses to take a
 * screenshot or record the screen, and blanks the window in the recent-apps
 * switcher - so a decrypted medical record is not left sitting in a thumbnail
 * that outlives the session.
 *
 * What it does NOT do, and the interface says so rather than implying
 * otherwise: it cannot stop someone photographing the screen with a second
 * phone, and it has no effect on the website, where the browser owns the
 * window. It raises the effort required. It does not make a record
 * uncopyable, and nothing can.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Set before super.onCreate, so the flag is in place before the first
        // frame is ever composited.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        super.onCreate(savedInstanceState);
    }
}
