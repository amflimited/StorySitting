# StorySitting App Store handoff

The signing and server-verification machinery is ready. The one Apple UI-only step is creating the app record in App Store Connect.

1. In **Apps → + → New App**, choose iOS, name `StorySitting`, primary language English (U.S.), bundle ID `com.amflimited.storysitting`, and SKU `STORYSITTING-IOS-001`.
2. Create the seven consumable products exactly as listed in `../Config/StorySitting.storekit`.
3. Set the App Store Server Notifications V2 production and sandbox URL to `https://storysitting.com/api/webhooks/apple`.
4. Add the copy in `metadata/en-US`, complete the App Privacy questionnaire to match `../StorySitting/PrivacyInfo.xcprivacy`, and add a review account with a populated internal project.
5. Run **Build and release StorySitting iOS** once with `upload=false`; inspect the signed IPA artifact. Capture genuine iPhone screenshots from that build.
6. Run again with `upload=true` to send the IPA to App Store Connect/TestFlight.

Do not submit with fixture screenshots or claim the storyteller uses the app. The sponsor is the app user; the storyteller uses an ordinary phone and retains independent permission control.
