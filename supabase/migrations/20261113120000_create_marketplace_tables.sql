create table if not exists public.marketplace_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('candidate', 'employer', 'admin')),
  profile jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'approved', 'rejected')),
  is_snoozed boolean not null default false,
  last_check_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_profiles_role_status_idx
  on public.marketplace_profiles (role, verification_status, last_check_in_at);

create table if not exists public.job_invites (
  id uuid primary key default gen_random_uuid(),
  employer_user_id uuid not null references public.marketplace_profiles (user_id) on delete cascade,
  candidate_user_id uuid not null references public.marketplace_profiles (user_id) on delete cascade,
  profile jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  candidate_contacted_externally boolean not null default false,
  candidate_archived boolean not null default false,
  viewed_by_candidate boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists job_invites_employer_created_idx
  on public.job_invites (employer_user_id, created_at desc);
create index if not exists job_invites_candidate_created_idx
  on public.job_invites (candidate_user_id, created_at desc);

create table if not exists public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists marketplace_notifications_user_created_idx
  on public.marketplace_notifications (user_id, created_at desc);

alter table public.marketplace_profiles enable row level security;
alter table public.job_invites enable row level security;
alter table public.marketplace_notifications enable row level security;

revoke all on public.marketplace_profiles from anon, authenticated;
revoke all on public.job_invites from anon, authenticated;
revoke all on public.marketplace_notifications from anon, authenticated;
grant all on public.marketplace_profiles to service_role;
grant all on public.job_invites to service_role;
grant all on public.marketplace_notifications to service_role;

create policy "Users can read their own marketplace profile"
  on public.marketplace_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Invite participants can read their invites"
  on public.job_invites
  for select
  to authenticated
  using (auth.uid() = employer_user_id or auth.uid() = candidate_user_id);

create policy "Users can read their own notifications"
  on public.marketplace_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);
