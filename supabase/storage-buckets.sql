-- Create private Supabase Storage buckets.
-- Run in Supabase SQL editor after storage schema exists.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('story-room-photos', 'story-room-photos', false, 52428800),
  ('story-room-audio', 'story-room-audio', false, 52428800),
  ('story-room-documents', 'story-room-documents', false, 52428800),
  ('story-room-pdfs', 'story-room-pdfs', false, 52428800),
  ('quo-imports', 'quo-imports', false, 52428800),
  ('story-previews', 'story-previews', false, 10485760),
  ('story-deliveries', 'story-deliveries', false, 104857600)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;
