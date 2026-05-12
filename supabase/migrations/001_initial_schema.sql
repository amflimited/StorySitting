-- StorySitting MVP Foundation Schema v0.1
-- Target: Supabase Postgres

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'family_owner' check (role in ('family_owner', 'contributor', 'staff', 'admin', 'partner')),
  created_at timestamptz default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('storysitting', 'partner')),
  branding jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  referral_code text unique not null,
  commission_model text default 'manual',
  commission_value numeric(10,2),
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists customer_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid references partners(id),
  source text default 'direct',
  created_at timestamptz default now()
);

create table if not exists story_rooms (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid references customer_accounts(id) on delete cascade,
  title text not null,
  subject_name text,
  package_tier text check (package_tier in ('focused', 'signature', 'premium', 'custom')),
  production_status text default 'onboarding',
  privacy_status text default 'private',
  onboarding_data jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists story_room_members (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  email text,
  phone text,
  role text check (role in ('owner', 'contributor', 'viewer', 'staff', 'partner_observer')),
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invite_token text unique not null,
  email text,
  phone text,
  role text default 'contributor',
  status text default 'pending',
  raw_invite_data jsonb default '{}',
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  contributor_member_id uuid references story_room_members(id) on delete set null,
  source text check (source in ('web', 'quo', 'manual_import', 'make', 'zapier', 'admin')),
  source_external_id text,
  contribution_type text check (
    contribution_type in ('memory', 'photo', 'document', 'audio', 'transcript', 'summary', 'question', 'recipe', 'note')
  ),
  title text,
  body text,
  raw_payload jsonb default '{}',
  review_status text default 'needs_review',
  submitted_at timestamptz default now(),
  unique(source, source_external_id)
);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid references contributions(id) on delete cascade,
  story_room_id uuid references story_rooms(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  checksum_sha256 text,
  artifact_type text check (artifact_type in ('image', 'audio', 'document', 'video', 'pdf', 'other')),
  created_at timestamptz default now()
);

create table if not exists import_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  external_event_id text,
  story_room_id uuid references story_rooms(id) on delete set null,
  received_at timestamptz default now(),
  processed_at timestamptz,
  status text default 'received',
  payload jsonb not null,
  unique(source, external_event_id)
);

