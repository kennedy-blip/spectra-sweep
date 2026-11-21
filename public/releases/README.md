# SPECTRA-SWEEP — Android release artifacts

This folder is the deployment slot for the signed Android package.

```
public/releases/spectrasweep-release.apk
```

## How it gets here

The GitHub Actions workflow [`build-and-bundle-apk.yml`](../../.github/workflows/build-and-bundle-apk.yml)
performs the full pipeline on every push to `main`:

1. `npm ci` → `npm run build` (Vite production bundle into `dist/`)
2. `npx cap add android` (first run) → `npx cap sync android`
3. `./gradlew assembleRelease` → `app-release-unsigned.apk`
4. zipalign + apksigner (debug keystore by default, release keystore when
   `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` secrets are set)
5. copies the result to `public/releases/spectrasweep-release.apk`
6. commits the artifact back to the branch that triggered the build

## Why the file may be missing in a preview

Artifacts are only present after the workflow has run at least once. Until then the
web client detects the absence with a `HEAD` probe and **streams a valid
`application/vnd.android.package-archive` ZIP container** generated in-browser, so the
download button never 404s.

That fallback is a placeholder, not an installable app — run the workflow (or
`npm run apk:build` locally with an Android SDK) to produce the real signed APK.
