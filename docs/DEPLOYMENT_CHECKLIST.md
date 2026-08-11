# v0.3 Deployment and Release Checklist

This checklist prepares a **staging environment**. It is not authorization to accept live Story Starts. Keep Stripe in test mode and provider call dispatch disabled until every no-ship gate at the end is closed.

## 1. Source of truth

- Deploy the Next.js app and API from this repository; do not treat the older S2/nginx files as the application backend.
- Preserve a database backup before applying migrations.
- Confirm whether any environment ever ran a draft of migration `002`.
  - Fresh database: apply `001`, `002`, then `003` in order.
  - Draft `002` database: review the archive/preflight behavior in `003` before applying it. Reconcile any duplicate payment intents, StoreKit transactions, or sponsor correction passes that the preflight reports.
- Never edit a migration after it has been applied to a shared environment; add the next numbered migration.

## 2. Supabase database and storage

Apply, in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_sponsored_story_calls.sql`
3. `supabase/migrations/003_v03_upgrade_hardening.sql`
4. `supabase/storage-buckets.sql`

Then verify:

- Every bucket is private, including `story-previews` and `story-deliveries`.
- The service role is present only in server-side environment variables.
- A normal sponsor cannot change `profiles.role`, operator workflow fields, payments, consent evidence, calls, chapters, or delivery attestations through PostgREST.
- A sponsor in family A cannot select any room, preview, delivery, invite, contribution, artifact, consent event, or correction from family B.
- A paid delivery disappears from sponsor access after its PaymentIntent is recorded in `payment_revocations`.
- A revoked family-sharing grant immediately removes chapter, preview, and delivery access.
- A do-not-call number cannot enter an outbound launch state.

Create the first staff user through normal signup, confirm the email, then elevate it once from the SQL editor:

```sql
update profiles
set role = 'admin'
where id = '<STAFF_AUTH_USER_UUID>';
```

Do not expose a client-side role editor.

## 3. Supabase Auth

- Set the Site URL to the production app origin, for example `https://app.storysitting.com`.
- Add local, staging, and production `/auth/confirm` URLs to the redirect allowlist.
- Configure the confirmation template to establish the SSR session through the app route:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
```

- Test signup with email confirmation enabled in a private browser.
- Confirm the verified buyer email attaches the already-paid Story Start and that a different email cannot claim it.
- Confirm `/auth/*`, `/permission/*`, `/invite/*`, and Checkout-success routes return `no-store`, `noindex`, and a `no-referrer` policy.

## 4. Server environment

Set these separately for local, preview, and production environments:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_MARKETING_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

RETELL_API_KEY
RETELL_FROM_NUMBER

CONSENT_EVIDENCE_SECRET
CRON_SECRET
STORY_PREVIEW_BUCKET=story-previews
STORY_DELIVERY_BUCKET=story-deliveries
```

Use long, independent random values for `CONSENT_EVIDENCE_SECRET` and `CRON_SECRET`. Never prefix a browser-visible variable with a server secret.

## 5. Stripe test-mode wiring

Register `POST /api/webhooks/stripe` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Verify the endpoint signature secret matches `STRIPE_WEBHOOK_SECRET`. Run duplicate, delayed, out-of-order, refund-before-fulfillment, and two-simultaneous-Checkout tests. Confirm:

- Story Start is exactly $5 USD.
- Finished-result unlock is exactly $79 USD.
- An unpaid Checkout success URL never displays a receipt.
- A refunded/disputed payment cannot be resurrected by replaying an old success URL or webhook.
- A duplicate paid result attempt is automatically flagged and refunded without replacing the settled entitlement.

## 6. Retell staging wiring

- Register `POST /api/webhooks/retell` and verify signed payloads with `RETELL_API_KEY`.
- Configure the authenticated worker/cron route with `CRON_SECRET`; confirm raw events are durably queued before the webhook acknowledges them.
- Include the local `call_request_id` and a unique dispatch nonce in Retell metadata.
- Test started, ended, analyzed, no-answer, voicemail, user-declined, spam, telephony error, out-of-order, duplicate, and unmatched events.
- Confirm raw recordings, transcripts, provider payloads, and operator evidence are never sponsor-readable.
- Confirm pending provider-extracted consent does not release a chapter until a human verifies it.

Do not enable outbound dispatch merely because the webhook works. The provider configuration must prove that audio is not retained before the storyteller's recording permission boundary.

## 7. Exact product smoke test

Run this with Stripe test mode and a controlled phone number:

1. Sponsor submits one Story Start and pays $5.
2. Paid intake provisions one private Story Room and one retrievable Family Pass.
3. Sponsor sends the link and code; storyteller answers it personally.
4. No AI call is queued from that browser response alone.
5. Staff completes the managed human identity check and records evidence in `/staff/permissions`.
6. Only then can the authorized interview enter an outbound launch state.
7. The call discloses the AI interviewer and honors the audited recording boundary.
8. Staff reviews narrow spoken consent candidates in `/staff/consent-releases`.
9. Staff prepares a source-linked chapter and a short private Story Drop.
10. Storyteller reviews the chapter in a completed managed human review call and chooses family/private/withheld.
11. Family release exposes only the preview; private/withheld exposes nothing to the sponsor.
12. Staff runs the one-time package audit in `/staff/deliveries`.
13. Sponsor deliberately pays $79 to unlock the complete result.
14. Recording, transcript, chapter, source map, and the single correction pass are available.
15. A next sitting begins with another $5 Story Start; its result is another optional $79 choice. There is no subscription or automatic call.

Repeat the smoke test with decline, wrong person, could-not-verify, permanent do-not-call, consent revocation, payment refund, and delivery-object-missing outcomes.

## 8. Web and iPhone release checks

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

On macOS:

- Install XcodeGen and generate the project from `ios/project.yml`.
- Run the Swift package tests and the iOS app test plan.
- Replace `MockStorySittingAPI` with the authenticated production API.
- Configure StoreKit products, App Store server verification, app-account tokens, universal links, push entitlements, privacy strings, signing, and associated domains.
- Test unfinished StoreKit transactions, duplicate delivery, cancellation, refund, and transaction IDs above JavaScript's safe-integer limit.

## 9. No-ship gates

Do not accept live payments or place real calls until all of these are demonstrated in staging:

- Postgres migrations execute cleanly and two-tenant RLS tests pass.
- Stripe and StoreKit fulfillment pass sandbox replay/refund tests.
- A production dispatcher rechecks payment, DNC, frozen phone, identity, and current scoped consent in the same launch transaction.
- The Retell event worker and unmatched-event reconciler run independently of the 10-second webhook response.
- The provider/telephony design proves the recording-consent boundary technically, not only in copy.
- Family Pass and operational notifications have a real delivery/outbox provider and retry/dead-letter handling.
- Preview production, source mapping, human QA, storyteller review, export, deletion, and revocation procedures have named operators and audit evidence.
- The iPhone app uses real authenticated APIs and Apple server-side transaction verification rather than the mock backend.
- Counsel has reviewed the actual call scripts, jurisdictions, consent evidence, retention, AI disclosure, refund, privacy, and do-not-call behavior.

Only after those gates pass should DNS, live Stripe keys, real provider numbers, and the redesigned public marketing form be switched on.
