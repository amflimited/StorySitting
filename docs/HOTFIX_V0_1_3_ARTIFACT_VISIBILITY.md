# StorySitting App Hotfix v0.1.3 — Artifact Visibility

## Symptom

A contributor uploads a picture, but staff cannot see it in the staff room view.

## Cause

The upload flow creates an Artifact record and stores the file in a private Supabase Storage bucket, but the staff UI in v0.1.2 did not query or display Artifact records.

## Fix

- `app/staff/story-rooms/[id]/page.tsx` now:
  - queries `artifacts`
  - groups files by contribution
  - creates one-hour signed URLs server-side with the Supabase service role key
  - displays attached files under their contribution
  - adds an Artifact Check section at top of the room
- Added `/debug/artifacts` for staff/admin to inspect recent Artifact records.

## Deploy steps

1. Upload/commit this hotfix to GitHub.
2. Let Vercel redeploy.
3. Open the staff room detail.
4. Confirm Artifact Check shows the uploaded file.
5. Open `/debug/artifacts` if the file still does not appear.

## Important

Uploaded files are private. They should not use public bucket URLs. Staff access should happen through signed URLs.
