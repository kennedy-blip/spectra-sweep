#!/usr/bin/env bash
# ============================================================
# SPECTRA-SWEEP — APK packaging
# Aligns, signs and validates the Gradle output.
#
# Order matters: zipalign the BUILT apk first, then apksigner sign it.
# Signing before aligning invalidates the signature.
# ============================================================
set -euo pipefail

SRC="${1:?usage: package-apk.sh <gradle-release.apk> <out.apk>}"
OUT="${2:?usage: package-apk.sh <gradle-release.apk> <out.apk>}"

BT="$(ls -d "${ANDROID_HOME:?ANDROID_HOME not set}"/build-tools/* | sort -V | tail -n 1)"
echo "build-tools: $BT"
echo "input:       $SRC"

mkdir -p "$(dirname "$OUT")"
ALIGNED="$(mktemp -d)/aligned.apk"

# 1. align
"$BT/zipalign" -f -p 4 "$SRC" "$ALIGNED"

# 2. sign
if [ -n "${SPECTRA_KEYSTORE:-}" ] && [ -f "${SPECTRA_KEYSTORE}" ]; then
  echo "signing: release keystore"
  "$BT/apksigner" sign \
    --ks "$SPECTRA_KEYSTORE" \
    --ks-pass "pass:${SPECTRA_STOREPASS:?}" \
    --ks-key-alias "${SPECTRA_KEYALIAS:-spectrasweep}" \
    --key-pass "pass:${SPECTRA_KEYPASS:-$SPECTRA_STOREPASS}" \
    --out "$OUT" "$ALIGNED"
else
  # A release build with no keystore is UNSIGNED and will not install.
  # Sign with the SDK debug key so the artifact is always installable.
  KS="$HOME/.android/debug.keystore"
  if [ ! -f "$KS" ]; then
    echo "signing: generating debug keystore"
    mkdir -p "$HOME/.android"
    keytool -genkeypair -v \
      -keystore "$KS" \
      -storepass android -keypass android \
      -alias androiddebugkey \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
  fi
  echo "signing: SDK debug keystore"
  "$BT/apksigner" sign \
    --ks "$KS" \
    --ks-pass pass:android \
    --key-pass pass:android \
    --ks-key-alias androiddebugkey \
    --out "$OUT" "$ALIGNED"
fi

# 3. verify — an unsigned or corrupt package is useless
"$BT/apksigner" verify --print-certs "$OUT"
echo "signature verified"

# 4. structural sanity
#
# Capture the entry list ONCE. Piping `unzip` into `grep -q` is broken under
# `set -o pipefail`: grep -q exits at the first match, unzip then dies of
# SIGPIPE (141), and pipefail reports that as the pipeline's status -- so the
# check fails on a perfectly good package.
ENTRIES="$(unzip -Z1 "$OUT")"

for entry in classes.dex resources.arsc assets/public/index.html AndroidManifest.xml; do
  if ! printf '%s\n' "$ENTRIES" | grep -qxF "$entry"; then
    echo "ERROR: missing $entry" >&2
    exit 1
  fi
done

# No package may ship inside another package: a nested APK means the previous
# release was picked up from public/releases during the web build.
NESTED="$(printf '%s\n' "$ENTRIES" | grep -E '\.apk$' || true)"
if [ -n "$NESTED" ]; then
  echo "ERROR: the APK contains a nested APK:" >&2
  printf '%s\n' "$NESTED" >&2
  exit 1
fi
echo "structure verified (no nested package)"

ls -lh "$OUT"
echo "sha256=$(sha256sum "$OUT" | cut -d' ' -f1)"
echo "size=$(du -h "$OUT" | cut -f1)"
