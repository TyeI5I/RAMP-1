alter table public.marketplace_notifications
  add column if not exists dedupe_key text;

create unique index if not exists marketplace_notifications_dedupe_key_idx
  on public.marketplace_notifications (dedupe_key);

create table if not exists public.transactional_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null unique,
  recipient text not null,
  subject text not null,
  html_body text not null,
  text_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists transactional_email_outbox_pending_idx
  on public.transactional_email_outbox (next_attempt_at)
  where status in ('pending', 'failed');

alter table public.transactional_email_outbox enable row level security;
revoke all on public.transactional_email_outbox from anon, authenticated;
grant all on public.transactional_email_outbox to service_role;
