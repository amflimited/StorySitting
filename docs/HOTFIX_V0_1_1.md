# StorySitting App Hotfix v0.1.1

## What this fixes

The original middleware could crash the entire deployment if Vercel environment variables were missing.

Symptom:

500 INTERNAL_SERVER_ERROR
Code: MIDDLEWARE_INVOCATION_FAILED

## Changes

- `middleware.ts` now safely skips Supabase session refresh when Supabase env variables are missing.
- Added `/env-check` route to verify whether required Vercel environment variables are present without exposing their values.

## Required Vercel env variables

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_URL

## After deploying

Open:

/env-check

Every value should show `present`.

If any shows `missing`, add it in Vercel Project Settings -> Environment Variables, then redeploy.
