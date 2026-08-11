-- StorySitting result editions: one preview, three deliberate ways to keep it.
-- Upgrades charge only the difference and every settled payment remains an
-- immutable ledger entry so refunds can reduce—not resurrect—entitlements.

alter table sponsor_intakes add column if not exists story_shape text not null default 'open'
  check (story_shape in ('open', 'moment', 'person', 'place', 'tradition', 'lesson'));
alter table sponsor_intakes add column if not exists artifact_note text;
alter table sponsor_intakes add column if not exists family_context text;

alter table orders add column if not exists result_offer_id text
  check (result_offer_id in ('voice', 'story', 'heirloom'));
alter table orders add column if not exists result_paid_total_cents integer not null default 0
  check (result_paid_total_cents >= 0);

alter table result_checkout_attempts add column if not exists offer_id text
  check (offer_id in ('voice', 'story', 'heirloom'));
alter table result_checkout_attempts add column if not exists from_paid_cents integer not null default 0
  check (from_paid_cents >= 0);
alter table result_checkout_attempts add column if not exists amount_cents integer
  check (amount_cents is null or amount_cents > 0);
alter table result_checkout_attempts add column if not exists stripe_payment_intent_id text;

create table if not exists result_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  checkout_attempt_id uuid not null references result_checkout_attempts(id) on delete restrict,
  story_chapter_id uuid not null references story_chapters(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text not null unique,
  target_offer_id text not null check (target_offer_id in ('voice', 'story', 'heirloom')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'paid' check (status in ('paid', 'refunded', 'disputed')),
  paid_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_result_payments_order_status
  on result_payments(order_id, status);

create or replace function result_offer_price_cents(p_offer_id text)
returns integer
language sql
immutable
strict
as $$
  select case p_offer_id
    when 'voice' then 3900
    when 'story' then 7900
    when 'heirloom' then 14900
    else null
  end;
$$;

create or replace function recalculate_result_edition(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  paid_total integer;
  offer_id text;
begin
  select coalesce(sum(rp.amount_cents), 0)::integer into paid_total
  from result_payments rp
  where rp.order_id = p_order_id
    and rp.status = 'paid'
    and not exists (
      select 1 from payment_revocations pr
      where pr.stripe_payment_intent_id = rp.stripe_payment_intent_id
    );

  offer_id := case
    when paid_total >= 14900 then 'heirloom'
    when paid_total >= 7900 then 'story'
    when paid_total >= 3900 then 'voice'
    else null
  end;

  update orders o
  set result_paid_total_cents = paid_total,
      result_offer_id = offer_id,
      status = case when offer_id is null then 'refunded' else 'paid' end,
      refunded_at = case when offer_id is null then coalesce(o.refunded_at, now()) else null end
  where o.id = p_order_id and o.order_type = 'finished_result';

  return offer_id;
end;
$$;

revoke all on function result_offer_price_cents(text) from public, anon, authenticated;
revoke all on function recalculate_result_edition(uuid) from public, anon, authenticated;
grant execute on function result_offer_price_cents(text), recalculate_result_edition(uuid) to service_role;

create or replace function claim_result_edition_payment(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_offer_id text,
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
  current_paid integer;
  target_price integer;
  occurred timestamptz := now();
begin
  target_price := result_offer_price_cents(p_offer_id);
  if p_stripe_checkout_session_id is null
     or p_stripe_payment_intent_id is null
     or target_price is null
     or p_amount_cents <= 0
     or lower(coalesce(p_currency, '')) <> 'usd' then
    raise exception 'result edition payment does not match the product contract';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_payment_intent_id, 0));

  select * into attempt_record
  from result_checkout_attempts
  where id = p_attempt_id
    and stripe_checkout_session_id = p_stripe_checkout_session_id
    and offer_id = p_offer_id
    and amount_cents = p_amount_cents
  for update;
  if attempt_record.id is null then
    raise exception 'checkout attempt is missing or does not match the edition';
  end if;

  select * into order_record
  from orders
  where id = attempt_record.order_id
    and story_chapter_id = attempt_record.story_chapter_id
    and order_type = 'finished_result'
  for update;
  if order_record.id is null then
    raise exception 'canonical result order is missing';
  end if;

  if exists (
    select 1 from result_payments rp
    where rp.stripe_checkout_session_id = p_stripe_checkout_session_id
      and rp.stripe_payment_intent_id = p_stripe_payment_intent_id
      and rp.status = 'paid'
  ) then
    perform recalculate_result_edition(order_record.id);
    return 'delivered';
  end if;

  if exists (
    select 1 from payment_revocations pr
    where pr.stripe_payment_intent_id = p_stripe_payment_intent_id
  ) or attempt_record.status in ('refund_required', 'refunded') then
    update result_checkout_attempts set status = 'refund_required', active = false,
      last_error = 'payment was revoked before fulfillment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  select coalesce(sum(rp.amount_cents), 0)::integer into current_paid
  from result_payments rp
  where rp.order_id = order_record.id
    and rp.status = 'paid'
    and not exists (
      select 1 from payment_revocations pr
      where pr.stripe_payment_intent_id = rp.stripe_payment_intent_id
    );

  if attempt_record.from_paid_cents <> current_paid
     or p_amount_cents <> target_price - current_paid then
    update result_checkout_attempts set status = 'refund_required', active = false,
      last_error = 'stale or duplicate edition payment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  if not p_delivery_ready then
    update result_checkout_attempts set status = 'refund_required', active = false,
      last_error = 'edition files unavailable at fulfillment', updated_at = occurred
    where id = attempt_record.id;
    return 'refund_required';
  end if;

  insert into result_payments (
    order_id, checkout_attempt_id, story_chapter_id,
    stripe_checkout_session_id, stripe_payment_intent_id,
    target_offer_id, amount_cents, currency, status, paid_at
  ) values (
    order_record.id, attempt_record.id, attempt_record.story_chapter_id,
    p_stripe_checkout_session_id, p_stripe_payment_intent_id,
    p_offer_id, p_amount_cents, 'usd', 'paid', occurred
  );

  update result_checkout_attempts
  set status = 'paid', active = false,
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      last_error = null, updated_at = occurred
  where id = attempt_record.id;

  update orders
  set stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      amount_cents = current_paid + p_amount_cents,
      currency = 'usd'
  where id = order_record.id;

  perform recalculate_result_edition(order_record.id);
  return 'delivered';
end;
$$;

revoke all on function claim_result_edition_payment(uuid, text, text, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function claim_result_edition_payment(uuid, text, text, text, integer, text, boolean)
  to service_role;

create or replace function revoke_result_edition_payment(
  p_stripe_payment_intent_id text,
  p_provider_event_id text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record result_payments%rowtype;
begin
  if p_stripe_payment_intent_id is null
     or p_provider_event_id is null
     or p_status not in ('refunded', 'disputed') then
    raise exception 'invalid result edition revocation';
  end if;

  -- Use the PaymentIntent as the shared serialization key. Recording the
  -- revocation even before fulfillment closes the refund-before-claim race.
  perform pg_advisory_xact_lock(hashtextextended(p_stripe_payment_intent_id, 0));
  insert into payment_revocations (
    stripe_payment_intent_id, provider_event_id, status, occurred_at
  ) values (
    p_stripe_payment_intent_id, p_provider_event_id, p_status, now()
  ) on conflict (stripe_payment_intent_id) do update
    set provider_event_id = excluded.provider_event_id,
        status = excluded.status,
        occurred_at = excluded.occurred_at;

  select * into payment_record from result_payments
  where stripe_payment_intent_id = p_stripe_payment_intent_id for update;
  if payment_record.id is null then return 'not_found'; end if;
  update result_payments set status = p_status, revoked_at = now()
  where id = payment_record.id;
  update result_checkout_attempts set status = 'refunded', active = false,
    last_error = 'Stripe payment ' || p_status, updated_at = now()
  where id = payment_record.checkout_attempt_id;
  return coalesce(recalculate_result_edition(payment_record.order_id), 'none');
end;
$$;

revoke all on function revoke_result_edition_payment(text, text, text) from public, anon, authenticated;
grant execute on function revoke_result_edition_payment(text, text, text) to service_role;

alter table result_payments enable row level security;
create policy "result_payments_staff_all" on result_payments for all
  using (is_staff()) with check (is_staff());

-- Voice buyers receive signed source-file links from the authenticated server;
-- they never receive the full delivery row (chapter body/source map) through REST.
drop policy if exists "story_chapter_deliveries_paid_owner_or_staff_select" on story_chapter_deliveries;
create policy "story_chapter_deliveries_story_owner_or_staff_select" on story_chapter_deliveries for select
  using (
    is_staff() or exists (
      select 1 from story_chapters sc
      join orders o on o.story_chapter_id = sc.id
      where sc.id = story_chapter_deliveries.story_chapter_id
        and owns_story_room(sc.story_room_id)
        and sc.storyteller_share_decision = 'family'
        and story_chapter_release_is_current(sc.id)
        and o.order_type = 'finished_result'
        and o.status = 'paid'
        and o.result_offer_id in ('story', 'heirloom')
    )
  );

drop policy if exists "story_corrections_owner_or_staff_select" on story_corrections;
create policy "story_corrections_owner_or_staff_select" on story_corrections for select
  using (is_staff() or exists (
    select 1 from story_chapters sc join orders o on o.story_chapter_id = sc.id
    where sc.id = story_corrections.story_chapter_id
      and sc.storyteller_share_decision = 'family'
      and sc.status = 'delivered'
      and story_chapter_release_is_current(sc.id)
      and o.order_type = 'finished_result' and o.status = 'paid'
      and o.result_offer_id in ('story', 'heirloom')
      and owns_story_room(sc.story_room_id)
  ));

drop policy if exists "story_corrections_owner_insert" on story_corrections;

alter table story_corrections add column if not exists correction_round integer
  check (correction_round is null or correction_round in (1, 2));
drop index if exists idx_story_corrections_one_family_pass;
create unique index if not exists idx_story_corrections_chapter_round
  on story_corrections(story_chapter_id, correction_round)
  where correction_round is not null;

create or replace function submit_story_correction(
  p_story_room_id uuid,
  p_story_chapter_id uuid,
  p_correction_type text,
  p_request text,
  p_requested_by_name text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_id text;
  allowed_rounds integer;
  used_rounds integer;
begin
  if auth.uid() is null
     or p_correction_type not in ('fact', 'name', 'date', 'privacy', 'tone', 'other')
     or length(btrim(coalesce(p_request, ''))) not between 2 and 2000 then
    raise exception 'invalid correction request';
  end if;

  select o.result_offer_id into offer_id
  from story_chapters sc join orders o on o.story_chapter_id = sc.id
  where sc.id = p_story_chapter_id and sc.story_room_id = p_story_room_id
    and sc.status = 'delivered' and sc.storyteller_share_decision = 'family'
    and story_chapter_release_is_current(sc.id)
    and o.order_type = 'finished_result' and o.status = 'paid'
    and owns_story_room(sc.story_room_id)
  for update of o;

  allowed_rounds := case offer_id when 'story' then 1 when 'heirloom' then 2 else 0 end;
  if allowed_rounds = 0 then raise exception 'correction is not included in this edition'; end if;

  if exists (
    select 1 from story_corrections c
    where c.story_chapter_id = p_story_chapter_id
      and c.status not in ('completed', 'rejected')
  ) then
    raise exception 'finish the current correction before another round';
  end if;

  select count(*)::integer into used_rounds from story_corrections c
  where c.story_chapter_id = p_story_chapter_id and c.correction_round is not null;
  if used_rounds >= allowed_rounds then raise exception 'included correction rounds are already used'; end if;

  insert into story_corrections (
    story_chapter_id, requested_by_user_id, requested_by_name,
    correction_type, request, status, correction_round
  ) values (
    p_story_chapter_id, auth.uid(), left(coalesce(p_requested_by_name, ''), 120),
    p_correction_type, btrim(p_request), 'open', used_rounds + 1
  );
  return used_rounds + 1;
end;
$$;

revoke all on function submit_story_correction(uuid, uuid, text, text, text) from public, anon;
grant execute on function submit_story_correction(uuid, uuid, text, text, text) to authenticated;
