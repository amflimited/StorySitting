# Deployment Checklist

## Supabase

- Create project.
- Copy project URL and anon key into `.env.local`.
- Copy service role key into `.env.local`.
- Run `supabase/migrations/001_initial_schema.sql`.
- Run `supabase/storage-buckets.sql`.
- Create first user through signup.
- Manually update that user profile role to `staff` or `admin` for Adam.

```sql
update profiles
set role = 'admin'
where id = '<ADAM_USER_UUID>';
```

## Vercel

- Import GitHub repo.
- Add environment variables:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - NEXT_PUBLIC_APP_URL=https://app.storysitting.com
- Deploy.
- Connect DNS for app.storysitting.com.

## First live test

- Adam signs up.
- Adam creates Story Room.
- Adam creates invite.
- Open invite in private browser.
- Submit memory.
- Upload small image/audio file.
- Confirm staff queue shows contribution.
- Create Memory Card.
- Create Story Map.
