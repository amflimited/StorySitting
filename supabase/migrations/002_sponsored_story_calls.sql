-- StorySitting sponsored phone-call product model v2
-- This migration adds the $5 permission/call -> preview -> optional $79 result loop
-- without deleting the existing Story Room production records.

create table if not exists sponsor_intakes (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  relationship text not null,
  storyteller_name text not null,
  storyteller_phone text not null,
  storyteller_timezone text,
  best_times text not null,
  story_seeds text[] not null default '{}',
  personal_introduction text,
  permission_path text not null default 'family_pass'
    check (permission_path in ('family_pass', 'human_hello', 'call_us')),
  sponsor_contact_authorized_at timestamptz not null,
  status text not null default 'awaiting_checkout'
    check (status in (
      'awaiting_checkout', 'start_paid', 'permission_pending', 'permission_granted',
      'permission_declined', 'interview_scheduled', 'interview_complete',
      'interview_needs_review', 'story_in_production', 'story_ready', 'closed'
    )),
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_payment_method_id text,
  idempotency_key text unique,
  story_room_id uuid references story_rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A paid intake provisions exactly one private Story Room, even when the buyer
-- creates their account after Checkout returns.
alter table story_rooms add column if not exists sponsor_intake_id uuid
  references sponsor_intakes(id) on delete set null;

create table if not exists call_requests (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  sponsor_intake_id uuid references sponsor_intakes(id) on delete set null,
  call_kind text not null check (call_kind in ('human_permission', 'inbound_permission', 'interview', 'clarification', 'follow_up', 'story_review')),
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'dialing', 'connected', 'completed', 'no_answer', 'declined', 'failed', 'cancelled', 'needs_human_review')),
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  attempt_number integer not null default 1 check (attempt_number > 0),
  retell_call_id text unique,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  constraint call_requests_kind_direction_check check (
    (call_kind = 'human_permission' and direction = 'outbound')
    or (call_kind = 'inbound_permission' and direction = 'inbound')
    or (call_kind in ('interview', 'clarification', 'follow_up') and direction = 'outbound')
    or (call_kind = 'story_review')
  ),
  from_number text,
  to_number text,
  duration_seconds integer,
  disconnection_reason text,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Raw provider payloads, recordings, and transcripts never sit in a sponsor-readable row.
