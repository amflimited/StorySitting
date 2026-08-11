# StorySitting App Store handoff

The production-connected sponsor app and App Store assets are built. This file records the remaining web-only submission controls so build state is never confused with live App Store availability.

Completed on August 11, 2026:

- StorySitting 1.0 app record and version metadata.
- Seven worldwide consumable products with prices, localizations, review notes, and processed review screenshots.
- Six processed `APP_IPHONE_67` screenshots rendered from the shipping SwiftUI views on an iPhone 17 Pro Max simulator. Capture mode uses an explicitly fictional family and never customer material; it does not add fake playback controls.
- Isolated production App Review login with one fictional preview-ready project and real sample preview media.
- Signed build 2, uploaded, processed as `VALID`, and attached to version 1.0.
- Internal TestFlight group with access to all builds and build 2 testing notes.

Remaining in the App Store Connect website:

1. Complete App Privacy to match `../StorySitting/PrivacyInfo.xcprivacy` and the live privacy policy.
2. On version 1.0, select all seven first in-app purchases so Apple reviews the binary and purchases together. Apple requires this first association in the website.
3. Set both App Store Server Notifications V2 URLs to `https://storysitting.com/api/webhooks/apple`.
4. Submit the combined app and in-app purchases for review. Do not submit the app alone because the result-edition experience depends on those products.

The sponsor is the app user. The storyteller uses an ordinary phone and retains independent control; review copy and screenshots must never imply that sponsor payment grants permission.
