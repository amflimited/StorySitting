-- StorySitting v0.3 upgrade hardening
--
-- Run this after 002. It is intentionally safe on a fresh 001 -> 002 install,
-- and repairs the most dangerous shapes left by any earlier draft of 002.
-- The archive is staff-only and preserves removed sensitive draft columns for
-- a deliberate operator migration instead of exposing them through PostgREST.

create table if not exists migration_sensitive_payload_archive (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  payload jsonb not null,
  migration_label text not null,
  archived_at timestamptz not null default now(),
  unique (source_table, source_id, migration_label)
);
alter table migration_sensitive_payload_archive enable row level security;
drop policy if exists "migration_sensitive_payload_archive_staff_select" on migration_sensitive_payload_archive;
create policy "migration_sensitive_payload_archive_staff_select"
  on migration_sensitive_payload_archive for select using (is_staff());

insert into migration_sensitive_payload_archive (
  source_table, source_id, payload, migration_label
)
select
  'call_requests', cr.id,
  jsonb_strip_nulls(jsonb_build_object(
    'transcript', to_jsonb(cr) -> 'transcript',
    'recording_url', to_jsonb(cr) -> 'recording_url',
    'provider_payload', to_jsonb(cr) -> 'provider_payload'
  )),
  'pre_v03_sensitive_split'
from call_requests cr
where to_jsonb(cr) ?| array['transcript', 'recording_url', 'provider_payload']
on conflict (source_table, source_id, migration_label) do nothing;

insert into migration_sensitive_payload_archive (
  source_table, source_id, payload, migration_label
)
select
  'story_chapters', sc.id,
  jsonb_strip_nulls(jsonb_build_object(
    'body', to_jsonb(sc) -> 'body',
    'source_map', to_jsonb(sc) -> 'source_map',
    'audio_preview_url', to_jsonb(sc) -> 'audio_preview_url'
  )),
  'pre_v03_sensitive_split'
from story_chapters sc
where to_jsonb(sc) ?| array['body', 'source_map', 'audio_preview_url']
on conflict (source_table, source_id, migration_label) do nothing;

alter table call_requests drop column if exists transcript;
alter table call_requests drop column if exists recording_url;
alter table call_requests drop column if exists provider_payload;
alter table story_chapters drop column if exists body;
alter table story_chapters drop column if exists source_map;
alter table story_chapters drop column if exists audio_preview_url;

alter table consent_events add column if not exists story_chapter_id uuid
  references story_chapters(id) on delete set null;
drop index if exists idx_consent_events_call_scope_unique;
create unique index idx_consent_events_call_scope_unique
  on consent_events(call_request_id, consent_scope)
  where call_request_id is not null and story_chapter_id is null;
create unique index if not exists idx_consent_events_call_scope_chapter_unique
  on consent_events(call_request_id, consent_scope, story_chapter_id)
  where call_request_id is not null and story_chapter_id is not null;

alter table call_requests drop constraint if exists call_requests_permission_request_id_key;
alter table call_requests drop constraint if exists call_requests_call_kind_check;
alter table call_requests drop constraint if exists call_requests_kind_direction_check;
alter table call_requests add constraint call_requests_call_kind_check
  check (call_kind in (
    'human_permission', 'inbound_permission', 'interview',
    'clarification', 'follow_up', 'story_review'
  ));
alter table call_requests add constraint call_requests_kind_direction_check check (
  (call_kind = 'human_permission' and direction = 'outbound')
  or (call_kind = 'inbound_permission' and direction = 'inbound')
  or (call_kind in ('interview', 'clarification', 'follow_up') and direction = 'outbound')
  or call_kind = 'story_review'
);

drop index if exists idx_call_requests_permission_kind_unique;
create unique index idx_call_requests_permission_kind_unique
  on call_requests(permission_request_id, call_kind, attempt_number);

do $$
begin
  if exists (
    select 1 from orders
    where stripe_payment_intent_id is not null
    group by stripe_payment_intent_id having count(*) > 1
  ) then
    raise exception 'duplicate Stripe payment intents must be reconciled before v0.3';
  end if;
  if exists (
    select 1 from orders
    where storekit_transaction_id is not null
    group by storekit_transaction_id having count(*) > 1
  ) then
    raise exception 'duplicate StoreKit transactions must be reconciled before v0.3';
  end if;
  if exists (
    select 1 from story_corrections
    where requested_by_user_id is not null
    group by story_chapter_id having count(*) > 1
  ) then
    raise exception 'multiple sponsor correction passes must be reconciled before v0.3';
  end if;
end;
$$;

create unique index if not exists idx_orders_stripe_payment_intent_unique
  on orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists idx_orders_storekit_transaction_unique
  on orders(storekit_transaction_id)
  where storekit_transaction_id is not null;
create unique index if not exists idx_story_corrections_one_family_pass
  on story_corrections(story_chapter_id)
  where requested_by_user_id is not null;

revoke all on migration_sensitive_payload_archive from anon;
grant select on migration_sensitive_payload_archive to authenticated;