-- Staff turns approved excerpts into a Story Drop; paid delivery is handled separately below.
create table if not exists call_artifacts (
  call_request_id uuid primary key references call_requests(id) on delete cascade,
  transcript text,
  recording_url text,
  provider_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consent_events (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  sponsor_intake_id uuid references sponsor_intakes(id) on delete set null,
  call_request_id uuid references call_requests(id) on delete set null,
  storyteller_name text not null,
  consent_scope text not null
    check (consent_scope in ('contact', 'ai_interview', 'recording', 'transcription', 'editing', 'family_sharing', 'public_use', 'model_training')),
  decision text not null check (decision in ('granted', 'declined', 'revoked')),
  capture_method text not null check (capture_method in ('family_pass', 'web', 'inbound_phone', 'human_phone', 'spoken_on_call', 'written')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  evidence jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Verification notes, network fingerprints, provider references, and staff IDs
-- are intentionally separated from the sponsor-readable consent ledger.
create table if not exists consent_event_evidence (
  consent_event_id uuid primary key references consent_events(id) on delete cascade,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists consent_verifications (
  id uuid primary key default gen_random_uuid(),
  consent_event_id uuid not null references consent_events(id) on delete cascade,
  verification_status text not null check (verification_status in ('verified', 'rejected')),
  operator_notes text not null,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now()
);

-- Public permission pages use an unguessable token. The short family code is a
-- second trust cue shared by the sponsor, not a substitute for the token.
create table if not exists storyteller_permission_requests (
  id uuid primary key default gen_random_uuid(),
  sponsor_intake_id uuid not null unique references sponsor_intakes(id) on delete cascade,
  story_room_id uuid not null references story_rooms(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  family_code text not null default lpad((floor(random() * 10000)::integer)::text, 4, '0'),
  permission_path text not null
    check (permission_path in ('family_pass', 'human_hello', 'call_us')),
  status text not null default 'pending'
    check (status in ('pending', 'identity_pending', 'granted', 'declined', 'revoked', 'expired')),
  authorization_consent_event_id uuid references consent_events(id) on delete set null,
  responded_at timestamptz,
  identity_verified_at timestamptz,
  disposition_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Failed Family Pass code attempts are written before the permission RPC runs,
-- so a bad code cannot be brute-forced without leaving a durable throttle trail.
create table if not exists permission_response_attempts (
  id uuid primary key default gen_random_uuid(),
  permission_request_id uuid references storyteller_permission_requests(id) on delete cascade,
  token_fingerprint text not null,
  network_fingerprint text,
  successful boolean not null default false,
  attempted_at timestamptz not null default now()
);

create table if not exists story_start_request_attempts (
  id uuid primary key default gen_random_uuid(),
  network_fingerprint text not null,
  email_fingerprint text not null,
  attempted_at timestamptz not null default now()
);

create or replace function claim_permission_response_attempt(
  p_permission_request_id uuid,
  p_token_fingerprint text,
  p_network_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_lock bigint := hashtextextended('permission:' || p_permission_request_id::text, 0);
  network_lock bigint := hashtextextended('network:' || coalesce(p_network_fingerprint, ''), 0);
  attempt_id uuid;
begin
  perform pg_advisory_xact_lock(least(request_lock, network_lock));
  perform pg_advisory_xact_lock(greatest(request_lock, network_lock));
  if (
    select count(*) >= 5 from permission_response_attempts attempt
    where (
      attempt.permission_request_id = p_permission_request_id
      or attempt.network_fingerprint = p_network_fingerprint
    ) and attempt.attempted_at >= now() - interval '15 minutes'
  ) then
    return null;
  end if;
  insert into permission_response_attempts (
    permission_request_id, token_fingerprint, network_fingerprint, successful
  ) values (
    p_permission_request_id, p_token_fingerprint, p_network_fingerprint, false
  ) returning id into attempt_id;
  return attempt_id;
end;
$$;
revoke all on function claim_permission_response_attempt(uuid, text, text)
  from public, anon, authenticated;
grant execute on function claim_permission_response_attempt(uuid, text, text)
  to service_role;

create or replace function claim_story_start_request(
  p_network_fingerprint text,
  p_email_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  network_lock bigint := hashtextextended('network:' || p_network_fingerprint, 0);
  email_lock bigint := hashtextextended('email:' || p_email_fingerprint, 0);
begin
  perform pg_advisory_xact_lock(least(network_lock, email_lock));
  perform pg_advisory_xact_lock(greatest(network_lock, email_lock));
  if (select count(*) >= 8 from story_start_request_attempts
      where network_fingerprint = p_network_fingerprint
        and attempted_at >= now() - interval '1 hour')
     or (select count(*) >= 4 from story_start_request_attempts
      where email_fingerprint = p_email_fingerprint
        and attempted_at >= now() - interval '1 hour') then
    return false;
  end if;
  insert into story_start_request_attempts (network_fingerprint, email_fingerprint)
  values (p_network_fingerprint, p_email_fingerprint);
  return true;
end;
$$;
revoke all on function claim_story_start_request(text, text)
  from public, anon, authenticated;
grant execute on function claim_story_start_request(text, text)
  to service_role;

create table if not exists permission_dispositions (
  id uuid primary key default gen_random_uuid(),
  permission_request_id uuid not null references storyteller_permission_requests(id) on delete cascade,
  human_call_request_id uuid not null references call_requests(id) on delete restrict,
  disposition text not null check (disposition in ('declined', 'wrong_person', 'could_not_verify')),
  operator_notes text not null,
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create table if not exists do_not_call_entries (
  id uuid primary key default gen_random_uuid(),
  storyteller_phone text not null unique,
  reason text,
  source text not null default 'storyteller_request',
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function is_phone_do_not_call(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from do_not_call_entries dnc
    where regexp_replace(dnc.storyteller_phone, '[^0-9]', '', 'g') =
          regexp_replace(p_phone, '[^0-9]', '', 'g')
  );
$$;
revoke all on function is_phone_do_not_call(text) from public, anon, authenticated;
grant execute on function is_phone_do_not_call(text) to service_role;

alter table call_requests add column if not exists pre_call_authorization_event_id uuid
  references consent_events(id) on delete restrict;
alter table call_requests add column if not exists permission_request_id uuid
  references storyteller_permission_requests(id) on delete set null;

-- An AI outbound interview cannot move onto the calendar or telephone network
-- on a sponsor's say-so. It must reference a separately verified storyteller grant.
create or replace function enforce_storyteller_pre_call_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  authorization consent_events%rowtype;
  effective_authorization consent_events%rowtype;
  effective_contact consent_events%rowtype;
begin
  if new.direction = 'outbound'
     and new.status in ('scheduled', 'dialing', 'connected')
     and (
       new.sponsor_intake_id is null or not exists (
         select 1
         from sponsor_intakes paid_intake
         join orders paid_order
           on paid_order.sponsor_intake_id = paid_intake.id
          and paid_order.order_type = 'story_start'
          and paid_order.status = 'paid'
         where paid_intake.id = new.sponsor_intake_id
           and paid_intake.status not in ('awaiting_checkout', 'permission_declined', 'closed')
           and not exists (
             select 1 from payment_revocations revoked_payment
             where revoked_payment.stripe_payment_intent_id = paid_order.stripe_payment_intent_id
           )
       )
     ) then
    raise exception 'an active paid Story Start is required before outbound contact';
  end if;

  if new.direction = 'outbound'
     and new.status in ('scheduled', 'dialing', 'connected')
     and (
       new.to_number is null or exists (
         select 1 from do_not_call_entries dnc
         where regexp_replace(dnc.storyteller_phone, '[^0-9]', '', 'g') =
               regexp_replace(new.to_number, '[^0-9]', '', 'g')
       )
     ) then
    raise exception 'storyteller number is unavailable for outbound contact';
  end if;

  if new.call_kind in ('interview', 'clarification', 'follow_up')
     and new.direction = 'outbound'
     and new.status in ('scheduled', 'dialing', 'connected') then
    if new.pre_call_authorization_event_id is null then
      raise exception 'verified storyteller authorization is required before an AI outbound interview';
    end if;

    select * into authorization
    from consent_events
    where id = new.pre_call_authorization_event_id;

    if authorization.id is null
       or authorization.story_room_id is distinct from new.story_room_id
       or authorization.consent_scope <> 'ai_interview'
       or authorization.decision <> 'granted'
       or authorization.verification_status <> 'verified'
       or authorization.capture_method = 'spoken_on_call'
       or (authorization.expires_at is not null and authorization.expires_at <= now()) then
      raise exception 'AI outbound interview authorization is missing, invalid, or expired';
    end if;

    select * into effective_authorization
    from consent_events
    where story_room_id = new.story_room_id
      and consent_scope = 'ai_interview'
      and verification_status = 'verified'
    order by occurred_at desc, created_at desc
    limit 1;

    if effective_authorization.id is null
       or effective_authorization.decision <> 'granted'
       or effective_authorization.id <> authorization.id then
      raise exception 'storyteller authorization was superseded, declined, or revoked';
    end if;

    select * into effective_contact
    from consent_events
    where story_room_id = new.story_room_id
      and consent_scope = 'contact'
      and verification_status = 'verified'
    order by occurred_at desc, created_at desc
    limit 1;

    if effective_contact.id is null
       or effective_contact.decision <> 'granted'
       or (effective_contact.expires_at is not null and effective_contact.expires_at <= now()) then
      raise exception 'current verified contact permission is required';
    end if;

    if new.sponsor_intake_id is null or not exists (
      select 1
      from storyteller_permission_requests request
      join sponsor_intakes intake on intake.id = request.sponsor_intake_id
      where request.sponsor_intake_id = new.sponsor_intake_id
        and request.story_room_id = new.story_room_id
        and request.id = new.permission_request_id
        and request.status = 'granted'
        and request.authorization_consent_event_id = authorization.id
        and request.expires_at > now()
        and regexp_replace(intake.storyteller_phone, '[^0-9]', '', 'g') =
            regexp_replace(new.to_number, '[^0-9]', '', 'g')
    ) then
      raise exception 'the permission handshake is not active';
    end if;
  end if;

  if new.call_kind = 'human_permission'
     and new.direction = 'outbound'
     and new.status in ('scheduled', 'dialing', 'connected')
     and not exists (
       select 1 from storyteller_permission_requests request
       where request.id = new.permission_request_id
         and request.story_room_id = new.story_room_id
         and request.sponsor_intake_id = new.sponsor_intake_id
         and request.status = 'identity_pending'
         and request.expires_at > now()
     ) then
    raise exception 'human permission call is not active';
  end if;
  return new;
end;
$$;

revoke all on function enforce_storyteller_pre_call_authorization()
  from public, anon, authenticated;

drop trigger if exists require_storyteller_pre_call_authorization on call_requests;
create trigger require_storyteller_pre_call_authorization
before insert or update on call_requests
for each row execute function enforce_storyteller_pre_call_authorization();

create table if not exists family_questions (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  sponsor_intake_id uuid references sponsor_intakes(id) on delete set null,
  source_sequence integer,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  submitted_by_name text,
  question text not null,
  context_note text,
  source text not null default 'sponsor' check (source in ('sponsor', 'contributor', 'story_thread', 'staff')),
  status text not null default 'queued' check (status in ('queued', 'selected', 'asked', 'answered', 'held', 'archived')),
  answered_in_call_request_id uuid references call_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sponsor_intake_id, source_sequence)
);

create table if not exists story_chapters (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  call_request_id uuid references call_requests(id) on delete set null,
  title text not null,
  slug text,
  preview_excerpt text,
  people text[] not null default '{}',
  places text[] not null default '{}',
  eras text[] not null default '{}',
  open_threads text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'human_review', 'storyteller_review', 'sponsor_preview', 'approved', 'delivered', 'withheld')),
  storyteller_share_decision text not null default 'pending'
    check (storyteller_share_decision in ('pending', 'family', 'private', 'withheld')),
  approved_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_room_id, slug)
);

alter table consent_events add column if not exists story_chapter_id uuid
  references story_chapters(id) on delete set null;

-- A short sponsor-readable clip is its own asset. The full call remains in
-- call_artifacts and is never used as the preview URL.
create table if not exists story_drop_previews (
  id uuid primary key default gen_random_uuid(),
  story_chapter_id uuid not null unique references story_chapters(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  duration_seconds integer not null check (duration_seconds between 1 and 120),
  transcript_excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists story_corrections (
  id uuid primary key default gen_random_uuid(),
  story_chapter_id uuid not null references story_chapters(id) on delete cascade,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_name text,
  correction_type text not null default 'fact' check (correction_type in ('fact', 'name', 'date', 'privacy', 'tone', 'other')),
  request text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'completed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table orders add column if not exists sponsor_intake_id uuid references sponsor_intakes(id) on delete set null;
alter table orders add column if not exists order_type text;
alter table orders add column if not exists stripe_payment_intent_id text;
alter table orders add column if not exists storekit_transaction_id text;
alter table orders add column if not exists story_chapter_id uuid references story_chapters(id) on delete set null;
alter table orders add column if not exists refunded_at timestamptz;

create table if not exists payment_revocations (
  stripe_payment_intent_id text primary key,
  provider_event_id text not null,
  status text not null check (status in ('refunded', 'disputed')),
  occurred_at timestamptz not null default now()
);

create or replace function claim_story_start_payment(
  p_sponsor_intake_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  intake_record sponsor_intakes%rowtype;
  order_record orders%rowtype;
begin
  if p_stripe_checkout_session_id is null
     or p_stripe_payment_intent_id is null
     or p_amount_cents <> 500
     or lower(coalesce(p_currency, '')) <> 'usd' then
    raise exception 'Story Start payment does not match the product contract';
  end if;

  -- Refund/dispute and fulfillment take the same lock even when no revocation
  -- row exists yet, closing the "both checked first" race.
  perform pg_advisory_xact_lock(hashtextextended(p_stripe_payment_intent_id, 0));

  select * into intake_record from sponsor_intakes
  where id = p_sponsor_intake_id for update;
  if intake_record.id is null
     or intake_record.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id then
    raise exception 'Story Start intake does not match this Checkout Session';
  end if;

  select * into order_record from orders
  where sponsor_intake_id = intake_record.id and order_type = 'story_start'
  for update;
  if order_record.id is not null and order_record.status in ('refunded', 'disputed') then
    update sponsor_intakes set status = 'closed', updated_at = now()
      where id = intake_record.id and status <> 'closed';
    update storyteller_permission_requests set status = 'revoked', disposition_at = now(), updated_at = now()
      where sponsor_intake_id = intake_record.id and status in ('pending', 'identity_pending', 'granted');
    update call_requests set status = 'cancelled', outcome = 'payment_revoked', updated_at = now()
      where sponsor_intake_id = intake_record.id and status in ('queued', 'scheduled');
    update story_rooms set production_status = 'closed'
      where sponsor_intake_id = intake_record.id;
    return order_record.status;
  end if;
  if exists (
    select 1 from payment_revocations
    where stripe_payment_intent_id = p_stripe_payment_intent_id
  ) then
    update sponsor_intakes set status = 'closed', updated_at = now()
      where id = intake_record.id and status <> 'closed';
    update storyteller_permission_requests set status = 'revoked', disposition_at = now(), updated_at = now()
      where sponsor_intake_id = intake_record.id and status in ('pending', 'identity_pending', 'granted');
    update call_requests set status = 'cancelled', outcome = 'payment_revoked', updated_at = now()
      where sponsor_intake_id = intake_record.id and status in ('queued', 'scheduled');
    update story_rooms set production_status = 'closed'
      where sponsor_intake_id = intake_record.id;
    return 'revoked';
  end if;

  if order_record.id is null then
    insert into orders (
      sponsor_intake_id, package_tier, order_type,
      stripe_checkout_session_id, stripe_payment_intent_id,
      amount_cents, currency, status
    ) values (
      intake_record.id, 'focused', 'story_start',
      p_stripe_checkout_session_id, p_stripe_payment_intent_id,
      p_amount_cents, lower(p_currency), 'paid'
    );
  else
    update orders
    set stripe_checkout_session_id = p_stripe_checkout_session_id,
        stripe_payment_intent_id = p_stripe_payment_intent_id,
        amount_cents = p_amount_cents,
        currency = lower(p_currency),
        status = 'paid', refunded_at = null
    where id = order_record.id;
  end if;
  return 'paid';
end;
$$;
revoke all on function claim_story_start_payment(uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function claim_story_start_payment(uuid, text, text, integer, text)
  to service_role;

-- The full result is separate from the sponsor-visible preview. RLS unlocks this row
-- only after a paid finished_result order, while staff can edit it before purchase.
create table if not exists story_chapter_deliveries (
  story_chapter_id uuid primary key references story_chapters(id) on delete cascade,
  body text not null default '',
  source_map jsonb not null default '[]',
  delivered_assets jsonb not null default '{}',
  verified_manifest_sha256 text,
  verified_at timestamptz,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'storekit')),
  provider_event_id text not null,
  event_type text not null,
  sponsor_intake_id uuid references sponsor_intakes(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  amount_cents integer,
  currency text default 'usd',
  payload jsonb not null default '{}',
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed')),
  last_error text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

alter table import_events add column if not exists processing_started_at timestamptz;
alter table import_events add column if not exists last_error text;

create or replace function claim_import_event(
  p_source text,
  p_event_type text,
  p_external_event_id text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
  current_status text;
begin
  insert into import_events (source, event_type, external_event_id, status, payload)
  values (p_source, p_event_type, p_external_event_id, 'received', p_payload)
  on conflict (source, external_event_id) do nothing;

  update import_events
  set status = 'processing', processing_started_at = now(), last_error = null, payload = p_payload
  where source = p_source
    and external_event_id = p_external_event_id
    and (
      status in ('received', 'failed', 'needs_matching')
      or (status = 'processing' and processing_started_at < now() - interval '2 minutes')
    )
  returning id into claimed_id;

  if claimed_id is not null then return 'claimed'; end if;
  select status into current_status from import_events
  where source = p_source and external_event_id = p_external_event_id;
  return coalesce(current_status, 'unavailable');
end;
$$;
revoke all on function claim_import_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function claim_import_event(text, text, text, jsonb) to service_role;

create or replace function claim_payment_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_sponsor_intake_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
  current_status text;
begin
  insert into payment_events (
    provider, provider_event_id, event_type, sponsor_intake_id,
    amount_cents, currency, payload, processing_status
  ) values (
    p_provider, p_provider_event_id, p_event_type, p_sponsor_intake_id,
    p_amount_cents, p_currency, p_payload, 'received'
  ) on conflict (provider, provider_event_id) do nothing;

  update payment_events
  set processing_status = 'processing', processing_started_at = now(),
      last_error = null, payload = p_payload
  where provider = p_provider
    and provider_event_id = p_provider_event_id
    and (
      processing_status in ('received', 'failed')
      or (processing_status = 'processing' and processing_started_at < now() - interval '2 minutes')
    )
  returning id into claimed_id;

  if claimed_id is not null then return 'claimed'; end if;
  select processing_status into current_status from payment_events
  where provider = p_provider and provider_event_id = p_provider_event_id;
  return coalesce(current_status, 'unavailable');
end;
$$;
revoke all on function claim_payment_event(text, text, text, uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function claim_payment_event(text, text, text, uuid, integer, text, jsonb)
  to service_role;

create or replace function merge_call_artifact(
  p_call_request_id uuid,
  p_transcript text,
  p_recording_url text,
  p_provider_payload jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into call_artifacts (
    call_request_id, transcript, recording_url, provider_payload, updated_at
  ) values (
    p_call_request_id, p_transcript, p_recording_url,
    coalesce(p_provider_payload, '{}'), now()
  )
  on conflict (call_request_id) do update
  set transcript = coalesce(excluded.transcript, call_artifacts.transcript),
      recording_url = coalesce(excluded.recording_url, call_artifacts.recording_url),
      provider_payload = call_artifacts.provider_payload || excluded.provider_payload,
      updated_at = now();
$$;
revoke all on function merge_call_artifact(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function merge_call_artifact(uuid, text, text, jsonb) to service_role;

-- Checkout sessions are immutable attempts. The canonical order remains one row
-- per finished chapter, while expired/retried Stripe sessions retain their identity.
create table if not exists result_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  story_chapter_id uuid not null references story_chapters(id) on delete cascade,
  stripe_checkout_session_id text unique,
  status text not null default 'creating'
    check (status in ('creating', 'open', 'paid', 'expired', 'failed', 'refund_required', 'refunded')),
  active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serialize final-result payments per chapter. Stripe may deliver two paid
-- Checkout Sessions concurrently; only the first settled attempt can become
-- the entitlement, and every later paid attempt is durably marked for refund.
create or replace function claim_finished_result_payment(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_delivery_ready boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record result_checkout_attempts%rowtype;
  order_record orders%rowtype;
  occurred timestamptz := now();
begin
  if p_stripe_checkout_session_id is null
     or p_stripe_payment_intent_id is null
     or p_amount_cents <> 7900
     or lower(coalesce(p_currency, '')) <> 'usd' then
    raise exception 'finished result payment does not match the product contract';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_payment_intent_id, 0));

  select * into attempt_record
  from result_checkout_attempts
  where id = p_attempt_id
    and stripe_checkout_session_id = p_stripe_checkout_session_id
  for update;
  if attempt_record.id is null then
    raise exception 'checkout attempt is missing or does not match the Stripe session';
  end if;

  select * into order_record
  from orders
  where id = attempt_record.order_id
    and story_chapter_id = attempt_record.story_chapter_id
    and order_type = 'finished_result'
  for update;
  if order_record.id is null then
    raise exception 'canonical finished result order is missing';
  end if;

  if exists (
    select 1 from payment_revocations
    where stripe_payment_intent_id = p_stripe_payment_intent_id
  ) then
    update result_checkout_attempts
    set status = 'refund_required', active = false,
        last_error = 'payment was refunded or disputed before fulfillment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  if attempt_record.status = 'refunded' then
    return 'refund_required';
  elsif attempt_record.status = 'refund_required' then
    return 'refund_required';
  elsif attempt_record.status = 'paid' then
    if order_record.status = 'paid'
       and order_record.stripe_checkout_session_id = p_stripe_checkout_session_id then
      return 'delivered';
    end if;
    raise exception 'paid checkout attempt is inconsistent with its entitlement';
  end if;

  if order_record.status = 'paid' then
    if order_record.stripe_checkout_session_id = p_stripe_checkout_session_id then
      update result_checkout_attempts
      set status = 'paid', active = false, last_error = null, updated_at = occurred
      where id = attempt_record.id;
      return 'delivered';
    end if;

    update result_checkout_attempts
    set status = 'refund_required', active = false,
        last_error = 'duplicate settled payment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  if not p_delivery_ready then
    update result_checkout_attempts
    set status = 'refund_required', active = false,
        last_error = 'delivery package unavailable at fulfillment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  update orders
  set stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      amount_cents = p_amount_cents,
      currency = lower(p_currency),
      status = 'paid',
      refunded_at = null
  where id = order_record.id;

  update result_checkout_attempts
  set status = 'paid', active = false, last_error = null, updated_at = occurred
  where id = attempt_record.id;

  update result_checkout_attempts
  set status = case when status in ('creating', 'open') then 'expired' else status end,
      active = false,
      updated_at = occurred
  where story_chapter_id = attempt_record.story_chapter_id
    and id <> attempt_record.id
    and active;

  return 'delivered';
end;
$$;

revoke all on function claim_finished_result_payment(uuid, text, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function claim_finished_result_payment(uuid, text, text, integer, text, boolean)
  to service_role;

-- Refunds and disputes use the same payment-intent lock as fulfillment and
-- revoke every downstream capability in the same database transaction.
create or replace function revoke_stripe_payment(
  p_stripe_payment_intent_id text,
  p_provider_event_id text,
  p_status text
)
returns table(sponsor_intake_id uuid, order_type text, story_room_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stripe_payment_intent_id is null or p_status not in ('refunded', 'disputed') then
    raise exception 'invalid Stripe payment revocation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_payment_intent_id, 0));

  insert into payment_revocations (
    stripe_payment_intent_id, provider_event_id, status, occurred_at
  ) values (
    p_stripe_payment_intent_id, p_provider_event_id, p_status, now()
  ) on conflict (stripe_payment_intent_id) do update
    set provider_event_id = excluded.provider_event_id,
        status = excluded.status,
        occurred_at = excluded.occurred_at;

  update orders o
  set status = p_status,
      refunded_at = case when p_status = 'refunded' then now() else o.refunded_at end
  where o.stripe_payment_intent_id = p_stripe_payment_intent_id;

  update result_checkout_attempts attempt
  set status = 'refunded', active = false,
      last_error = 'Stripe payment ' || p_status,
      updated_at = now()
  where attempt.order_id in (
    select o.id from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id
      and o.order_type = 'finished_result'
  );

  update sponsor_intakes intake
  set status = 'closed', updated_at = now()
  where intake.id in (
    select o.sponsor_intake_id from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id
      and o.order_type = 'story_start'
  );
  update storyteller_permission_requests request
  set status = 'revoked', disposition_at = now(), updated_at = now()
  where request.sponsor_intake_id in (
    select o.sponsor_intake_id from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id
      and o.order_type = 'story_start'
  ) and request.status in ('pending', 'identity_pending', 'granted');
  update call_requests call
  set status = 'cancelled', outcome = 'payment_revoked', updated_at = now()
  where call.sponsor_intake_id in (
    select o.sponsor_intake_id from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id
      and o.order_type = 'story_start'
  ) and call.status in ('queued', 'scheduled');
  update story_rooms room
  set production_status = 'closed'
  where room.sponsor_intake_id in (
    select o.sponsor_intake_id from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id
      and o.order_type = 'story_start'
  );

  return query
    select o.sponsor_intake_id, o.order_type, o.story_room_id
    from orders o
    where o.stripe_payment_intent_id = p_stripe_payment_intent_id;
end;
$$;
revoke all on function revoke_stripe_payment(text, text, text)
  from public, anon, authenticated;
grant execute on function revoke_stripe_payment(text, text, text)
  to service_role;

create table if not exists push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'web')),
  token text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The public page calls this only through a server action using the service role.
-- Locking the request row makes the permission response and queued interview atomic.
create or replace function respond_to_storyteller_permission(
  p_public_token text,
  p_family_code text,
  p_storyteller_name text,
  p_decision text,
  p_do_not_call boolean default false,
  p_evidence jsonb default '{}'
)
returns table(result_status text, story_room_id uuid, storyteller_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_record storyteller_permission_requests%rowtype;
  intake_record sponsor_intakes%rowtype;
  contact_id uuid;
  authorization_id uuid;
  occurred timestamptz := now();
begin
  if p_decision not in ('granted', 'declined') then
    raise exception 'invalid permission decision';
  end if;

  select * into permission_record
  from storyteller_permission_requests
  where public_token = p_public_token
  for update;

  if permission_record.id is null
     or permission_record.status <> 'pending'
     or permission_record.expires_at <= occurred
     or permission_record.family_code <> p_family_code then
    raise exception 'permission request is unavailable';
  end if;

  select * into intake_record
  from sponsor_intakes
  where id = permission_record.sponsor_intake_id;

  if intake_record.id is null then
    raise exception 'story intake is unavailable';
  end if;

  insert into consent_events (
    story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
    decision, capture_method, verification_status, evidence, occurred_at, expires_at
  ) values (
    permission_record.story_room_id, intake_record.id, p_storyteller_name, 'contact',
    p_decision, 'family_pass', case when p_decision = 'granted' then 'pending' else 'verified' end,
    jsonb_build_object('source', 'family_pass'),
    occurred, occurred + interval '30 days'
  ) returning id into contact_id;
  insert into consent_event_evidence (consent_event_id, evidence)
  values (contact_id, coalesce(p_evidence, '{}') || jsonb_build_object('permission_request_id', permission_record.id));

  insert into consent_events (
    story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
    decision, capture_method, verification_status, evidence, occurred_at, expires_at
  ) values (
    permission_record.story_room_id, intake_record.id, p_storyteller_name, 'ai_interview',
    p_decision, 'family_pass', case when p_decision = 'granted' then 'pending' else 'verified' end,
    jsonb_build_object('source', 'family_pass'),
    occurred, occurred + interval '30 days'
  ) returning id into authorization_id;
  insert into consent_event_evidence (consent_event_id, evidence)
  values (authorization_id, coalesce(p_evidence, '{}') || jsonb_build_object('permission_request_id', permission_record.id));

  update storyteller_permission_requests
  set status = case when p_decision = 'granted' then 'identity_pending' else 'declined' end,
      authorization_consent_event_id = case when p_decision = 'granted' then null else authorization_id end,
      responded_at = occurred,
      updated_at = occurred
  where id = permission_record.id;

  update sponsor_intakes
  set status = case when p_decision = 'granted' then 'permission_pending' else 'permission_declined' end,
      updated_at = occurred
  where id = intake_record.id;

  update story_rooms
  set production_status = case when p_decision = 'granted' then 'permission_pending' else 'permission_declined' end
  where id = permission_record.story_room_id;

  if p_decision = 'granted' then
    insert into call_requests (
      story_room_id, sponsor_intake_id, permission_request_id, call_kind, status, to_number
    ) values (
      permission_record.story_room_id, intake_record.id, permission_record.id,
      'human_permission', 'queued', intake_record.storyteller_phone
    ) on conflict (permission_request_id, call_kind, attempt_number) do nothing;
  elsif p_do_not_call then
    insert into do_not_call_entries (storyteller_phone, reason, source, requested_at)
    values (intake_record.storyteller_phone, 'Requested on Family Pass', 'storyteller_request', occurred)
    on conflict (storyteller_phone) do update
      set reason = excluded.reason, source = excluded.source, requested_at = excluded.requested_at;
  end if;

  return query select p_decision, permission_record.story_room_id, p_storyteller_name;
end;
$$;

revoke all on function respond_to_storyteller_permission(text, text, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function respond_to_storyteller_permission(text, text, text, text, boolean, jsonb)
  to service_role;

create or replace function verify_storyteller_permission_identity(
  p_permission_request_id uuid,
  p_human_call_request_id uuid,
  p_evidence jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_record storyteller_permission_requests%rowtype;
  intake_record sponsor_intakes%rowtype;
  human_call call_requests%rowtype;
  capture_method text;
  contact_id uuid;
  authorization_id uuid;
  occurred timestamptz := now();
begin
  if not is_staff() then raise exception 'staff access required'; end if;
  if jsonb_typeof(coalesce(p_evidence, '{}')) <> 'object'
     or length(btrim(coalesce(p_evidence ->> 'operator_notes', ''))) < 20
     or coalesce((p_evidence ->> 'identity_attested')::boolean, false) is not true
     or coalesce((p_evidence ->> 'ai_scope_explained')::boolean, false) is not true
     or coalesce((p_evidence ->> 'recording_boundary_explained')::boolean, false) is not true
     or coalesce(p_evidence ->> 'statement_version', '') <> 'human_identity_2026_08_11' then
    raise exception 'complete operator evidence and attestations are required';
  end if;

  select * into permission_record from storyteller_permission_requests
  where id = p_permission_request_id for update;
  if permission_record.id is null or permission_record.status <> 'identity_pending' or permission_record.expires_at <= occurred then
    raise exception 'permission request is not awaiting identity verification';
  end if;
  select * into intake_record from sponsor_intakes where id = permission_record.sponsor_intake_id;
  if intake_record.id is null then raise exception 'story intake is unavailable'; end if;

  select * into human_call
  from call_requests
  where id = p_human_call_request_id
    and permission_request_id = permission_record.id
    and sponsor_intake_id = intake_record.id
    and story_room_id = permission_record.story_room_id
    and status = 'completed'
    and ended_at is not null
    and retell_call_id is not null
  for update;
  if human_call.id is null then
    raise exception 'a completed human verification call is required';
  end if;
  if human_call.call_kind = 'human_permission' and human_call.direction = 'outbound' then
    capture_method := 'human_phone';
  elsif human_call.call_kind = 'inbound_permission' and human_call.direction = 'inbound' then
    capture_method := 'inbound_phone';
  else
    raise exception 'verification call direction or kind is invalid';
  end if;
  if (capture_method = 'human_phone' and
        regexp_replace(coalesce(human_call.to_number, ''), '[^0-9]', '', 'g') <>
        regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g'))
     or (capture_method = 'inbound_phone' and
        regexp_replace(coalesce(human_call.from_number, ''), '[^0-9]', '', 'g') <>
        regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g')) then
    raise exception 'verification call does not match the frozen storyteller number';
  end if;
  if exists (
    select 1 from do_not_call_entries dnc
    where regexp_replace(dnc.storyteller_phone, '[^0-9]', '', 'g') =
          regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g')
  ) then
    raise exception 'storyteller number is on the do-not-call list';
  end if;

  insert into consent_events (
    story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
    decision, capture_method, verification_status, evidence, occurred_at
  ) values (
    permission_record.story_room_id, intake_record.id, intake_record.storyteller_name, 'contact',
    'granted', capture_method, 'verified',
    jsonb_build_object('source', 'human_identity_verification'),
    occurred
  ) returning id into contact_id;
  insert into consent_event_evidence (consent_event_id, evidence)
  values (
    contact_id,
    coalesce(p_evidence, '{}') || jsonb_build_object('permission_request_id', permission_record.id, 'human_call_request_id', human_call.id, 'identity_verified_by', auth.uid())
  );

  insert into consent_events (
    story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
    decision, capture_method, verification_status, evidence, occurred_at
  ) values (
    permission_record.story_room_id, intake_record.id, intake_record.storyteller_name, 'ai_interview',
    'granted', capture_method, 'verified',
    jsonb_build_object('source', 'human_identity_verification'),
    occurred
  ) returning id into authorization_id;
  insert into consent_event_evidence (consent_event_id, evidence)
  values (
    authorization_id,
    coalesce(p_evidence, '{}') || jsonb_build_object('permission_request_id', permission_record.id, 'human_call_request_id', human_call.id, 'identity_verified_by', auth.uid())
  );

  insert into consent_verifications (
    consent_event_id, verification_status, operator_notes, verified_by_user_id, verified_at
  )
  select id, 'rejected', 'Superseded by direct human identity verification', auth.uid(), occurred
  from consent_events
  where sponsor_intake_id = intake_record.id
    and capture_method = 'family_pass'
    and verification_status = 'pending';
  update consent_events
  set verification_status = 'rejected'
  where sponsor_intake_id = intake_record.id
    and capture_method = 'family_pass'
    and verification_status = 'pending';

  update storyteller_permission_requests
  set status = 'granted', authorization_consent_event_id = authorization_id,
      identity_verified_at = occurred, expires_at = occurred + interval '30 days', updated_at = occurred
  where id = permission_record.id;
  update sponsor_intakes set status = 'permission_granted', updated_at = occurred where id = intake_record.id;
  update story_rooms set production_status = 'permission_granted' where id = permission_record.story_room_id;
  if capture_method = 'inbound_phone' then
    update call_requests
    set status = 'cancelled', outcome = 'storyteller_called_in', updated_at = occurred
    where permission_request_id = permission_record.id
      and call_kind = 'human_permission'
      and status = 'queued';
  end if;

  insert into call_requests (
    story_room_id, sponsor_intake_id, permission_request_id,
    pre_call_authorization_event_id, call_kind, status, to_number
  ) values (
    permission_record.story_room_id, intake_record.id, permission_record.id,
    authorization_id, 'interview', 'queued', intake_record.storyteller_phone
  ) on conflict (permission_request_id, call_kind, attempt_number) do nothing;

  return authorization_id;
end;
$$;

revoke all on function verify_storyteller_permission_identity(uuid, uuid, jsonb) from public, anon;
grant execute on function verify_storyteller_permission_identity(uuid, uuid, jsonb) to authenticated;

create or replace function record_storyteller_permission_disposition(
  p_permission_request_id uuid,
  p_human_call_request_id uuid,
  p_disposition text,
  p_operator_notes text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_record storyteller_permission_requests%rowtype;
  intake_record sponsor_intakes%rowtype;
  human_call call_requests%rowtype;
  consent_id uuid;
  occurred timestamptz := now();
begin
  if not is_staff() then raise exception 'staff access required'; end if;
  if p_disposition not in ('declined', 'wrong_person', 'could_not_verify')
     or length(btrim(coalesce(p_operator_notes, ''))) < 20 then
    raise exception 'a valid disposition and complete operator note are required';
  end if;

  select * into permission_record from storyteller_permission_requests
  where id = p_permission_request_id and status = 'identity_pending' for update;
  if permission_record.id is null then raise exception 'permission request is not awaiting identity verification'; end if;
  select * into intake_record from sponsor_intakes where id = permission_record.sponsor_intake_id;
  select * into human_call from call_requests
  where id = p_human_call_request_id
    and permission_request_id = permission_record.id
    and sponsor_intake_id = intake_record.id
    and story_room_id = permission_record.story_room_id
    and call_kind in ('human_permission', 'inbound_permission')
  for update;
  if human_call.id is null then raise exception 'verification call does not match the permission request'; end if;
  if human_call.retell_call_id is null then
    raise exception 'a managed provider call reference is required';
  end if;

  if p_disposition in ('declined', 'wrong_person')
     and (human_call.status <> 'completed' or human_call.ended_at is null) then
    raise exception 'a completed human call is required for this disposition';
  elsif p_disposition = 'could_not_verify'
     and human_call.status not in ('completed', 'no_answer', 'declined', 'failed', 'needs_human_review') then
    raise exception 'the call outcome cannot be recorded as unverified';
  end if;

  if (human_call.call_kind = 'human_permission' and (
        human_call.direction <> 'outbound'
        or regexp_replace(coalesce(human_call.to_number, ''), '[^0-9]', '', 'g') <>
           regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g')
      ))
     or (human_call.call_kind = 'inbound_permission' and (
        human_call.direction <> 'inbound'
        or regexp_replace(coalesce(human_call.from_number, ''), '[^0-9]', '', 'g') <>
           regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g')
      )) then
    raise exception 'verification call does not match the frozen storyteller number';
  end if;

  insert into permission_dispositions (
    permission_request_id, human_call_request_id, disposition,
    operator_notes, recorded_by_user_id, recorded_at
  ) values (
    permission_record.id, human_call.id, p_disposition,
    btrim(p_operator_notes), auth.uid(), occurred
  );

  update call_requests
  set outcome = p_disposition, updated_at = occurred
  where id = human_call.id;

  if p_disposition = 'declined' then
    insert into consent_events (
      story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
      decision, capture_method, verification_status, evidence, occurred_at
    ) values (
      permission_record.story_room_id, intake_record.id, intake_record.storyteller_name,
      'contact', 'declined',
      case when human_call.call_kind = 'inbound_permission' then 'inbound_phone' else 'human_phone' end,
      'verified', jsonb_build_object('source', 'human_identity_verification'), occurred
    ) returning id into consent_id;
    insert into consent_event_evidence (consent_event_id, evidence)
    values (consent_id, jsonb_build_object('permission_request_id', permission_record.id, 'human_call_request_id', human_call.id, 'operator_notes', btrim(p_operator_notes), 'recorded_by', auth.uid()));

    insert into consent_events (
      story_room_id, sponsor_intake_id, storyteller_name, consent_scope,
      decision, capture_method, verification_status, evidence, occurred_at
    ) values (
      permission_record.story_room_id, intake_record.id, intake_record.storyteller_name,
      'ai_interview', 'declined',
      case when human_call.call_kind = 'inbound_permission' then 'inbound_phone' else 'human_phone' end,
      'verified', jsonb_build_object('source', 'human_identity_verification'), occurred
    ) returning id into consent_id;
    insert into consent_event_evidence (consent_event_id, evidence)
    values (consent_id, jsonb_build_object('permission_request_id', permission_record.id, 'human_call_request_id', human_call.id, 'operator_notes', btrim(p_operator_notes), 'recorded_by', auth.uid()));

    update storyteller_permission_requests set status = 'declined', disposition_at = occurred, updated_at = occurred where id = permission_record.id;
    update sponsor_intakes set status = 'permission_declined', updated_at = occurred where id = intake_record.id;
    update story_rooms set production_status = 'permission_declined' where id = permission_record.story_room_id;
  elsif p_disposition = 'wrong_person' then
    insert into consent_verifications (
      consent_event_id, verification_status, operator_notes, verified_by_user_id, verified_at
    )
    select id, 'rejected', 'Human check reached the wrong person: ' || btrim(p_operator_notes), auth.uid(), occurred
    from consent_events
    where sponsor_intake_id = intake_record.id
      and verification_status = 'pending';
    update consent_events set verification_status = 'rejected'
    where sponsor_intake_id = intake_record.id and verification_status = 'pending';
    update storyteller_permission_requests set status = 'revoked', disposition_at = occurred, updated_at = occurred where id = permission_record.id;
    update sponsor_intakes set status = 'closed', updated_at = occurred where id = intake_record.id;
    update story_rooms set production_status = 'closed' where id = permission_record.story_room_id;
  end if;

  if p_disposition in ('declined', 'wrong_person') then
    update call_requests set status = 'cancelled', updated_at = occurred
    where permission_request_id = permission_record.id and status in ('queued', 'scheduled');
  end if;
  if p_disposition = 'could_not_verify' then
    insert into call_requests (
      story_room_id, sponsor_intake_id, permission_request_id,
      call_kind, status, scheduled_for, attempt_number, direction,
      from_number, to_number, outcome
    ) values (
      human_call.story_room_id, human_call.sponsor_intake_id, human_call.permission_request_id,
      human_call.call_kind, 'queued', null, human_call.attempt_number + 1, human_call.direction,
      human_call.from_number, human_call.to_number, 'retry_after_unverified_contact'
    ) on conflict (permission_request_id, call_kind, attempt_number) do nothing;
  end if;
  return p_disposition;
end;
$$;

revoke all on function record_storyteller_permission_disposition(uuid, uuid, text, text)
  from public, anon;
grant execute on function record_storyteller_permission_disposition(uuid, uuid, text, text)
  to authenticated;

-- Resolve consent from the latest verified event, not from a mutable chapter
-- flag or a provider's unreviewed analysis candidate.
create or replace function has_current_verified_story_consent(
  p_story_room_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not (is_staff() or owns_story_room(p_story_room_id) or auth.role() = 'service_role') then false
    else coalesce((
    select ce.decision = 'granted'
      and (ce.expires_at is null or ce.expires_at > now())
    from consent_events ce
    where ce.story_room_id = p_story_room_id
      and ce.consent_scope = p_scope
      and ce.verification_status = 'verified'
    order by ce.occurred_at desc, ce.created_at desc
    limit 1
  ), false) end;
$$;
revoke all on function has_current_verified_story_consent(uuid, text) from public, anon;
grant execute on function has_current_verified_story_consent(uuid, text) to authenticated, service_role;

create or replace function story_release_is_current(p_story_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_current_verified_story_consent(p_story_room_id, 'recording')
     and has_current_verified_story_consent(p_story_room_id, 'transcription')
     and has_current_verified_story_consent(p_story_room_id, 'editing')
     and has_current_verified_story_consent(p_story_room_id, 'family_sharing');
$$;
revoke all on function story_release_is_current(uuid) from public, anon;
grant execute on function story_release_is_current(uuid) to authenticated, service_role;

create or replace function story_chapter_release_is_current(p_story_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      has_current_verified_story_consent(sc.story_room_id, 'recording')
      and has_current_verified_story_consent(sc.story_room_id, 'transcription')
      and has_current_verified_story_consent(sc.story_room_id, 'editing')
      and coalesce((
        select ce.decision = 'granted'
          and (ce.expires_at is null or ce.expires_at > now())
        from consent_events ce
        where ce.story_chapter_id = sc.id
          and ce.consent_scope = 'family_sharing'
          and ce.verification_status = 'verified'
        order by ce.occurred_at desc, ce.created_at desc
        limit 1
      ), false)
    from story_chapters sc
    where sc.id = p_story_chapter_id
      and (is_staff() or owns_story_room(sc.story_room_id) or auth.role() = 'service_role')
  ), false);
$$;
revoke all on function story_chapter_release_is_current(uuid) from public, anon;
grant execute on function story_chapter_release_is_current(uuid) to authenticated, service_role;

-- Retell analysis is evidence, never the legal/operational decision. A staff
-- reviewer must verify or reject each spoken candidate against the managed call.
create or replace function verify_spoken_consent_candidate(
  p_consent_event_id uuid,
  p_verification_status text,
  p_operator_notes text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate consent_events%rowtype;
  managed_call call_requests%rowtype;
begin
  if not is_staff() then raise exception 'staff access required'; end if;
  if p_verification_status not in ('verified', 'rejected')
     or length(btrim(coalesce(p_operator_notes, ''))) < 20 then
    raise exception 'a verification decision and complete operator note are required';
  end if;

  select * into candidate from consent_events
  where id = p_consent_event_id for update;
  if candidate.id is null
     or candidate.capture_method <> 'spoken_on_call'
     or candidate.verification_status <> 'pending'
     or candidate.call_request_id is null then
    raise exception 'spoken consent candidate is not awaiting review';
  end if;
  select * into managed_call from call_requests
  where id = candidate.call_request_id
    and story_room_id = candidate.story_room_id
    and status = 'completed'
    and ended_at is not null
    and retell_call_id is not null;
  if managed_call.id is null then
    raise exception 'a completed managed call is required to review this evidence';
  end if;

  insert into consent_verifications (
    consent_event_id, verification_status, operator_notes,
    verified_by_user_id, verified_at
  ) values (
    candidate.id, p_verification_status, btrim(p_operator_notes),
    auth.uid(), now()
  );
  update consent_events set verification_status = p_verification_status
  where id = candidate.id;
  return p_verification_status;
end;
$$;
revoke all on function verify_spoken_consent_candidate(uuid, text, text) from public, anon;
grant execute on function verify_spoken_consent_candidate(uuid, text, text) to authenticated;

-- A chapter becomes sponsor-visible only after a direct, completed human story
-- review with the storyteller. Production scopes must already be current.
create or replace function record_storyteller_chapter_release(
  p_story_chapter_id uuid,
  p_review_call_request_id uuid,
  p_decision text,
  p_operator_notes text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chapter_record story_chapters%rowtype;
  review_call call_requests%rowtype;
  intake_record sponsor_intakes%rowtype;
  capture_method text;
  sharing_event_id uuid;
begin
  if not is_staff() then raise exception 'staff access required'; end if;
  if p_decision not in ('family', 'private', 'withheld')
     or length(btrim(coalesce(p_operator_notes, ''))) < 20 then
    raise exception 'a release decision and complete operator note are required';
  end if;

  select * into chapter_record from story_chapters
  where id = p_story_chapter_id for update;
  if chapter_record.id is null or not (
    (chapter_record.status = 'storyteller_review' and chapter_record.storyteller_share_decision = 'pending')
    or (
      chapter_record.status in ('sponsor_preview', 'approved', 'delivered')
      and chapter_record.storyteller_share_decision = 'family'
      and p_decision in ('private', 'withheld')
    )
  ) then
    raise exception 'chapter is not eligible for this storyteller release decision';
  end if;
  select * into review_call from call_requests
  where id = p_review_call_request_id
    and story_room_id = chapter_record.story_room_id
    and call_kind = 'story_review'
    and status = 'completed'
    and ended_at is not null
    and retell_call_id is not null
  for update;
  if review_call.id is null then
    raise exception 'a completed human story-review call is required';
  end if;
  select * into intake_record from sponsor_intakes
  where id = review_call.sponsor_intake_id
    and story_room_id = chapter_record.story_room_id;
  if intake_record.id is null then raise exception 'story intake is unavailable'; end if;

  if review_call.direction = 'inbound'
     and regexp_replace(coalesce(review_call.from_number, ''), '[^0-9]', '', 'g') =
         regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g') then
    capture_method := 'inbound_phone';
  elsif review_call.direction = 'outbound'
     and regexp_replace(coalesce(review_call.to_number, ''), '[^0-9]', '', 'g') =
         regexp_replace(intake_record.storyteller_phone, '[^0-9]', '', 'g') then
    capture_method := 'human_phone';
  else
    raise exception 'story-review call does not match the frozen storyteller number';
  end if;

  if p_decision = 'family' and (
    not has_current_verified_story_consent(chapter_record.story_room_id, 'recording')
    or not has_current_verified_story_consent(chapter_record.story_room_id, 'transcription')
    or not has_current_verified_story_consent(chapter_record.story_room_id, 'editing')
  ) then
    raise exception 'verified recording, transcription, and editing grants are required before family release';
  end if;

  insert into consent_events (
    story_room_id, sponsor_intake_id, call_request_id, story_chapter_id, storyteller_name,
    consent_scope, decision, capture_method, verification_status,
    evidence, occurred_at
  ) values (
    chapter_record.story_room_id, intake_record.id, review_call.id, chapter_record.id,
    intake_record.storyteller_name, 'family_sharing',
    case when p_decision = 'family' then 'granted' else 'revoked' end,
    capture_method, 'verified', jsonb_build_object('source', 'human_story_review'), now()
  ) returning id into sharing_event_id;
  insert into consent_event_evidence (consent_event_id, evidence)
  values (
    sharing_event_id,
    jsonb_build_object(
      'story_chapter_id', chapter_record.id,
      'review_call_request_id', review_call.id,
      'operator_notes', btrim(p_operator_notes),
      'recorded_by', auth.uid()
    )
  );
  insert into consent_verifications (
    consent_event_id, verification_status, operator_notes,
    verified_by_user_id, verified_at
  ) values (
    sharing_event_id, 'verified', btrim(p_operator_notes), auth.uid(), now()
  );

  update story_chapters
  set storyteller_share_decision = p_decision,
      status = case when p_decision = 'family' then 'sponsor_preview' else 'withheld' end,
      approved_at = case when p_decision = 'family' then now() else approved_at end,
      updated_at = now()
  where id = chapter_record.id;
  return p_decision;
end;
$$;
revoke all on function record_storyteller_chapter_release(uuid, uuid, text, text) from public, anon;
grant execute on function record_storyteller_chapter_release(uuid, uuid, text, text) to authenticated;

create or replace function enforce_story_chapter_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('human_review', 'storyteller_review', 'sponsor_preview', 'approved', 'delivered')
     and (
       not has_current_verified_story_consent(new.story_room_id, 'recording')
       or not has_current_verified_story_consent(new.story_room_id, 'transcription')
       or not has_current_verified_story_consent(new.story_room_id, 'editing')
     ) then
    raise exception 'current verified production consent is required for this chapter state';
  end if;
  if new.storyteller_share_decision = 'family'
     and new.status in ('sponsor_preview', 'approved', 'delivered')
     and not story_chapter_release_is_current(new.id) then
    raise exception 'current verified family release is required';
  end if;
  return new;
end;
$$;
revoke all on function enforce_story_chapter_consent() from public, anon, authenticated;
drop trigger if exists require_story_chapter_consent on story_chapters;
create trigger require_story_chapter_consent
before insert or update on story_chapters
for each row execute function enforce_story_chapter_consent();

create or replace function enforce_story_preview_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chapter_record story_chapters%rowtype;
begin
  select * into chapter_record from story_chapters where id = new.story_chapter_id;
  if chapter_record.id is null
     or chapter_record.storyteller_share_decision <> 'family'
     or chapter_record.status not in ('sponsor_preview', 'approved', 'delivered')
     or not story_chapter_release_is_current(chapter_record.id) then
    raise exception 'a current storyteller release is required for a Story Drop';
  end if;
  return new;
end;
$$;
revoke all on function enforce_story_preview_consent() from public, anon, authenticated;
drop trigger if exists require_story_preview_consent on story_drop_previews;
create trigger require_story_preview_consent
before insert or update on story_drop_previews
for each row execute function enforce_story_preview_consent();

create or replace function enforce_story_delivery_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room_id uuid;
begin
  select sc.story_room_id into room_id from story_chapters sc where sc.id = new.story_chapter_id;
  if room_id is null
     or not has_current_verified_story_consent(room_id, 'recording')
     or not has_current_verified_story_consent(room_id, 'transcription')
     or not has_current_verified_story_consent(room_id, 'editing') then
    raise exception 'current verified production consent is required for a finished delivery';
  end if;
  return new;
end;
$$;
revoke all on function enforce_story_delivery_consent() from public, anon, authenticated;
drop trigger if exists require_story_delivery_consent on story_chapter_deliveries;
create trigger require_story_delivery_consent
before insert or update on story_chapter_deliveries
for each row execute function enforce_story_delivery_consent();

create or replace function invalidate_or_lock_story_delivery_attestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.verified_manifest_sha256 := null;
    new.verified_at := null;
    new.verified_by_user_id := null;
    return new;
  end if;

  if new.body is distinct from old.body
     or new.source_map is distinct from old.source_map
     or new.delivered_assets is distinct from old.delivered_assets then
    if exists (
      select 1 from orders o
      where o.story_chapter_id = new.story_chapter_id
        and o.order_type = 'finished_result'
        and o.status = 'paid'
        and not exists (
          select 1 from payment_revocations pr
          where pr.stripe_payment_intent_id = o.stripe_payment_intent_id
        )
    ) then
      raise exception 'a paid delivery package is immutable';
    end if;
    new.verified_manifest_sha256 := null;
    new.verified_at := null;
    new.verified_by_user_id := null;
  end if;
  return new;
end;
$$;
revoke all on function invalidate_or_lock_story_delivery_attestation()
  from public, anon, authenticated;
drop trigger if exists invalidate_story_delivery_attestation on story_chapter_deliveries;
create trigger invalidate_story_delivery_attestation
before insert or update on story_chapter_deliveries
for each row execute function invalidate_or_lock_story_delivery_attestation();

-- Finalize a single-use family relay in one database transaction. The server
-- stages any private object first, then this function locks the invite, creates
-- every relational record, and marks the invite used only at the end.
create or replace function finalize_invite_contribution(
  p_invite_token text,
  p_display_name text,
  p_email text,
  p_contribution_type text,
  p_title text,
  p_body text,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_artifact_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record invites%rowtype;
  member_id uuid;
  contribution_id uuid;
begin
  if p_display_name is null or length(btrim(p_display_name)) < 2
     or p_body is null or length(btrim(p_body)) < 2
     or p_contribution_type not in ('memory', 'photo', 'document', 'audio', 'question', 'recipe', 'note') then
    raise exception 'invalid contribution';
  end if;

  select * into invite_record
  from invites
  where invite_token = p_invite_token
  for update;

  if invite_record.id is null
     or invite_record.status <> 'pending'
     or (invite_record.expires_at is not null and invite_record.expires_at <= now()) then
    raise exception 'invite is unavailable';
  end if;

  insert into story_room_members (story_room_id, display_name, email, role, status)
  values (invite_record.story_room_id, btrim(p_display_name), nullif(lower(btrim(p_email)), ''), 'contributor', 'active')
  returning id into member_id;

  insert into contributions (
    story_room_id, contributor_member_id, source, source_external_id,
    contribution_type, title, body, raw_payload, review_status
  ) values (
    invite_record.story_room_id, member_id, 'web', invite_record.id::text,
    p_contribution_type, nullif(btrim(p_title), ''), btrim(p_body),
    jsonb_build_object('submitted_by', btrim(p_display_name), 'email', nullif(lower(btrim(p_email)), ''), 'permission_confirmed', true),
    'needs_review'
  ) returning id into contribution_id;

  if p_storage_bucket is not null or p_storage_path is not null then
    if p_storage_bucket is null or p_storage_path is null or p_mime_type is null or p_artifact_type is null then
      raise exception 'incomplete staged artifact';
    end if;
    insert into artifacts (
      contribution_id, story_room_id, storage_bucket, storage_path,
      file_name, mime_type, file_size_bytes, artifact_type
    ) values (
      contribution_id, invite_record.story_room_id, p_storage_bucket, p_storage_path,
      p_file_name, p_mime_type, p_file_size_bytes, p_artifact_type
    );
  end if;

  update invites set status = 'used' where id = invite_record.id;
  return contribution_id;
end;
$$;

revoke all on function finalize_invite_contribution(text, text, text, text, text, text, text, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function finalize_invite_contribution(text, text, text, text, text, text, text, text, text, text, bigint, text)
  to service_role;

alter table sponsor_intakes enable row level security;
alter table call_requests enable row level security;
alter table call_artifacts enable row level security;
alter table consent_events enable row level security;
alter table consent_event_evidence enable row level security;
alter table consent_verifications enable row level security;
alter table storyteller_permission_requests enable row level security;
alter table permission_response_attempts enable row level security;
alter table story_start_request_attempts enable row level security;
alter table permission_dispositions enable row level security;
alter table do_not_call_entries enable row level security;
alter table family_questions enable row level security;
alter table story_chapters enable row level security;
alter table story_drop_previews enable row level security;
alter table story_chapter_deliveries enable row level security;
alter table story_corrections enable row level security;
alter table payment_events enable row level security;
alter table payment_revocations enable row level security;
alter table result_checkout_attempts enable row level security;
alter table push_devices enable row level security;

create policy "sponsor_intakes_owner_or_staff_select" on sponsor_intakes for select
  using (buyer_user_id = auth.uid() or is_staff());
create policy "sponsor_intakes_staff_update" on sponsor_intakes for update
  using (is_staff()) with check (is_staff());

create policy "call_requests_owner_or_staff_select" on call_requests for select
  using (owns_story_room(story_room_id) or is_staff());
create policy "call_requests_staff_insert" on call_requests for insert
  with check (is_staff());
create policy "call_requests_staff_update" on call_requests for update
  using (is_staff()) with check (is_staff());
create policy "call_artifacts_staff_all" on call_artifacts for all
  using (is_staff()) with check (is_staff());

create policy "consent_events_owner_or_staff_select" on consent_events for select
  using (owns_story_room(story_room_id) or is_staff());
create policy "consent_events_staff_insert" on consent_events for insert
  with check (is_staff());
create policy "consent_event_evidence_staff_select" on consent_event_evidence for select
  using (is_staff());
create policy "consent_verifications_staff_select" on consent_verifications for select
  using (is_staff());
create policy "storyteller_permission_requests_staff_select" on storyteller_permission_requests for select
  using (is_staff());
create policy "permission_response_attempts_staff_select" on permission_response_attempts for select
  using (is_staff());
create policy "story_start_request_attempts_staff_select" on story_start_request_attempts for select
  using (is_staff());
create policy "permission_dispositions_staff_select" on permission_dispositions for select
  using (is_staff());

create policy "do_not_call_staff_select" on do_not_call_entries for select
  using (is_staff());
create policy "do_not_call_staff_insert" on do_not_call_entries for insert
  with check (is_staff());

create policy "family_questions_owner_or_staff_select" on family_questions for select
  using (owns_story_room(story_room_id) or is_staff());
create policy "family_questions_owner_insert" on family_questions for insert
  with check (
    is_staff() or (
      owns_story_room(story_room_id)
      and submitted_by_user_id = auth.uid()
      and source = 'sponsor'
      and status = 'queued'
      and answered_in_call_request_id is null
    )
  );
create policy "family_questions_staff_update" on family_questions for update
  using (is_staff()) with check (is_staff());

create policy "story_chapters_shared_owner_or_staff_select" on story_chapters for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and storyteller_share_decision = 'family'
      and status in ('sponsor_preview', 'approved', 'delivered')
      and story_chapter_release_is_current(story_chapters.id)
    )
  );
create policy "story_chapters_staff_all" on story_chapters for all
  using (is_staff()) with check (is_staff());

create policy "story_drop_previews_shared_owner_or_staff_select" on story_drop_previews for select
  using (
    is_staff() or exists (
      select 1 from story_chapters sc
      where sc.id = story_drop_previews.story_chapter_id
        and owns_story_room(sc.story_room_id)
        and sc.storyteller_share_decision = 'family'
        and sc.status in ('sponsor_preview', 'approved', 'delivered')
        and story_chapter_release_is_current(sc.id)
    )
  );
create policy "story_drop_previews_staff_all" on story_drop_previews for all
  using (is_staff()) with check (is_staff());

create policy "story_chapter_deliveries_paid_owner_or_staff_select" on story_chapter_deliveries for select
  using (
    is_staff() or exists (
      select 1
      from story_chapters sc
      join orders o on o.story_chapter_id = sc.id
      where sc.id = story_chapter_deliveries.story_chapter_id
        and owns_story_room(sc.story_room_id)
        and sc.storyteller_share_decision = 'family'
        and story_chapter_release_is_current(sc.id)
        and o.order_type = 'finished_result'
        and o.status = 'paid'
        and not exists (
          select 1 from payment_revocations revoked_payment
          where revoked_payment.stripe_payment_intent_id = o.stripe_payment_intent_id
        )
    )
  );
create policy "story_chapter_deliveries_staff_all" on story_chapter_deliveries for all
  using (is_staff()) with check (is_staff());

create policy "story_corrections_owner_or_staff_select" on story_corrections for select
  using (is_staff() or exists (
    select 1 from story_chapters sc
    join orders o on o.story_chapter_id = sc.id
    where sc.id = story_corrections.story_chapter_id
      and sc.storyteller_share_decision = 'family'
      and sc.status = 'delivered'
      and story_chapter_release_is_current(sc.id)
      and o.order_type = 'finished_result'
      and o.status = 'paid'
      and not exists (
        select 1 from payment_revocations pr
        where pr.stripe_payment_intent_id = o.stripe_payment_intent_id
      )
      and owns_story_room(sc.story_room_id)
  ));
create policy "story_corrections_owner_insert" on story_corrections for insert
  with check (is_staff() or (exists (
    select 1 from story_chapters sc
    join orders o on o.story_chapter_id = sc.id
    where sc.id = story_corrections.story_chapter_id
      and sc.storyteller_share_decision = 'family'
      and sc.status = 'delivered'
      and story_chapter_release_is_current(sc.id)
      and o.order_type = 'finished_result'
      and o.status = 'paid'
      and not exists (
        select 1 from payment_revocations pr
        where pr.stripe_payment_intent_id = o.stripe_payment_intent_id
      )
      and owns_story_room(sc.story_room_id)
  )
    and requested_by_user_id = auth.uid()
    and status = 'open'
    and resolution_note is null
    and resolved_at is null
    and length(btrim(request)) between 2 and 2000
  ));
create policy "story_corrections_staff_update" on story_corrections for update
  using (is_staff());

create policy "payment_events_staff_select" on payment_events for select
  using (is_staff());
create policy "payment_revocations_staff_select" on payment_revocations for select
  using (is_staff());
create policy "result_checkout_attempts_staff_all" on result_checkout_attempts for all
  using (is_staff()) with check (is_staff());

create policy "push_devices_owner_all" on push_devices for all
  using (user_id = auth.uid() or is_staff())
  with check (user_id = auth.uid() or is_staff());

-- v0.1 allowed users to write their own profile role. Remove that escalation path
-- for databases that already ran the original migration.
drop policy if exists "profiles_update_self_or_staff" on profiles;
drop policy if exists "profiles_insert_self" on profiles;
drop policy if exists "profiles_update_staff_only" on profiles;
create policy "profiles_insert_self" on profiles for insert
  with check (id = auth.uid() and role = 'family_owner');
create policy "profiles_update_staff_only" on profiles for update
  using (is_staff()) with check (is_staff());

drop policy if exists "sponsor_intakes_owner_or_staff_update" on sponsor_intakes;
drop policy if exists "customer_accounts_owner_update" on customer_accounts;
drop policy if exists "customer_accounts_owner_insert" on customer_accounts;
drop policy if exists "story_rooms_owner_or_staff_update" on story_rooms;
drop policy if exists "story_rooms_owner_or_staff_insert" on story_rooms;
drop policy if exists "family_questions_owner_update" on family_questions;
drop policy if exists "memory_cards_owner_or_staff_select" on memory_cards;
drop policy if exists "story_maps_owner_or_staff_select" on story_maps;
drop policy if exists "story_capsules_owner_or_staff_select" on story_capsules;
drop policy if exists "contributions_owner_or_staff_select" on contributions;
drop policy if exists "artifacts_owner_or_staff_select" on artifacts;
drop policy if exists "contributions_owner_or_staff_insert" on contributions;
drop policy if exists "contributions_owner_or_staff_update" on contributions;
drop policy if exists "artifacts_owner_or_staff_insert" on artifacts;
drop policy if exists "artifacts_owner_or_staff_update" on artifacts;
drop policy if exists "customer_accounts_staff_update" on customer_accounts;
create policy "customer_accounts_staff_update" on customer_accounts for update
  using (is_staff()) with check (is_staff());
create policy "customer_accounts_staff_insert" on customer_accounts for insert
  with check (is_staff());
drop policy if exists "story_rooms_staff_update" on story_rooms;
create policy "story_rooms_staff_update" on story_rooms for update
  using (is_staff()) with check (is_staff());
create policy "story_rooms_staff_insert" on story_rooms for insert
  with check (is_staff());

-- Legacy Homeplace/Capsule production records remain available to their
-- original manual rooms, but sponsored-call rooms can only expose the v2
-- preview and paid-delivery tables above.
create policy "memory_cards_legacy_owner_or_staff_select" on memory_cards for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = memory_cards.story_room_id and sr.sponsor_intake_id is not null)
    )
  );
create policy "story_maps_legacy_owner_or_staff_select" on story_maps for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = story_maps.story_room_id and sr.sponsor_intake_id is not null)
    )
  );
create policy "story_capsules_legacy_owner_or_staff_select" on story_capsules for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = story_capsules.story_room_id and sr.sponsor_intake_id is not null)
    )
  );
create policy "contributions_safe_owner_or_staff_select" on contributions for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and (
        not exists (select 1 from story_rooms sr where sr.id = contributions.story_room_id and sr.sponsor_intake_id is not null)
        or (source = 'web' and contribution_type not in ('transcript', 'summary'))
      )
    )
  );
create policy "contributions_safe_owner_or_staff_insert" on contributions for insert
  with check (
    is_staff() or (
      owns_story_room(story_room_id)
      and (
        not exists (select 1 from story_rooms sr where sr.id = contributions.story_room_id and sr.sponsor_intake_id is not null)
        or (source = 'web' and contribution_type not in ('transcript', 'summary'))
      )
    )
  );
create policy "contributions_legacy_owner_or_staff_update" on contributions for update
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = contributions.story_room_id and sr.sponsor_intake_id is not null)
    )
  ) with check (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = contributions.story_room_id and sr.sponsor_intake_id is not null)
    )
  );
create policy "artifacts_safe_owner_or_staff_select" on artifacts for select
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and (
        not exists (select 1 from story_rooms sr where sr.id = artifacts.story_room_id and sr.sponsor_intake_id is not null)
        or exists (
          select 1 from contributions c
          where c.id = artifacts.contribution_id
            and c.story_room_id = artifacts.story_room_id
            and c.source = 'web'
            and c.contribution_type not in ('transcript', 'summary')
        )
      )
    )
  );
create policy "artifacts_safe_owner_or_staff_insert" on artifacts for insert
  with check (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = artifacts.story_room_id and sr.sponsor_intake_id is not null)
    )
  );
create policy "artifacts_legacy_owner_or_staff_update" on artifacts for update
  using (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = artifacts.story_room_id and sr.sponsor_intake_id is not null)
    )
  ) with check (
    is_staff() or (
      owns_story_room(story_room_id)
      and not exists (select 1 from story_rooms sr where sr.id = artifacts.story_room_id and sr.sponsor_intake_id is not null)
    )
  );

-- Sponsors can query only the redacted consent ledger columns. The separate
-- evidence table remains staff-only even for users who own the Story Room.
revoke select on consent_events from anon, authenticated;
grant select (
  id, story_room_id, sponsor_intake_id, call_request_id, story_chapter_id, storyteller_name,
  consent_scope, decision, capture_method, verification_status,
  occurred_at, expires_at, created_at
) on consent_events to authenticated;

create index if not exists idx_sponsor_intakes_email on sponsor_intakes(lower(buyer_email));
drop index if exists idx_orders_checkout_session_unique;
create unique index idx_orders_checkout_session_unique on orders(stripe_checkout_session_id);
create unique index if not exists idx_story_rooms_sponsor_intake_unique
  on story_rooms(sponsor_intake_id);
create unique index if not exists idx_customer_accounts_story_start_owner_unique
  on customer_accounts(owner_user_id)
  where source = 'story_start';
create unique index if not exists idx_orders_finished_result_unique
  on orders(story_chapter_id, order_type)
  where story_chapter_id is not null and order_type = 'finished_result';
create unique index if not exists idx_orders_story_start_unique
  on orders(sponsor_intake_id, order_type)
  where sponsor_intake_id is not null and order_type = 'story_start';
create unique index if not exists idx_orders_stripe_payment_intent_unique
  on orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists idx_orders_storekit_transaction_unique
  on orders(storekit_transaction_id)
  where storekit_transaction_id is not null;
create unique index if not exists idx_story_corrections_one_family_pass
  on story_corrections(story_chapter_id)
  where requested_by_user_id is not null;
create unique index if not exists idx_result_checkout_one_active
  on result_checkout_attempts(story_chapter_id)
  where active;
create index if not exists idx_sponsor_intakes_status on sponsor_intakes(status, created_at desc);
create index if not exists idx_call_requests_room_status on call_requests(story_room_id, status, created_at desc);
create index if not exists idx_consent_events_room_scope on consent_events(story_room_id, consent_scope, occurred_at desc);
drop index if exists idx_consent_events_call_scope_unique;
create unique index idx_consent_events_call_scope_unique
  on consent_events(call_request_id, consent_scope)
  where call_request_id is not null and story_chapter_id is null;
create unique index if not exists idx_consent_events_call_scope_chapter_unique
  on consent_events(call_request_id, consent_scope, story_chapter_id)
  where call_request_id is not null and story_chapter_id is not null;
alter table call_requests drop constraint if exists call_requests_permission_request_id_key;
drop index if exists idx_call_requests_permission_kind_unique;
create unique index idx_call_requests_permission_kind_unique
  on call_requests(permission_request_id, call_kind, attempt_number);
create unique index if not exists idx_call_requests_one_authorization_use
  on call_requests(pre_call_authorization_event_id)
  where pre_call_authorization_event_id is not null;
create index if not exists idx_permission_attempts_throttle
  on permission_response_attempts(token_fingerprint, network_fingerprint, attempted_at desc);
create index if not exists idx_story_start_attempts_network
  on story_start_request_attempts(network_fingerprint, attempted_at desc);
create index if not exists idx_story_start_attempts_email
  on story_start_request_attempts(email_fingerprint, attempted_at desc);
create index if not exists idx_family_questions_room_status on family_questions(story_room_id, status, created_at desc);
create index if not exists idx_story_chapters_room_status on story_chapters(story_room_id, status, created_at desc);
