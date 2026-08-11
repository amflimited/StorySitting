# StorySitting v0.3 build plan

## Objective

Prove the full sponsored-sitting loop across public web, sponsor web, phone operations, and iPhone:

```text
$5 start → independent authorization → sitting + private preview → optional $79 unlock → next good question
```

The grandparent or other storyteller must be able to complete the experience with an ordinary telephone and no app account.

## What v0.3 establishes

- One public value proposition and one locked $5/$79/no-subscription offer.
- A consent-safe Story Start intake and Stripe Checkout foundation.
- Separate sponsor, storyteller, and StorySitting responsibilities.
- Permission paths that do not treat sponsor intent as storyteller consent.
- Call, consent, do-not-call, payment, chapter, correction, question, and push-device records.
- Verified Stripe and Retell webhook entrypoints with idempotent event storage.
- A sponsor-facing Story Shelf, status timeline, Story Drop, sources, questions, and family invitations.
- A native SwiftUI iPhone foundation with StoreKit consumables and shared product states.
- A public sample that proves source audio/transcript/chapter linkage.
- A comparison page that explains why “managed and finished” is different from prompts or a raw recorder.

## Gate 1 — local integrity

- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Public, start, demo, signup, login, dashboard, and Story Room routes render at desktop and mobile widths.
- [ ] Static marketing links, anchors, forms, sample, compare, privacy, and terms resolve.
- [ ] `swift test` passes in `ios/`.
- [ ] The generated iOS project builds in current Xcode on macOS.

## Gate 2 — data and provider sandbox

- [ ] Apply migrations `001` and `002` to a staging Supabase project.
- [ ] Confirm every customer table has the intended row-level-security behavior.
- [ ] Configure private storage and signed access for recordings and family uploads.
- [ ] Complete a $5 Stripe test checkout and receive one verified, idempotent webhook event.
- [ ] Verify the explicit $79 unlock path without charging $79 at authorization, during the sitting, or before the finished-result preview is ready.
- [ ] Receive signed Retell `call_started`, `call_ended`, and `call_analyzed` events.
- [ ] Prove that duplicate provider events do not duplicate orders, calls, or consent evidence.
- [ ] Prove a do-not-call record prevents a new Story Start for that number.

## Gate 3 — permission operations

- [ ] Family Pass copy identifies the sponsor, StorySitting, purpose, AI use, recording choice, and a safe way to decline.
- [ ] Human-hello script and staff queue exist.
- [ ] Storyteller-initiated call flow exists.
- [ ] Automated outbound interviewing cannot be scheduled until contact/AI permission is recorded.
- [ ] Every sitting reconfirms AI disclosure and recording permission.
- [ ] “No,” uncertainty, confusion, distress, and stop requests end the automated flow and route correctly.
- [ ] Revocation and family-sharing restrictions are visible to sponsor, staff, and delivery systems.

## Gate 4 — finished-story production

- [ ] A completed call produces durable source audio and transcript records.
- [ ] The strongest moment appears as a private Story Drop.
- [ ] Edited chapters link back to exact transcript/audio passages.
- [ ] Human QA checks names, dates, unsupported prose, sensitive material, and permissions.
- [ ] One factual correction pass can be requested, resolved, and audited.
- [ ] Storyteller sharing choice is enforced before sponsor/family delivery.
- [ ] Recording, transcript, approved chapter, images, and permission record can be exported.
- [ ] A failed result can trigger the promised $79 refund after corrections.

## Gate 5 — iPhone product

- [ ] App identifiers, signing, icons, privacy manifest, and production configuration are set.
- [ ] StoreKit products map exactly to the $5 Story Start and $79 finished-result unlock; no subscription product exists.
- [ ] Purchases are verified server-side and reconcile to the same order ledger as web purchases.
- [ ] Deep links, authentication, push notifications, Story Drops, playback, questions, review, and export work on device.
- [ ] VoiceOver, Dynamic Type, reduced motion, tap targets, empty states, offline behavior, and error recovery are tested.
- [ ] App Review copy clearly explains that the storyteller uses the phone and the sponsor app manages the family project.

## Gate 6 — one internal First Orbit

Run one controlled project end to end:

1. Sponsor pays $5 and selects a permission path.
2. Storyteller authorizes independently.
3. Storyteller completes a disclosed 30-minute call without an automatic $79 charge.
4. Staff resolves quality exceptions and prepares the private preview.
5. Sponsor receives the preview and deliberately pays $79 to unlock the result.
6. Family receives the full Story Drop, recording, transcript, and source-linked chapter.
7. One correction is submitted and resolved.
8. Storyteller-approved family sharing is enforced.
9. Sponsor exports all purchased files.
10. Sponsor queues a next question without an automatic charge or call.

Record conversion, call minutes, provider cost, human QA minutes, correction time, refund risk, and the emotional moment the family valued most.

## Launch boundary

Do not treat polished screens as production readiness. Public launch requires Gates 1–4 and the First Orbit. App Store submission additionally requires Gate 5. Keep the legacy Story Room/Memory Card/Story Map machinery as staff production infrastructure, but do not lead customers back into the retired $350/$750 Homeplace offer.

## After proof—not before

- Optional print book (priced separately).
- Multiple storytellers in one project.
- Partner/referral portal.
- Gifting dates and scheduled reveals.
- Advanced Story Thread graph and family voting.
- Non-US phone and consent operations.
- Expanded human-interviewer services.

Each follows actual completion and margin data from the locked $5/$79 loop; none changes the current offer.
