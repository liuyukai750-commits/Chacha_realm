-- Permanent public-id/password accounts with one-time recovery secrets.
-- Raw passwords, recovery codes and IP addresses never enter public tables.

create table if not exists public.account_recovery_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  secret_digest text not null check (secret_digest ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.account_recovery_credentials enable row level security;
revoke all on public.account_recovery_credentials from public, anon, authenticated;

create table if not exists public.account_login_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  login_email text not null unique check (login_email ~ '^[a-f0-9-]+@accounts\.chachajie\.invalid$'),
  created_at timestamptz not null default now()
);

alter table public.account_login_credentials enable row level security;
revoke all on public.account_login_credentials from public, anon, authenticated;

create table if not exists public.auth_credential_attempts (
  id bigint generated always as identity primary key,
  identity_digest text not null check (identity_digest ~ '^[0-9a-f]{64}$'),
  ip_digest text not null check (ip_digest ~ '^[0-9a-f]{64}$'),
  action text not null check (action in ('register', 'login', 'recover')),
  created_at timestamptz not null default now()
);

create index if not exists auth_credential_attempts_identity_idx
  on public.auth_credential_attempts (identity_digest, action, created_at desc);
create index if not exists auth_credential_attempts_ip_idx
  on public.auth_credential_attempts (ip_digest, action, created_at desc);

alter table public.auth_credential_attempts enable row level security;
revoke all on public.auth_credential_attempts from public, anon, authenticated;

create or replace function public.reserve_account_auth_attempt(
  p_identity_digest text,
  p_ip_digest text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_count integer;
  ip_count integer;
begin
  if p_identity_digest !~ '^[0-9a-f]{64}$'
     or p_ip_digest !~ '^[0-9a-f]{64}$'
     or p_action not in ('register', 'login', 'recover') then
    raise exception using errcode = '22023', message = 'invalid_auth_attempt';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_identity_digest || ':' || p_action, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_ip_digest || ':' || p_action, 0));
  delete from public.auth_credential_attempts where created_at < now() - interval '2 days';

  select count(*) into identity_count
  from public.auth_credential_attempts
  where identity_digest = p_identity_digest
    and action = p_action
    and created_at >= now() - interval '15 minutes';

  select count(*) into ip_count
  from public.auth_credential_attempts
  where ip_digest = p_ip_digest
    and action = p_action
    and created_at >= now() - interval '15 minutes';

  if identity_count >= 10 or ip_count >= 40 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.auth_credential_attempts (identity_digest, ip_digest, action)
  values (p_identity_digest, p_ip_digest, p_action);
  return jsonb_build_object('reserved', true);
end;
$$;

create or replace function public.account_auth_target(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_row public.profiles%rowtype;
begin
  select p.* into profile_row
  from public.profiles p
  join public.account_login_credentials c on c.profile_id = p.id
  where p.public_id = upper(p_public_id);
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'userId', profile_row.id,
    'publicId', profile_row.public_id,
    'accountStatus', profile_row.account_status,
    'loginEmail', (select login_email from public.account_login_credentials where profile_id = profile_row.id)
  );
end;
$$;

create or replace function public.account_auth_target_by_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_row public.profiles%rowtype;
begin
  select * into profile_row from public.profiles where id = p_user_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'userId', profile_row.id,
    'publicId', profile_row.public_id,
    'accountStatus', profile_row.account_status,
    'loginEmail', (select login_email from public.account_login_credentials where profile_id = profile_row.id)
  );
end;
$$;

