# StorySitting App MVP

This is the production app for StorySitting.

It is not the public marketing site. It is the private operating system for:

- Family Story Rooms
- contributor invites
- written memories
- photo/file/audio artifacts
- staff review
- manual Quo imports
- Memory Cards
- Story Maps
- Story Capsule delivery records
- partner/order/referral groundwork

## Locked product engine

Family Story Room
→ Contribution Records
→ Staff Review
→ Memory Cards
→ Story Map
→ Signature Session
→ Story Capsule

## Stack

- Next.js App Router
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase RLS
- Vercel

## Current version

v0.2 — Production Console Cleanup

## Functional gates proven

- Owner signup/login
- Admin/staff access
- Story Room creation
- Contributor invite creation
- Contributor written submission
- Contributor photo/file upload
- Private Artifact record visibility
- Staff review queue
- Manual Quo import
- Memory Card creation
- Story Map creation

## v0.2 additions

- Staff dashboard summary cards
- Contribution review filters
- Story Room production status controls
- Image previews for uploaded artifacts
- Audio player previews for uploaded artifacts
- Private signed URL access for uploaded files
- Richer Story Map fields:
  - story focus
  - themes
  - open questions
  - interview plan
  - recommended output
- Story Capsule delivery placeholder records

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in Supabase values.

## Supabase setup

1. Create Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/storage-buckets.sql`.
4. Confirm RLS is enabled.
5. Add yourself as a staff/admin profile in `profiles`.

## Run

```bash
npm run dev
```

## Key routes

- `/` — app landing
- `/login` — login
- `/signup` — signup
- `/dashboard` — owner dashboard
- `/story-rooms/new` — create Story Room
- `/story-rooms/[id]` — Story Room detail
- `/invite/[token]` — contributor invite submission
- `/staff` — staff console
- `/staff/import-quo` — manual Quo import
- `/staff/story-rooms/[id]` — staff production room
- `/debug/profile-check` — authenticated profile check
- `/debug/artifacts` — staff artifact debug

## Development rule

Do not commit ZIP upload packages to this repository. Code changes should be committed directly or made through pull requests. Vercel should deploy from source files, not extracted ZIP artifacts.

## Next gate

Run a complete mock production room:

1. Add written memory.
2. Add photo artifact.
3. Add Quo transcript.
4. Create three Memory Cards.
5. Create Story Map with interview plan.
6. Create Story Capsule placeholder.
7. Move production status to `ready_for_interview` or `capsule_production`.
