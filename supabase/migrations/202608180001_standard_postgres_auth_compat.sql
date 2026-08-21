-- Source-side preparation for moving password accounts away from Supabase Auth.
-- This migration is additive: the running application continues to use GoTrue.
-- Raw passwords, session tokens and recovery codes are never stored.

create table if not exists public.local_auth_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_digest text not null,
  password_algorithm text not null check (password_algorithm in ('bcrypt', 'argon2id')),
  credential_version integer not null default 1 check (credential_version > 0),
  must_rotate boolean not null default false,
  password_changed_at timestamptz not null,
  source_user_updated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (password_algorithm = 'bcrypt' and password_digest ~ '^[$]2[aby][$][0-9]{2}[$].{53}$')
    or
    (password_algorithm = 'argon2id' and password_digest ~ '^[$]argon2id[$]')
  )
);

create table if not exists public.local_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  rotated_from uuid references public.local_auth_sessions(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text check (
    revocation_reason is null
    or revocation_reason in ('logout', 'rotation', 'password_change', 'recovery', 'account_banned', 'admin', 'suspected_reuse')
  ),
  ip_digest text check (ip_digest is null or ip_digest ~ '^[0-9a-f]{64}$'),
  user_agent_digest text check (user_agent_digest is null or user_agent_digest ~ '^[0-9a-f]{64}$'),
  check (idle_expires_at <= absolute_expires_at),
  check ((revoked_at is null) = (revocation_reason is null))
);

create index if not exists local_auth_sessions_profile_active_idx
  on public.local_auth_sessions (profile_id, absolute_expires_at desc)
  where revoked_at is null;
create index if not exists local_auth_sessions_family_idx
  on public.local_auth_sessions (family_id, created_at desc);

create table if not exists public.local_auth_security_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'login_success', 'login_failure', 'session_rotated', 'session_revoked',
    'password_changed', 'recovery_used', 'suspected_reuse'
  )),
  identity_digest text check (identity_digest is null or identity_digest ~ '^[0-9a-f]{64}$'),
  ip_digest text check (ip_digest is null or ip_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists local_auth_security_events_profile_idx
  on public.local_auth_security_events (profile_id, created_at desc);
create index if not exists local_auth_security_events_identity_idx
  on public.local_auth_security_events (identity_digest, created_at desc)
  where identity_digest is not null;

alter table public.local_auth_credentials enable row level security;
alter table public.local_auth_sessions enable row level security;
alter table public.local_auth_security_events enable row level security;

revoke all on public.local_auth_credentials, public.local_auth_sessions,
  public.local_auth_security_events from public, anon, authenticated;

-- Snapshot only password-backed accounts. Phone-only and anonymous users cannot
-- be converted to public-id/password accounts without an explicit credential setup.
insert into public.local_auth_credentials (
  profile_id,
  password_digest,
  password_algorithm,
  password_changed_at,
  source_user_updated_at
)
select
  u.id,
  u.encrypted_password,
  'bcrypt',
  coalesce(u.updated_at, u.created_at, statement_timestamp()),
  u.updated_at
from auth.users u
join public.profiles p on p.id = u.id
join public.account_login_credentials c
  on c.profile_id = u.id and c.login_email = u.email
where u.encrypted_password ~ '^[$]2[aby][$][0-9]{2}[$].{53}$'
on conflict (profile_id) do nothing;

-- A legacy phone account may be upgraded in place to public-id/password while
-- retaining the same UUID and all business data. Password identity must win
-- over the historical phone column or the client will repeatedly offer the
-- obsolete phone transition flow.
create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'displayName', p.display_name,
    'publicId', p.public_id,
    'identityBadge', p.identity_badge,
    'maskedPhone', case
      when u.phone is null then null
      else substr(right(u.phone, 11), 1, 3) || '****' || right(u.phone, 4)
    end,
    'onboardingComplete', p.onboarding_completed_at is not null,
    'authKind', case
      when coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then 'anonymous'
      when exists (select 1 from public.account_login_credentials c where c.profile_id = p.id)
        or exists (select 1 from public.local_auth_credentials lc where lc.profile_id = p.id)
        then 'password'
      when u.phone is not null then 'phone'
      else 'password'
    end,
    'wallet', jsonb_build_object(
      'smallSeedCount', p.small_seed_count,
      'trueSeedCount', p.true_seed_count
    ),
    'experience', jsonb_build_object(
      'total', p.experience,
      'fromReads', p.experience_from_reads,
      'fromHarvests', p.experience_from_harvests
    ),
    'accountStatus', p.account_status
  ))
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

comment on table public.local_auth_credentials is
  'Migration compatibility hashes only. Never return password digests through an API or log.';
comment on table public.local_auth_sessions is
  'Post-Supabase opaque session token digests. Active GoTrue sessions are intentionally not migrated.';
comment on table public.local_auth_security_events is
  'Minimal local-auth audit metadata; contains digests, never raw IP, public id, password or token.';
