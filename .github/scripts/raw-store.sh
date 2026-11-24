#!/usr/bin/env bash
# The raw stores (raw.tar.gz, live.tar.gz) live on releases of the PRIVATE <repo>-raw repository:
# they hold unchanged copies of source files, and some sources' terms don't allow re-publishing them.
# docs/runbook.md, "Raw store".
#
#   raw-store.sh restore <tag> <asset> <extract-into>     writes exists=true|false to $GITHUB_OUTPUT
#   raw-store.sh upload  <tag> <title> <file>...          creates the release if needed, then uploads
#
# Env: RAW_STORE_REPO (owner/name), RAW_STORE_TOKEN (Contents read/write on that repo only),
#      PUBLIC_TOKEN (this repository's own token, for the one-time migration below).
set -euo pipefail

cmd=$1; shift
[ -n "${RAW_STORE_TOKEN:-}" ] || { echo "::error::RAW_STORE_TOKEN is not set (docs/runbook.md, Raw store)"; exit 1; }
private() { GH_TOKEN=$RAW_STORE_TOKEN gh "$@" -R "$RAW_STORE_REPO"; }
# A missing or expired token must stop the run, not look like "no release yet" and start from empty.
GH_TOKEN=$RAW_STORE_TOKEN gh api "repos/$RAW_STORE_REPO" --jq .private | grep -qx true \
  || { echo "::error::cannot read $RAW_STORE_REPO with RAW_STORE_TOKEN, or it is not private"; exit 1; }

case $cmd in
  restore)
    tag=$1 asset=$2 dest=$3
    mkdir -p "$dest"
    if private release view "$tag" >/dev/null 2>&1; then
      private release download "$tag" --pattern "$asset" --dir "$RUNNER_TEMP" --clobber
      tar -xzf "$RUNNER_TEMP/$asset" -C "$dest"
      echo "exists=true" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    # One-time migration: the store used to be a public release of this repository. Restore that copy
    # so the first private upload keeps the whole history. Delete the public copy once this has run.
    if GH_TOKEN=$PUBLIC_TOKEN gh release download "$tag" -R "$GITHUB_REPOSITORY" --pattern "$asset" \
         --dir "$RUNNER_TEMP" --clobber 2>/dev/null; then
      echo "::warning::$tag is not in $RAW_STORE_REPO yet: restored the old public copy. Delete it after this run."
      tar -xzf "$RUNNER_TEMP/$asset" -C "$dest"
    else
      echo "No $tag release yet: starting with an empty store."
    fi
    echo "exists=false" >> "$GITHUB_OUTPUT"
    ;;
  upload)
    tag=$1 title=$2; shift 2
    if ! private release view "$tag" >/dev/null 2>&1; then
      private release create "$tag" --latest=false --title "$title" --notes "Private raw store. docs/runbook.md, \"Raw store\"."
    fi
    private release upload "$tag" "$@" --clobber
    ;;
  *) echo "usage: raw-store.sh restore|upload ..." >&2; exit 2 ;;
esac
