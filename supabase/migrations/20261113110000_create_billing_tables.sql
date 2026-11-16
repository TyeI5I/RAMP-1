create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_name text not null,
  billing_email text not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive'
    check (subscription_status in (
      'inactive', 'active', 'trialing', 'past_due', 'canceled',
      'unpaid', 'incomplete', 'incomplete_expired', 'paused'
    )),
  subscription_tier text not null default 'none'
    check (subscription_tier in ('none', 'tier1', 'tier2')),
  subscription_cadence text
    check (subscription_cadence is null or subscription_cadence in ('monthly', 'annual')),
  current_period_end timestamptz,
  alert_categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon, authenticated;
grant select on public.billing_accounts to authenticated;
grant all on public.billing_accounts to service_role;

create policy "Users can read their own billing account"
  on public.billing_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.stripe_webhook_events to service_role;
