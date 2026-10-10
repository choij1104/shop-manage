# Chairbook — Google Play build

Paid app, USD 4.99 (same as the App Store). Application ID `com.hakoya.chairbook`. Publisher: HAKOYA LLC.

The Google Play build uses the same web bundle as the App Store build: `ios/scripts/build-store.py`
run on the `index.html` of the commit that App Store version 1.0 (build 3) was made from
(`APP_SOURCE` in `.github/workflows/android.yml`). Bundled fonts, no network, CSV export and
backup through the Android share sheet (@capacitor/filesystem, @capacitor/share). Payment Connect
(added to the web app after that commit) is not in either store build yet.

The bundle's `capacitor.js` is replaced with the Android project's own @capacitor/core (8.x) so the
JavaScript runtime matches the native bridge.

## Build
GitHub Actions → "Android build (Google Play)". Runs on a push to `android-build` or by manual
dispatch. Produces an **unsigned** App Bundle, kept as a workflow artifact and committed to the
`android-artifacts` branch at `dist/chairbook-<version>-<code>-unsigned.aab` (`dist/LATEST` names
the newest). versionCode = workflow run number.

## Sign
HAKOYA LLC upload key (same key as TOXCARD and Silent Medic Vet; kept by the account holder,
backed up in Google Drive 00_CLAUDE_HQ/TOXCARD_Android_UploadKey):

    jarsigner -keystore toxcard-upload.jks -signedjar out-signed.aab in-unsigned.aab toxcard-upload
    jarsigner -verify out-signed.aab

## Files
- `scripts/native-setup.py` — launcher and adaptive icons, splash, version, ID and targetSdk checks
- `capacitor.config.json`, `package.json`, `package-lock.json`
