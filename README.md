# StorySitting App MVP Foundation v0.1

This is the first real production-app build package for StorySitting.

It is not another public website redesign.

It is the minimum custom app foundation for:

- private Story Rooms
- contributor invites
- normalized Contributions
- private file-backed Artifacts
- staff review queue
- manual Quo import
- Memory Cards
- Story Maps
- Story Capsule records
- partner attribution groundwork

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

## First build target

app.storysitting.com

## First functional gate

Owner signs up
→ creates Story Room
→ invite token is generated
→ contributor opens invite
→ contributor submits memory/file/audio
→ staff sees submission in review queue

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
5. Add yourself as a staff profile in `profiles`.

## Run

```bash
npm run dev
```

## Key routes

- `/` — app landing / dashboard redirect
- `/login` — login
- `/signup` — signup
- `/dashboard` — owner dashboard
- `/story-rooms/new` — create Story Room
- `/story-rooms/[id]` — Story Room detail
- `/invite/[token]` — contributor invite submission
- `/staff` — staff console
- `/staff/import-quo` — manual Quo import
- `/staff/story-rooms/[id]` — staff room detail
