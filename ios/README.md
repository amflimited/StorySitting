# StorySitting for iPhone

Native iOS 17+ prototype for the family sponsor: an adult child or grandchild deliberately begins and follows each StorySitting while the storyteller keeps control of whether an interview ever happens.

## Product contract

- Every sitting begins with a deliberate `$5 Story Start` consumable. It creates a Family Pass and begins the workflow; it does **not** grant permission for or schedule an automated/AI interview.
- The sponsor shares the Family Pass. The storyteller responds for themselves. An interested response only requests the next step; it is not AI-interview permission.
- StorySitting then arranges a separate, managed direct conversation with a human. The storyteller may call in or agree to receive that human call. The human verifies the storyteller’s identity, explains the optional AI-assisted interview, and records whether the storyteller grants or declines permission to schedule it. Sponsor payment, sponsor confirmation, and the Family Pass response can never substitute for this check.
- Only after verified storyteller permission from that managed human check may the service schedule the AI-assisted interview.
- At the interview, StorySitting discloses the AI interviewer and recording again. Recording starts only after a fresh yes. A decline ends the interview without recording or result production.
- After a completed sitting, StorySitting prepares a representative listening/reading preview—not a deliberately weak teaser. The sponsor can then choose the `$39` Voice, `$79` Story, or `$149` Heirloom Edition. Later upgrades charge only the difference.
- There is no subscription. Another sitting begins only with another deliberate `$5 Story Start`.

The shipping app opens on a real passwordless sponsor login and talks to `https://storysitting.com/api/v1`. The email-code session is stored in the iOS Keychain. Story Shelf, project state, questions, purchase intents, and verified fulfillment all use the production API. The bundled Maya/Evelyn/Leo mock remains only for portable domain tests and local preview fixtures.

The fixture does not attach real audio URLs. The result reader therefore opens on the representative text and explicitly withholds playback controls instead of simulating audio. Production audio controls should appear only when the backend supplies a playable source.

## Structure

```text
StorySitting/                         SwiftUI app target
  App/                               composition and state
  Design/                            flat Listening Ledger design system and sponsor journey copy
  Services/                          StoreKit and preview playback
  Views/                             shelf, safe-handshake timeline, result, questions, next sitting
Packages/StorySittingCore/            Foundation-only domain package
  Sources/StorySittingCore/          models, API boundary, mock, fixtures
  Tests/StorySittingCoreTests/       economics and consent/workflow tests
Config/StorySitting.storekit          start, edition, and exact-difference upgrade consumables
project.yml                           XcodeGen project definition
```

The backend boundary is `StorySittingAPI`. `StorySittingApp.swift` instantiates `ProductionStorySittingAPI`; `MockStorySittingAPI` is not on the shipping path. Before StoreKit opens, `createPurchaseIntent` binds a unique `appAccountToken` to the product, family project, selected questions, and optional result ID. `fulfillPurchase` sends transaction IDs and signed JWS to the live server. The server uses Apple’s official App Store Server Library, compares the verified transaction to the exact intent, records repeatable consumables by transaction ID, and revokes access from verified refund notifications.

`recordFamilyPassResponse` and `recordManagedHumanPermissionCheck` live on the separate `StorySittingOperatorAPI`, not the sponsor app’s `StorySittingAPI`. The first transition can only move a willing storyteller into `awaitingManagedHumanPermissionCheck`; it cannot create a schedule. The second requires a recorded inbound or outbound managed-human contact direction plus successful identity verification, and it is the only transition that can grant permission and create an interview schedule. The sponsor app model therefore has no capability to assert permission.

Locked result payloads contain only preview copy; the mock hydrates the complete text at fulfillment time. `StoreService` retains verified transactions by transaction ID, never by reusable product kind. It enumerates `Transaction.unfinished` at launch, resubmits each signed proof through idempotent backend fulfillment, and finishes that exact transaction only after success. StoreKit transaction and original-transaction identifiers remain `UInt64` in-process but are encoded on the API wire as lossless decimal strings, never JSON numbers. Missing-token or unverified transactions remain unfinished for investigation instead of being consumed.

## Build

1. Install XcodeGen 2.42 or newer.
2. From `ios/`, run `./scripts/gen-project.sh`.
3. Open `StorySitting.xcodeproj` and run the `StorySitting` scheme on an iOS 17+ simulator.

The scheme attaches `Config/StorySitting.storekit`, so Story Start, all three direct editions, and all three difference-only upgrades can be tested locally. No microphone permission is requested because the sponsor app does not conduct or record the sitting.

Run the portable domain tests on macOS or Linux:

```bash
cd Packages/StorySittingCore
swift test
```

## App Store release state

- Bundle ID registered: `com.amflimited.storysitting`
- Apple capabilities enabled: In-App Purchase and Associated Domains
- Universal links published at `https://storysitting.com/.well-known/apple-app-site-association`
- Dedicated App Store distribution profile created: `StorySitting App Store`
- Release metadata and export options: `AppStore/`
- Signed macOS archive workflow: `.github/workflows/ios-release.yml`

Apple’s API permits bundle IDs, capabilities, certificates, and profiles, but the `apps` resource does not permit `CREATE`. An Account Holder/Admin must create the StorySitting app record once in the App Store Connect web interface with bundle ID `com.amflimited.storysitting`. After that, create the seven consumables from `Config/StorySitting.storekit`, add review credentials/screenshots, and run the release workflow with `upload=true`.
