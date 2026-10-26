# Chairbook — App Store build

Paid app, USD 4.99. Bundle ID `com.hakoya.chairbook`. Publisher: HAKOYA LLC. iPhone only, iOS 15.0+.
Formerly "Salon Studio" (renamed for the App Store, 2026-10-06).

## Version 1.1 (rework after the 4.3 / 4.2.6 review of 1.0, 2026-10-16)
Native features, Swift sources in `native/`, wired into the app target by `scripts/native-setup.py`:
- `BookingAlertsPlugin.swift` — local notifications before each booking and a rebooking nudge after a visit (UserNotifications), with notification actions.
- `CalendarHandoffPlugin.swift` — Add to Calendar with Apple's event editor (EventKit / EventKitUI; no permission on iOS 17+, access request on iOS 15/16).
- `ChairbookIntents.swift` — Siri / Spotlight / Shortcuts: Show Today's Bookings, Log a Payment, Book an Appointment (App Intents iOS 16+, App Shortcuts iOS 17+; AppIntents weak-linked).
- `TactilePlugin.swift` — haptic feedback.
- `ChairbookBridgeViewController.swift` — registers the plugins; Main.storyboard points to it.
Interface: `src/chairbook.css` (graphite and champagne theme, capsule dock, Manrope) and `src/chairbook-native.js`
(day rail on Today, booking length, open gaps, reminders, calendar, routes, rebooking reminders on clients).
New icon from `scripts/make-icon.py`. `chairbook://` URL scheme for the Square Point of Sale return.

## How the App Store build differs from the web build
Built by `scripts/build-store.py` from the repository's `index.html`. The web files are never modified.
- Name: Chairbook (title, export and backup file names, CSV import message); neutral name placeholder.
- Fonts: Manrope bundled from @fontsource (SIL OFL 1.1); no network request.
- Saving files: CSV export and JSON backup open the iOS share sheet (Save to Files, Mail, AirDrop)
  through @capacitor/filesystem and @capacitor/share. `<a download>` does nothing inside an iOS app.
- Data: unchanged (localStorage key `salon_studio_v1`), so CSV and backup formats match the web app.
  1.1 adds optional fields only: `appointment.minutes`, `appointment.inCalendar`, `client.followUp`, `db.prefs`.

## Checks before upload
    cd ios && npm ci && npm run build:www
    node qa/preflight.mjs        # bundle behind a simulated Capacitor bridge, all flows incl. native paths
    node qa/store-shots.mjs      # store/screenshots/*.png (1206x2622)
Store texts: `store/description.txt`, `store/promo.txt`, `store/review-notes.txt`.

## Build and upload
GitHub Actions > "iOS build (App Store)" > Run workflow, with the marketing version (match App Store Connect).
Build number = workflow run number. Signing is automatic with the team App Store Connect API key.
Repository secrets: `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`, `APPLE_TEAM_ID`.

## Files
- `scripts/build-store.py` — web bundle for the App Store build
- `scripts/native-setup.py` — icon, splash, Info.plist, iPhone only, privacy manifest, iOS 15, native Swift files
- `scripts/make-icon.py` — draws `icons/icon-1024.png`