create table if not exists memory_cards (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  contribution_id uuid references contributions(id) on delete set null,
  title text,
  summary text,
  quote text,
  people text[],
  places text[],
  estimated_date text,
  life_era text,
  themes text[],
  confidence numeric(4,3),
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists story_maps (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  version int default 1,
  status text default 'draft',
  outline jsonb default '{}',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists story_capsules (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  status text default 'draft',
  web_slug text unique,
  pdf_artifact_id uuid references artifacts(id) on delete set null,
  capsule_data jsonb default '{}',
  delivered_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists production_tasks (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  task_type text,
  status text default 'open',
  priority text default 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  story_room_id uuid references story_rooms(id) on delete cascade,
  partner_id uuid references partners(id),
  package_tier text check (package_tier in ('focused', 'signature', 'premium', 'custom')),
  stripe_checkout_session_id text,
  amount_cents integer,
  currency text default 'usd',
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists referral_attributions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id),
  customer_account_id uuid references customer_accounts(id),
  story_room_id uuid references story_rooms(id),
  referral_code text,
  source_url text,
  status text default 'attributed',
  commission_status text default 'manual_pending',
  created_at timestamptz default now()
);

create or replace function is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('staff', 'admin')
  );
$$;

create or replace function owns_story_room(room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from story_rooms sr
    join customer_accounts ca on ca.id = sr.customer_account_id
    where sr.id = room_id
    and ca.owner_user_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table partners enable row level security;
alter table customer_accounts enable row level security;
alter table story_rooms enable row level security;
alter table story_room_members enable row level security;
alter table invites enable row level security;
alter table contributions enable row level security;
alter table artifacts enable row level security;
alter table import_events enable row level security;
alter table memory_cards enable row level security;
alter table story_maps enable row level security;
alter table story_capsules enable row level security;
alter table production_tasks enable row level security;
alter table orders enable row level security;
alter table referral_attributions enable row level security;

-- Profiles
create policy "profiles_select_self_or_staff" on profiles for select using (id = auth.uid() or is_staff());
create policy "profiles_insert_self" on profiles for insert with check (id = auth.uid());
create policy "profiles_update_self_or_staff" on profiles for update using (id = auth.uid() or is_staff());

-- Customer accounts
create policy "customer_accounts_owner_select" on customer_accounts for select using (owner_user_id = auth.uid() or is_staff());
create policy "customer_accounts_owner_insert" on customer_accounts for insert with check (owner_user_id = auth.uid() or is_staff());
create policy "customer_accounts_owner_update" on customer_accounts for update using (owner_user_id = auth.uid() or is_staff());

-- Story rooms
create policy "story_rooms_owner_or_staff_select" on story_rooms for select using (owns_story_room(id) or is_staff());
create policy "story_rooms_owner_or_staff_insert" on story_rooms for insert with check (is_staff() or exists(select 1 from customer_accounts ca where ca.id = customer_account_id and ca.owner_user_id = auth.uid()));
create policy "story_rooms_owner_or_staff_update" on story_rooms for update using (owns_story_room(id) or is_staff());

-- Room members
create policy "members_owner_or_staff_select" on story_room_members for select using (owns_story_room(story_room_id) or is_staff());
create policy "members_owner_or_staff_insert" on story_room_members for insert with check (owns_story_room(story_room_id) or is_staff());
create policy "members_owner_or_staff_update" on story_room_members for update using (owns_story_room(story_room_id) or is_staff());

-- Invites
create policy "invites_owner_or_staff_select" on invites for select using (owns_story_room(story_room_id) or is_staff());
create policy "invites_owner_or_staff_insert" on invites for insert with check (owns_story_room(story_room_id) or is_staff());
create policy "invites_owner_or_staff_update" on invites for update using (owns_story_room(story_room_id) or is_staff());

-- Contributions
create policy "contributions_owner_or_staff_select" on contributions for select using (owns_story_room(story_room_id) or is_staff());
create policy "contributions_owner_or_staff_insert" on contributions for insert with check (owns_story_room(story_room_id) or is_staff());
create policy "contributions_owner_or_staff_update" on contributions for update using (owns_story_room(story_room_id) or is_staff());

-- Artifacts
create policy "artifacts_owner_or_staff_select" on artifacts for select using (owns_story_room(story_room_id) or is_staff());
create policy "artifacts_owner_or_staff_insert" on artifacts for insert with check (owns_story_room(story_room_id) or is_staff());
create policy "artifacts_owner_or_staff_update" on artifacts for update using (owns_story_room(story_room_id) or is_staff());

-- Staff production records
create policy "import_events_staff_all" on import_events for all using (is_staff()) with check (is_staff());
create policy "memory_cards_owner_or_staff_select" on memory_cards for select using (owns_story_room(story_room_id) or is_staff());
create policy "memory_cards_staff_insert_update" on memory_cards for all using (is_staff()) with check (is_staff());
create policy "story_maps_owner_or_staff_select" on story_maps for select using (owns_story_room(story_room_id) or is_staff());
create policy "story_maps_staff_insert_update" on story_maps for all using (is_staff()) with check (is_staff());
create policy "story_capsules_owner_or_staff_select" on story_capsules for select using (owns_story_room(story_room_id) or is_staff());
create policy "story_capsules_staff_insert_update" on story_capsules for all using (is_staff()) with check (is_staff());
create policy "production_tasks_staff_all" on production_tasks for all using (is_staff()) with check (is_staff());

-- Partner/order attribution mostly staff-only for MVP
create policy "organizations_staff_all" on organizations for all using (is_staff()) with check (is_staff());
create policy "partners_staff_all" on partners for all using (is_staff()) with check (is_staff());
create policy "orders_owner_or_staff_select" on orders for select using (owns_story_room(story_room_id) or is_staff());
create policy "orders_staff_all" on orders for all using (is_staff()) with check (is_staff());
create policy "referral_attributions_staff_all" on referral_attributions for all using (is_staff()) with check (is_staff());

-- Indexes
create index if not exists idx_customer_accounts_owner on customer_accounts(owner_user_id);
create index if not exists idx_story_rooms_customer_account_id on story_rooms(customer_account_id);
create index if not exists idx_story_room_members_room_id on story_room_members(story_room_id);
create index if not exists idx_invites_token on invites(invite_token);
create index if not exists idx_contributions_room_status on contributions(story_room_id, review_status);
create index if not exists idx_artifacts_room_id on artifacts(story_room_id);
create index if not exists idx_import_events_room_status on import_events(story_room_id, status);
create index if not exists idx_memory_cards_room_status on memory_cards(story_room_id, status);
create index if not exists idx_story_maps_room_id on story_maps(story_room_id);
create index if not exists idx_story_capsules_room_id on story_capsules(story_room_id);
create index if not exists idx_production_tasks_room_status on production_tasks(story_room_id, status);
