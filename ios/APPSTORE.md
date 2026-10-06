# Chairbook — App Store build

Paid app, USD 0.99. Bundle ID `com.hakoya.chairbook`. Publisher: HAKOYA LLC. iPhone only, iOS 15.0+.
Formerly "Salon Studio" (renamed for the App Store, 2026-10-06).

## How the App Store build differs from the web build
Built by `scripts/build-store.py` from the repository's `index.html`. The web files are never modified.
- Name: Chairbook (title, export and backup file names, CSV import message); neutral name placeholder.
- Fonts: Fraunces and Karla bundled from @fontsource (SIL OFL 1.1); no network request.
- Saving files: CSV export and JSON backup open the iOS share sheet (Save to Files, Mail, AirDrop)
  through @capacitor/filesystem and @capacitor/share. `<a download>` does nothing inside an iOS app.
- Data: unchanged (localStorage key `salon_studio_v1`), so CSV and backup formats match the web app.

## Build and upload
GitHub Actions > "iOS build (App Store)" > Run workflow, with the marketing version (match App Store Connect).
Build number = workflow run number. Signing is automatic with the team App Store Connect API key.
Repository secrets: `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`, `APPLE_TEAM_ID`.

## Files
- `scripts/build-store.py` — web bundle for the App Store build
- `scripts/native-setup.py` — icon, splash, Info.plist, iPhone only, privacy manifest, iOS 15
- `scripts/make-icon.py` — draws `icons/icon-1024.png`
