create table if not exists public.employer_team_seats (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references public.marketplace_profiles (user_id) on delete cascade,
  member_user_id uuid unique references public.marketplace_profiles (user_id) on delete cascade,
  member_email text not null,
  seat_role text not null check (seat_role in ('manager', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  unique (manager_user_id, member_email)
);

create index if not exists employer_team_seats_manager_idx
  on public.employer_team_seats (manager_user_id, created_at);

alter table public.employer_team_seats enable row level security;
revoke all on public.employer_team_seats from anon, authenticated;
grant all on public.employer_team_seats to service_role;
