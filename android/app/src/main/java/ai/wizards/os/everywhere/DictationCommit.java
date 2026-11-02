package ai.wizards.os.everywhere;

import java.util.Locale;

/** A non-null accessibility input connection is not proof that an editor accepts input. */
final class DictationCommit {
    enum Result { UNAVAILABLE, VERIFIED, UNVERIFIED }

    interface Connection {
        CharSequence before();
        void commit(String text);
        CharSequence after();
    }

    private DictationCommit() { }

    static Result insert(Connection connection, String text) {
        final String before;
        try {
            CharSequence value = connection.before();
            // Some editors expose an input connection but no surrounding-text channel. Do not send
            // a fire-and-forget commit there: use the existing focused-node paste path instead.
            if (value == null) return Result.UNAVAILABLE;
            before = value.toString();
        } catch (RuntimeException e) { return Result.UNAVAILABLE; }
        try {
            connection.commit(text);
            CharSequence after = connection.after();
            if (after != null && !before.contentEquals(after)
                    && after.toString().toLowerCase(Locale.ROOT).contains(text.trim().toLowerCase(Locale.ROOT)))
                return Result.VERIFIED;
        } catch (RuntimeException ignored) { }
        // A commit might have reached the editor even if its reply is unavailable or delayed. Never
        // automatically paste again after an ambiguous commit: keep the clipboard recovery instead.
        return Result.UNVERIFIED;
    }
}
