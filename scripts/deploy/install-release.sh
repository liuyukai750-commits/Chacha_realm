#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: sudo $0 /absolute/path/chacha-street-<sha>.tar.gz <release-id>"
}

[ "$#" -eq 2 ] || { usage; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 2; }

artifact="$1"
release_id="$2"
app_root="/srv/chacha-street"
releases_root="$app_root/releases"
shared_root="$app_root/shared"
current_link="$app_root/current"
release_dir="$releases_root/$release_id"

[[ "$artifact" = /* ]] || { echo "Artifact path must be absolute." >&2; exit 2; }
[[ "$release_id" =~ ^[A-Za-z0-9._-]{6,64}$ ]] || { echo "Invalid release id." >&2; exit 2; }
[ -f "$artifact" ] || { echo "Artifact not found: $artifact" >&2; exit 2; }
[ -f "$artifact.sha256" ] || { echo "Missing checksum file: $artifact.sha256" >&2; exit 2; }
[ ! -e "$release_dir" ] || { echo "Release already exists: $release_dir" >&2; exit 2; }

cd "$(dirname "$artifact")"
sha256sum --check "$(basename "$artifact").sha256"

# Reject absolute paths and parent traversal before extraction.
if tar -tzf "$artifact" | awk '/^\// || (^|\/)\.\.($|\/)/ { bad=1 } END { exit bad ? 0 : 1 }'; then
  echo "Archive contains an unsafe path." >&2
  exit 2
fi

install -d -o chacha -g chacha -m 0750 "$releases_root" "$shared_root/cache"
install -d -o chacha -g chacha -m 0750 "$release_dir"
tar -xzf "$artifact" -C "$release_dir"

for required in server.js package.json .next/static public release-manifest.json; do
  [ -e "$release_dir/$required" ] || { echo "Release is missing $required" >&2; exit 2; }
done

rm -rf -- "$release_dir/.next/cache"
ln -s "$shared_root/cache" "$release_dir/.next/cache"
chown -R chacha:chacha "$release_dir"

previous=""
if [ -L "$current_link" ]; then previous="$(readlink -f "$current_link")"; fi
ln -sfn "$release_dir" "$current_link"

systemctl restart chacha-street

healthy=0
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3000/ >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -eq 1 ]; then
  echo "Release $release_id is healthy."
  exit 0
fi

echo "Health check failed; rolling back the current symlink." >&2
if [ -n "$previous" ] && [ -d "$previous" ]; then
  ln -sfn "$previous" "$current_link"
  systemctl restart chacha-street
  echo "Rolled back to $(basename "$previous")." >&2
else
  systemctl stop chacha-street
  echo "No previous release exists; service was stopped." >&2
fi
exit 1