create or replace function public.set_account_login_credential(
  p_actor_id uuid,
  p_login_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_login_email !~ '^[a-f0-9-]+@accounts\.chachajie\.invalid$'
     or not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '22023', message = 'invalid_login_credential';
  end if;
  insert into public.account_login_credentials (profile_id, login_email)
  values (p_actor_id, p_login_email)
  on conflict (profile_id) do update set login_email = excluded.login_email;
  return jsonb_build_object('saved', true);
end;
$$;

create or replace function public.set_account_recovery_secret(
  p_actor_id uuid,
  p_secret_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret_digest !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '22023', message = 'invalid_recovery_secret';
  end if;
  insert into public.account_recovery_credentials (profile_id, secret_digest)
  values (p_actor_id, p_secret_digest)
  on conflict (profile_id) do update
  set secret_digest = excluded.secret_digest,
      version = public.account_recovery_credentials.version + 1,
      updated_at = now();
  return jsonb_build_object('saved', true);
end;
$$;

create or replace function public.rotate_account_recovery_secret(
  p_public_id text,
  p_current_digest text,
  p_new_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_status public.account_status;
begin
  if p_current_digest !~ '^[0-9a-f]{64}$' or p_new_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_recovery_secret';
  end if;

  select p.id, p.account_status into actor_id, actor_status
  from public.profiles p
  join public.account_recovery_credentials r on r.profile_id = p.id
  where p.public_id = upper(p_public_id)
    and r.secret_digest = p_current_digest
  for update of r;

  if actor_id is null then
    return null;
  end if;
  if actor_status <> 'active' then
    raise exception using errcode = '42501', message = 'account_banned';
  end if;

  update public.account_recovery_credentials
  set secret_digest = p_new_digest,
      version = version + 1,
      updated_at = now()
  where profile_id = actor_id;

  return jsonb_build_object(
    'userId', actor_id,
    'loginEmail', (select login_email from public.account_login_credentials where profile_id = actor_id)
  );
end;
$$;

create or replace function public.complete_current_profile(
  p_display_name text,
  p_animal text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
     or not exists (
       select 1 from auth.users
       where id = actor
         and (
           phone is not null
           or email like '%@accounts.chachajie.invalid'
           or raw_app_meta_data ->> 'chacha_auth_kind' = 'password'
         )
     ) then
    raise exception using errcode = '42501', message = 'permanent_account_required';
  end if;
  if p_display_name is null
     or char_length(p_display_name) not between 1 and 6
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[一-鿿A-Za-z0-9]+$'
     or p_display_name ~* '(官方|客服|管理员|系统|平台|猹猹街|政府|公安|警察|微信|加我|手机|电话|色情|约炮|赌博|博彩)'
     or p_animal not in ('猹', '水豚', '狐狸', '熊猫', '青蛙', '仓鼠') then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  select * into profile_row from public.profiles where id = actor for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if profile_row.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'account_banned';
  end if;
  if profile_row.onboarding_completed_at is null then
    update public.profiles
    set display_name = p_display_name,
        animal = p_animal,
        onboarding_completed_at = now()
    where id = actor;
  end if;
  return public.get_current_profile();
end;
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'displayName', p.display_name,
    'publicId', p.public_id,
    'maskedPhone', case
      when u.phone is null then null
      else substr(right(u.phone, 11), 1, 3) || '****' || right(u.phone, 4)
    end,
    'onboardingComplete', p.onboarding_completed_at is not null,
    'authKind', case
      when coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then 'anonymous'
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
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

revoke all on function public.reserve_account_auth_attempt(text, text, text) from public, anon, authenticated;
revoke all on function public.account_auth_target(text) from public, anon, authenticated;
revoke all on function public.account_auth_target_by_user(uuid) from public, anon, authenticated;
revoke all on function public.set_account_login_credential(uuid, text) from public, anon, authenticated;
revoke all on function public.set_account_recovery_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.rotate_account_recovery_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_account_auth_attempt(text, text, text) to service_role;
grant execute on function public.account_auth_target(text) to service_role;
grant execute on function public.account_auth_target_by_user(uuid) to service_role;
grant execute on function public.set_account_login_credential(uuid, text) to service_role;
grant execute on function public.set_account_recovery_secret(uuid, text) to service_role;
grant execute on function public.rotate_account_recovery_secret(text, text, text) to service_role;
grant execute on function public.complete_current_profile(text, text) to authenticated;
grant execute on function public.get_current_profile() to authenticated;

comment on table public.account_recovery_credentials is
  'HMAC digests only. A recovery code is returned once and never stored in plaintext.';
comment on table public.account_login_credentials is
  'Random internal Supabase login handles. Never return them in public DTOs or logs.';
comment on table public.auth_credential_attempts is
  'Rate-limit digests only. Raw public ids and IP addresses are never stored.';
