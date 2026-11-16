create table if not exists public.persona_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  verification_type text not null
    check (verification_type in ('identity', 'employer')),
  inquiry_id text not null unique,
  template_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'needs_review', 'rejected', 'expired', 'superseded')),
  consented_at timestamptz not null default now(),
  last_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persona_verification_attempts_user_type_created_idx
  on public.persona_verification_attempts (user_id, verification_type, created_at desc);
create unique index if not exists persona_verification_attempts_one_pending_per_type_idx
  on public.persona_verification_attempts (user_id, verification_type)
  where status = 'pending';

create table if not exists public.persona_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created_at timestamptz not null,
  processed_at timestamptz
);

alter table public.persona_verification_attempts enable row level security;
alter table public.persona_webhook_events enable row level security;
revoke all on public.persona_verification_attempts from anon, authenticated;
revoke all on public.persona_webhook_events from anon, authenticated;
grant all on public.persona_verification_attempts to service_role;
grant all on public.persona_webhook_events to service_role;

update public.marketplace_profiles
set profile = profile - 'taxId',
    updated_at = now()
where role = 'employer'
  and profile ? 'taxId';

create or replace function public.apply_persona_verification_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_inquiry_id text,
  p_verification_status text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.persona_verification_attempts%rowtype;
  v_processed_at timestamptz;
  v_profile_key text;
begin
  if p_verification_status not in ('verified', 'needs_review', 'rejected', 'expired') then
    raise exception 'Unsupported Persona verification status';
  end if;

  insert into public.persona_webhook_events (
    event_id,
    event_type,
    event_created_at
  ) values (
    p_event_id,
    p_event_type,
    p_event_created_at
  )
  on conflict (event_id) do nothing;

  select processed_at
  into v_processed_at
  from public.persona_webhook_events
  where event_id = p_event_id
  for update;

  if v_processed_at is not null then
    return 'duplicate';
  end if;

  select *
  into v_attempt
  from public.persona_verification_attempts
  where inquiry_id = p_inquiry_id
  for update;

  if not found then
    update public.persona_webhook_events
    set processed_at = now()
    where event_id = p_event_id;
    return 'unmatched';
  end if;

  if v_attempt.status = 'superseded'
     or (
       v_attempt.last_event_created_at is not null
       and v_attempt.last_event_created_at >= p_event_created_at
     ) then
    update public.persona_webhook_events
    set processed_at = now()
    where event_id = p_event_id;
    return 'stale';
  end if;

  update public.persona_verification_attempts
  set status = p_verification_status,
      last_event_created_at = p_event_created_at,
      updated_at = now()
  where id = v_attempt.id;

  v_profile_key := case v_attempt.verification_type
    when 'identity' then 'identityVerificationStatus'
    else 'businessVerificationStatus'
  end;

  update public.marketplace_profiles
  set profile = jsonb_set(
        coalesce(profile, '{}'::jsonb),
        array[v_profile_key],
        to_jsonb(p_verification_status),
        true
      ),
      verification_status = case
        when v_attempt.verification_type = 'employer' and p_verification_status = 'verified'
          then 'approved'
        when v_attempt.verification_type = 'employer' and p_verification_status = 'rejected'
          then 'rejected'
        else verification_status
      end,
      updated_at = now()
  where user_id = v_attempt.user_id;

  update public.persona_webhook_events
  set processed_at = now()
  where event_id = p_event_id;

  return 'processed';
end;
$$;

revoke all on function public.apply_persona_verification_event(text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_persona_verification_event(text, text, timestamptz, text, text)
  to service_role;
