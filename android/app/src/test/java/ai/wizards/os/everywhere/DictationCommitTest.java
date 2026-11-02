package ai.wizards.os.everywhere;

import org.junit.Test;
import static org.junit.Assert.*;

public class DictationCommitTest {
    private static final class Editor implements DictationCommit.Connection {
        String before, after; int commits; boolean failBefore, failCommit, failAfter;
        Editor(String before, String after) { this.before = before; this.after = after; }
        public CharSequence before() { if (failBefore) throw new IllegalStateException(); return before; }
        public void commit(String text) { commits++; if (failCommit) throw new IllegalStateException(); }
        public CharSequence after() { if (failAfter) throw new IllegalStateException(); return after; }
    }

    @Test public void opaqueEditorUsesPasteWithoutSendingBlindCommit() {
        Editor e = new Editor(null, null);
        assertEquals(DictationCommit.Result.UNAVAILABLE, DictationCommit.insert(e, "hello"));
        assertEquals(0, e.commits);
    }
    @Test public void unavailablePreflightDoesNotCommit() {
        Editor e = new Editor("", "hello"); e.failBefore = true;
        assertEquals(DictationCommit.Result.UNAVAILABLE, DictationCommit.insert(e, "hello"));
        assertEquals(0, e.commits);
    }
    @Test public void verifiedChangedEditorAcceptsCaseAndSpacing() {
        Editor e = new Editor("", "Hello ");
        assertEquals(DictationCommit.Result.VERIFIED, DictationCommit.insert(e, "hello "));
        assertEquals(1, e.commits);
    }
    @Test public void noOpCommitIsNotSuccessEvenWhenWordsAlreadyExist() {
        Editor e = new Editor("hello", "hello");
        assertEquals(DictationCommit.Result.UNVERIFIED, DictationCommit.insert(e, "hello"));
    }
    @Test public void unreadableReplyIsNotSuccessOrPermissionToPasteAgain() {
        Editor e = new Editor("", null);
        assertEquals(DictationCommit.Result.UNVERIFIED, DictationCommit.insert(e, "hello"));
        assertEquals(1, e.commits);
    }
    @Test public void unrelatedEditorChangeDoesNotVerifyInsertion() {
        Editor e = new Editor("before", "different");
        assertEquals(DictationCommit.Result.UNVERIFIED, DictationCommit.insert(e, "hello"));
    }
    @Test public void lostCommitReplyDoesNotAuthorizeSecondInsertion() {
        Editor e = new Editor("", "hello"); e.failCommit = true;
        assertEquals(DictationCommit.Result.UNVERIFIED, DictationCommit.insert(e, "hello"));
        assertEquals(1, e.commits);
    }
    @Test public void lostReadbackIsNotSuccess() {
        Editor e = new Editor("", "hello"); e.failAfter = true;
        assertEquals(DictationCommit.Result.UNVERIFIED, DictationCommit.insert(e, "hello"));
    }
}
