# Dictation native QA: queue-descriptor-only recovery

This sibling QA revision preserves product commit
`28d2027bcda85a36ecfe4d304f4ed5d06ea58543` and the original baseline,
rejected candidate, fixture overlay and release manifests. No Android/product
source changes belong to this branch.

## Failure and repair

The original coordinator passed `WIZARD_HEAVY_LOCK_FD` in the environment but
Python's default `subprocess.run(close_fds=True)` removed the actual descriptor.
The first nested worker therefore failed before source extraction or Gradle.
The native runner also named the obsolete AndroidBuilds-local lock; it must
validate the actual forum production queue lock.

`qa_queue_lease.py` validates the inherited FD's device/inode against
`/srv/work/heavy/production/worker.lock`, and checks Linux fdinfo for the exclusive
FLOCK on that exact open description. It never opens, acquires or releases a
lease. The coordinator passes only that FD to all three build workers and the
native runner using `pass_fds=(fd,)`; other descriptors stay closed. SDK tools
and Gradle do not consume the queue lease; the coordinator/worker retains it
through their execution. No environment deletion or admission bypass is added.

## Source-only verification

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tools python3 -m unittest -v \
  tools/test_qa_queue_lease.py tools/test_qa_dictation_insertion_native.py
```

The 23 tests include real child `fstat`, a real nested-child validation/transport
check, all four coordinator subprocess edges, the original default-close
failure, and malformed, closed, unrelated-locked, same-inode/unlocked and shared
lease refusals. Synthetic files/locks and child processes are local controller
fixtures only: these results are not native Android acceptance.

## Parent-only staging

Copy the six Python files named by `MEMBERS` in
`tools/prepare_dictation_lease_packet.py` from the exact pushed QA commit to a
private source directory on forum. Run its preparation entry point with a new
sibling path under `/srv/work/AndroidBuilds/qa` and `--qa-revision <full-QA-SHA>`.
It does not submit, extract source, build, sign, start a guest or acquire a lock.

Preparation copies the original three workers' `job.json`, `source.tar.gz` and
`worker.py` byte-for-byte into new lane directories, so their receipts cannot
overwrite failed originals. It checks manifest identities and archive fixture
hashes, and preserves the original packet/seal/failure evidence and separate
release job inputs in a new sealed closure. Only the new coordinator/native
lease-validation code is overlaid outside the product archives.

The generated `parent-only-spec.json` pins the seal SHA-256 in argv and uses the
heavy forum lane. The coordinator verifies originals and fixture/manifests,
refuses reused packet receipts, retains the 200 GiB reserve, and executes only
the three debug/control workers and native gate. It never executes the separate
release worker. `preparation.json` means prepared, not submitted or passed.
Only the owning parent may submit this spec; no submission or publication is
part of this repair. Full native acceptance, release review and physical-handset
proof remain separate gates.
