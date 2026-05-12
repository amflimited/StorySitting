# StorySitting App Hotfix v0.1.2 — Signup Server Error

## Symptom

The app loads, but submitting `/signup` causes a generic Vercel server error.

## Likely cause

The original signup action attempted to create the `profiles` row using the normal Supabase user client immediately after `auth.signUp`.

If Supabase email confirmation is enabled or the signup request does not establish a usable `auth.uid()` immediately, the `profiles` table RLS policy rejects the insert. Vercel then shows a generic server error.

## Fix

`app/signup/server-actions.ts` now creates the profile row with the server-only Supabase admin client using `SUPABASE_SERVICE_ROLE_KEY`.

## Added route

`/debug/profile-check`

After signup/login, this route confirms the current user's profile row.

## Deploy steps

1. Upload/commit this hotfix to GitHub.
2. Let Vercel redeploy.
3. Open `/env-check`.
4. Confirm all values are present.
5. Try `/signup` again.

## If it still fails

Open Vercel -> Project -> Logs / Runtime Logs and search the error ID. The exact server-side error will be visible there.
