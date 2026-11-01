#!/usr/bin/env bash
# Linux worker only. Every browser uses a synthetic fixture or read-only preview.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export TMPDIR="$ROOT/qa-evidence/tmp"
export QA_PLAYWRIGHT="${QA_PLAYWRIGHT:?Set QA_PLAYWRIGHT to the worker Playwright package}"
export NODE_PATH="$(dirname "$QA_PLAYWRIGHT")"
PREVIEW="${QA_PREVIEW_URL:?Set QA_PREVIEW_URL to the isolated staged origin}"
export QA_BASE_DIR="$ROOT/baseline"
mkdir -p "$TMPDIR" "$ROOT/qa-evidence"
status=0
QA_OUT="$ROOT/qa-evidence/generic" node qa-app-ready-cards.cjs > "$ROOT/qa-evidence/generic.log" 2>&1 || status=1
QA_OUT="$ROOT/qa-evidence/staged" node tools/qa-app-ready-preview.cjs "$PREVIEW" > "$ROOT/qa-evidence/staged.log" 2>&1 || status=1
QA_OUT="$ROOT/qa-evidence/app-back" node tools/qa-app-done-returns.cjs "$PREVIEW/wizard-os-home/?open=chats&shell=phone" > "$ROOT/qa-evidence/app-back.log" 2>&1 || status=1
QA_WEB_DIR="$ROOT" QA_SHOTS="$ROOT/qa-evidence/opaque" node tools/qa-opaque-overlays.cjs > "$ROOT/qa-evidence/opaque.log" 2>&1 || status=1
printf 'Browser acceptance exit=%s; evidence=%s/qa-evidence\n' "$status" "$ROOT"
exit "$status"
