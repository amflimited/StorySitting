# StorySitting v0.3

StorySitting is a consent-first family oral-history service built around a simple promise:

> They answer the phone. You keep the story.

An adult child, grandchild, or other trusted person sponsors the process. The storyteller independently decides whether to participate. StorySitting turns each authorized phone conversation into source-faithful audio, transcript, and finished chapters the family can keep.

## Product line

- **$5 Story Start** — permission setup and the first outreach work.
- **Private preview** — included after an authorized sitting; no result purchase is automatic.
- **$39 Voice Edition** — full recording, readable transcript, permission record, and portable downloads.
- **$79 Story Edition** — Voice plus a source-linked finished chapter, complete archive, and one correction round.
- **$149 Heirloom Edition** — Story plus a print-ready family PDF, layout for up to 12 artifacts, and two correction rounds total.
- **Difference-only upgrades** — $40 Voice→Story, $109.99 Voice→Heirloom (Apple's nearest lower tier), or $70 Story→Heirloom.
- **Every next sitting starts with another $5 Story Start** — its own permission process, preview, and deliberate edition choice. There is no subscription or automatic next call.
- **$0 if they decline** — the permission process stops and no result edition is offered.

The sponsor can request contact but cannot authorize AI contact, recording, transcription, editing, or family sharing for the storyteller. The storyteller controls each of those decisions and never needs to install an app.

The canonical product contract is [docs/PRODUCT_V2_SPONSORED_CALL.md](docs/PRODUCT_V2_SPONSORED_CALL.md).

## What is in this repository

- **Public web experience** — a cinematic landing page, proof sample, comparison page, pricing, and $5 Story Start flow.
- **Sponsor web app** — account onboarding, Story Shelf, production timeline, Story Drops, family questions, corrections, invites, and source material.
- **Native iPhone app** — a SwiftUI Story Shelf and sponsor workflow using the same product states and consumable start, edition, and upgrade purchases.
- **Live sponsor account API** — passwordless email-code access, secure browser/mobile sessions, multi-project Story Shelf data, and family-question sync on `storysitting.com`.
- **Production console** — the existing Story Room, contribution, Quo import, Memory Card, Story Map, and Story Capsule machinery remains available to staff.
- **Consent and call foundation** — sponsored intakes, permission evidence, call requests, do-not-call controls, Retell event handling, and payment event handling.

## Product lifecycle

```text
Sponsor pays $5
  → trusted permission path
  → storyteller independently authorizes
  → disclosed, recorded phone sitting
  → Story Drop
  → private finished-result preview
  → sponsor chooses Voice $39 | Story $79 | Heirloom $149 | pass
  → keep only the files and correction rounds included in that edition
  → upgrade later by paying only the difference
  → storyteller-approved family delivery
  → another $5 Story Start only when requested
  → another optional edition choice
```

The launch permission path is a sponsor-sent Family Pass followed by an independent human identity check. Human-first outbound and storyteller-inbound paths remain modeled for a later operational release, but are not offered by the current Story Start form. Every interview must disclose the AI interviewer and reconfirm recording permission. A refusal, uncertainty, stop request, or do-not-call request ends the relevant activity.

## Stack

- Next.js App Router, React, and TypeScript
- Supabase Auth, Postgres, Storage, and row-level security
- Stripe Checkout and verified webhooks
- Retell call events with verified webhook signatures
- SwiftUI, StoreKit 2, and Swift Package tests for iOS
- Apple App Store Server Library verification for transaction JWS and refund notifications
- Vercel for the Next.js app

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in the Supabase, Stripe, and Retell values in `.env.local`. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `RETELL_API_KEY` to browser code.

Apply the database files in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_sponsored_story_calls.sql`
3. `supabase/migrations/003_v03_upgrade_hardening.sql`
4. `supabase/migrations/004_result_editions.sql`
5. `supabase/storage-buckets.sql`

Then configure the Stripe webhook to send checkout events to `/api/webhooks/stripe`, the Retell webhook to durably enqueue call events at `/api/webhooks/retell`, and the authenticated Retell worker with `CRON_SECRET`. See [the deployment checklist](docs/DEPLOYMENT_CHECKLIST.md) for event lists, Supabase Auth templates, RLS tests, and no-ship gates.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The iOS foundation is documented separately in [ios/README.md](ios/README.md). On macOS with Xcode and XcodeGen installed, generate the project from `ios/project.yml`; the pure Swift package and tests can also be exercised with `swift test` from `ios/`.

The production iPhone target uses `ProductionStorySittingAPI`, not the fixture backend. App Store signing assets are kept outside the repository; the registered bundle ID is `com.amflimited.storysitting`, and the signed archive workflow is `.github/workflows/ios-release.yml`.

## Key customer routes

- `/` — product story and public proof
- `/start` — four-step Story Start checkout
- `/start/success` — sponsor handoff after checkout
- `/demo` — interactive Story Shelf preview
- `/signup` and `/login` — sponsor account access
- `/dashboard` — sponsor Story Shelf
- `/story-rooms/[id]` — one story’s status, questions, sources, and family access
- `/invite/[token]` — scoped family contribution link

Staff-only routes remain under `/staff`, including identity verification, consent/release review, and finished-delivery audits. Debug and environment routes must stay protected in production.

## Repository map

```text
app/                 Next.js public, sponsor, API, and staff routes
components/          shared product interface components
docs/                product contract, mission, and build plan
ios/                 native iPhone foundation
lib/                 product states, phone validation, providers, and Supabase clients
marketing-site/      deployable static storysitting.com experience
supabase/             schema migrations and storage configuration
tests/                product, phone, and webhook unit tests
```

## Production rules

- The storyteller—not the payer—controls their voice and unpublished story.
- Do not place an automated or AI-voiced outbound call without the called person’s prior authorization.
- Keep contact, AI interview, recording, transcription, editing, and family sharing as separate permission events.
- Preserve original audio and link edited work back to its source.
- Never clone the storyteller’s voice or use private family material for general-model training without a separate explicit opt-in.
- Do not deploy the redesigned static site until its `/api/start` endpoint and permission operations support the flows shown on the page.
- Do not commit ZIP deployment bundles. Deploy from source.

## Current release boundary

v0.3 now has a live public conversion flow, live passwordless sponsor accounts, the production mobile API, StoreKit server-verification endpoints, consent/payment foundations, and a signed-iOS archive pipeline. The remaining App Store submission gate is creation of the StorySitting app record in App Store Connect (Apple does not expose app-record creation through the API), followed by product creation, review credentials, screenshots from a signed build, and the first TestFlight upload. The call/provider no-ship gates in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) still apply before unattended interviewing.
