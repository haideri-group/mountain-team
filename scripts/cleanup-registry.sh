#!/usr/bin/env bash
#
# Prune old stage-<sha> tags from the self-hosted Docker registry.
#
# Invoked from .github/workflows/deploy-staging.yml after a successful
# health check, as a housekeeping step. Keeps the 3 newest stage-<sha>
# tags and deletes the rest. Blob reclamation itself happens via the
# weekly `registry garbage-collect` cron on the homelab — this script
# only deletes manifest references.
#
# Required env vars:
#   REG_HOST    — registry hostname (e.g. registry.appz.cc)
#   REG_USER    — registry username
#   REG_PASS    — registry password
#   IMAGE_NAME  — image name within the registry (e.g. teamflow)
#
# Safe to run repeatedly. Registry API errors are logged and the script
# still exits 0 — deploy reporting shouldn't be disrupted by a pruning
# hiccup on an already-healthy container; the weekly garbage-collect
# cron is the backstop.
#
# Local debugging:
#   REG_HOST=registry.appz.cc REG_USER=staging-push REG_PASS=... \
#     IMAGE_NAME=teamflow bash scripts/cleanup-registry.sh

set -euo pipefail

# Validate required env vars BEFORE relaxing error handling — a missing
# var should be a loud immediate failure, not a silent no-op.
: "${REG_HOST:?REG_HOST is required (registry hostname)}"
: "${REG_USER:?REG_USER is required (registry username)}"
: "${REG_PASS:?REG_PASS is required (registry password)}"
: "${IMAGE_NAME:?IMAGE_NAME is required (image name within the registry)}"

# From here on: housekeeping is best-effort. Any registry API hiccup
# (401/404/timeout/etc.) should NOT propagate back to the caller; the
# app container is already live and healthy by the time this runs.
set +e

REPO_URL="https://${REG_HOST}/v2/${IMAGE_NAME}"

# `docker buildx --attest type=provenance,mode=max` stores images as OCI
# indexes, not Docker v2 manifests. Accept both (and Docker manifest-list
# for multi-arch) so manifest lookups don't 404 with MANIFEST_UNKNOWN on
# provenance-enabled pushes.
ACCEPT_MANIFEST='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'

echo "▶ Pruning old tags on ${REG_HOST}/${IMAGE_NAME} (keep 3 newest)…"

ALL_TAGS=$(curl -fsS -u "${REG_USER}:${REG_PASS}" "${REPO_URL}/tags/list" \
  | jq -r '.tags[]? // empty' \
  | grep -E '^stage-[a-f0-9]{7,}$' \
  || true)

if [ -z "$ALL_TAGS" ]; then
  echo "  no stage-<sha> tags found in registry."
  exit 0
fi

# Sanity check: at steady state we should have 3–4 tags. More than 20
# means cleanup has been silently failing — surface it loudly so we
# notice at the next deploy instead of after 50.
TAG_COUNT=$(wc -l <<< "$ALL_TAGS")
if [ "$TAG_COUNT" -gt 20 ]; then
  echo "  ⚠ ${TAG_COUNT} stage-<sha> tags found — cleanup may have been failing."
  echo "    Investigate: manual cleanup may be needed, or API calls are being rejected."
fi

# Build "<iso-date> <tag>" pairs so we can sort by creation time.
pairs=()
# shellcheck disable=SC2086  # intentional word-splitting on newline-separated tags
for tag in $ALL_TAGS; do
  # For OCI indexes, .config.digest lives inside the first image
  # manifest, not the index itself. Resolve the index first, then follow
  # to a platform manifest to read .config.digest.
  INDEX=$(curl -fsS -u "${REG_USER}:${REG_PASS}" \
    -H "Accept: ${ACCEPT_MANIFEST}" \
    "${REPO_URL}/manifests/${tag}")
  if [ -z "$INDEX" ]; then
    echo "  skip ${tag}: empty manifest response"
    continue
  fi
  MEDIA_TYPE=$(jq -r '.mediaType // ""' <<< "$INDEX")
  if [[ "$MEDIA_TYPE" == *"index"* || "$MEDIA_TYPE" == *"manifest.list"* ]]; then
    # Index — pick the linux/amd64 image manifest digest.
    SUB_DIGEST=$(jq -r '.manifests[] | select((.platform.os? == "linux") and (.platform.architecture? == "amd64")) | .digest' <<< "$INDEX" | head -n1)
    if [ -z "$SUB_DIGEST" ]; then
      # Fallback: first entry
      SUB_DIGEST=$(jq -r '.manifests[0].digest // empty' <<< "$INDEX")
    fi
    if [ -z "$SUB_DIGEST" ]; then
      echo "  skip ${tag}: no sub-manifest in OCI index"
      continue
    fi
    SUB_MANIFEST=$(curl -fsS -u "${REG_USER}:${REG_PASS}" \
      -H "Accept: ${ACCEPT_MANIFEST}" \
      "${REPO_URL}/manifests/${SUB_DIGEST}")
    CONFIG_DIGEST=$(jq -r '.config.digest // empty' <<< "$SUB_MANIFEST")
  else
    # Plain manifest — config.digest is directly here.
    CONFIG_DIGEST=$(jq -r '.config.digest // empty' <<< "$INDEX")
  fi
  if [ -z "$CONFIG_DIGEST" ]; then
    echo "  skip ${tag}: no config.digest resolved"
    continue
  fi
  CREATED=$(curl -fsS -u "${REG_USER}:${REG_PASS}" \
    "${REPO_URL}/blobs/${CONFIG_DIGEST}" \
    | jq -r '.created // "1970-01-01T00:00:00Z"')
  pairs+=("${CREATED} ${tag}")
done

if [ "${#pairs[@]}" -eq 0 ]; then
  echo "  no tag metadata resolved — nothing to prune."
  exit 0
fi

# Sort pairs desc by ISO date, skip the 3 newest, keep the rest for deletion.
REG_OLD=$(printf '%s\n' "${pairs[@]}" | sort -r | tail -n +4 | awk '{print $2}')
if [ -z "$REG_OLD" ]; then
  echo "  nothing to prune from registry (≤3 stage-<sha> tags)."
  exit 0
fi

PRUNED=0
while IFS= read -r tag; do
  [ -z "$tag" ] && continue
  # HEAD with the same broad Accept header so the registry returns the
  # correct Docker-Content-Digest for the DELETE.
  DIGEST=$(curl -fsSI -u "${REG_USER}:${REG_PASS}" \
    -H "Accept: ${ACCEPT_MANIFEST}" \
    "${REPO_URL}/manifests/${tag}" \
    | grep -i '^docker-content-digest:' \
    | awk '{print $2}' | tr -d '\r\n')
  if [ -n "$DIGEST" ]; then
    curl -fsS -u "${REG_USER}:${REG_PASS}" -X DELETE \
      "${REPO_URL}/manifests/${DIGEST}" -o /dev/null
    echo "  registry deleted :${tag}"
    PRUNED=$((PRUNED + 1))
  fi
done <<< "$REG_OLD"

echo "  deleted ${PRUNED} tag(s); blobs freed by next weekly garbage-collect cron."
exit 0
