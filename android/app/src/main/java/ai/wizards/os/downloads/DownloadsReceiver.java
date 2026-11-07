package ai.wizards.os.downloads;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** DownloadManager.ACTION_DOWNLOAD_COMPLETE: records the finish and tells the open shell page (if any). */
public final class DownloadsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
        if (id < 0) return;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try { Downloads.onComplete(context.getApplicationContext(), id); }
            finally { pending.finish(); }
        }, "wizard-downloads-complete").start();
    }
}
