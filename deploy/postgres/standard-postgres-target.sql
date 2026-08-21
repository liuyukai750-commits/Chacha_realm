-- Run after restoring the public schema and data into a standard PostgreSQL
-- target. `auth` is a compatibility schema, not Supabase Auth/GoTrue.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'chacha_app') then
    create role chacha_app nologin;
  end if;
end;
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  encrypted_password text,
  phone text,
  is_anonymous boolean not null default false,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.local_auth_credentials') is null
     or to_regclass('public.local_auth_sessions') is null then
    raise exception using
      errcode = 'P0001',
      message = 'standard_postgres_restore_incomplete';
  end if;
end;
$$;

-- The Supabase source attached this trigger to auth.users. The auth schema is
-- rebuilt locally on a standard PostgreSQL target, so recreate the trigger
-- explicitly or new password registrations will not receive a profiles row.
do $$
begin
  if to_regprocedure('public.handle_new_anonymous_user()') is null then
    raise exception using
      errcode = 'P0001',
      message = 'registration_profile_trigger_function_missing';
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_anonymous_user();

-- UUID ownership remains in public.profiles. Removing this Supabase-era FK
-- lets the compatibility identity row be retired independently without
-- rewriting any business UUID or child relationship.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

create or replace function public.get_profile_for_actor(
  p_actor_id uuid,
  p_is_anonymous boolean default false
)
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
      when p_is_anonymous then 'anonymous'
      when exists (
        select 1 from public.local_auth_credentials lc where lc.profile_id = p.id
      ) then 'password'
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
  left join auth.users u on u.id = p.id
  where p.id = p_actor_id;
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_profile_for_actor(
    auth.uid(),
    coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );
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
       select 1 from public.local_auth_credentials c where c.profile_id = actor
     ) then
    raise exception using errcode = '42501', message = 'permanent_account_required';
  end if;
  if p_display_name is null
     or char_length(p_display_name) not between 1 and 12
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[一-鿿A-Za-z0-9]+$'
     or p_display_name = '猹猹国王'
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
        onboarding_completed_at = statement_timestamp()
    where id = actor;
  end if;
  return public.get_current_profile();
end;
$$;

-- Preserve RLS and callable-function boundaries. The application connects
-- through a dedicated database login that owns no tables.
alter table public.local_auth_credentials enable row level security;
alter table public.local_auth_sessions enable row level security;
alter table public.local_auth_security_events enable row level security;

-- `chacha_app` is a server-only role. RLS still applies to its direct table
-- access, so explicitly allow rows here and keep the actual operation boundary
-- in the narrow GRANT list below. Browser-facing roles receive no membership.
drop policy if exists chacha_app_profiles on public.profiles;
create policy chacha_app_profiles on public.profiles
  for all to chacha_app using (true) with check (true);
drop policy if exists chacha_app_account_login_credentials on public.account_login_credentials;
create policy chacha_app_account_login_credentials on public.account_login_credentials
  for all to chacha_app using (true) with check (true);
drop policy if exists chacha_app_account_recovery_credentials on public.account_recovery_credentials;
create policy chacha_app_account_recovery_credentials on public.account_recovery_credentials
  for all to chacha_app using (true) with check (true);
drop policy if exists chacha_app_local_auth_credentials on public.local_auth_credentials;
create policy chacha_app_local_auth_credentials on public.local_auth_credentials
  for all to chacha_app using (true) with check (true);
drop policy if exists chacha_app_local_auth_sessions on public.local_auth_sessions;
create policy chacha_app_local_auth_sessions on public.local_auth_sessions
  for all to chacha_app using (true) with check (true);
drop policy if exists chacha_app_local_auth_security_events on public.local_auth_security_events;
create policy chacha_app_local_auth_security_events on public.local_auth_security_events
  for all to chacha_app using (true) with check (true);

revoke all on function public.get_profile_for_actor(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.get_profile_for_actor(uuid, boolean) to service_role;

grant usage on schema public, auth to chacha_app;
grant select on public.public_spots, public.profiles,
  public.local_auth_credentials, public.account_recovery_credentials
  to chacha_app;
grant insert, update, delete on auth.users to chacha_app;
grant delete on public.profiles to chacha_app;
grant insert, update on public.account_login_credentials,
  public.account_recovery_credentials, public.local_auth_credentials
  to chacha_app;
grant select, insert, update on public.local_auth_sessions,
  public.local_auth_security_events
  to chacha_app;

-- The source functions were written for Supabase/PostgREST and some
-- server-only functions still inspect a service-role JWT claim. Standard
-- PostgreSQL has no PostgREST claim; explicit EXECUTE grants to the dedicated
-- application role are the authorization gate.
do $$
declare
  signature text;
  target regprocedure;
  definition text;
  legacy_jwt_guard constant text := E'\\n[[:space:]]*if[[:space:]]+coalesce\\(auth\\.jwt\\(\\)[[:space:]]*->>[[:space:]]*''role'',[[:space:]]*''''\\)[[:space:]]*<>[[:space:]]*''service_role''[[:space:]]+then[[:space:]]*\\n[[:space:]]*raise[[:space:]]+exception[[:space:]]+using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''42501'',[[:space:]]*message[[:space:]]*=[[:space:]]*''service_role_required'';[[:space:]]*\\n[[:space:]]*end[[:space:]]+if;';
  service_functions constant text[] := array[
    'public.create_melon_v3(uuid,uuid,text,text,uuid,double precision,double precision,public.safe_topic,text,text,text)',
    'public.create_melon_v4(uuid,uuid,text,text,uuid,double precision,double precision,public.safe_topic,text,text,text)',
    'public.get_admin_overview()'
  ];
begin
  foreach signature in array service_functions loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'required service function is missing: %', signature;
    end if;
    definition := pg_get_functiondef(target::oid);
    if position('service_role_required' in definition) > 0 then
      definition := regexp_replace(definition, legacy_jwt_guard, '', 'i');
      if position('service_role_required' in definition) > 0 then
        raise exception 'could not remove legacy JWT guard from %', signature;
      end if;
      execute definition;
    end if;
  end loop;
end;
$$;

revoke all on function public.create_melon_v3(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) from public, anon, authenticated;

grant execute on function public.get_city_catalog() to chacha_app;
grant execute on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision) to chacha_app;
grant execute on function public.get_melon_basket_exclusions(uuid) to chacha_app;
grant execute on function public.create_melon_v4(uuid, uuid, text, text, uuid, double precision, double precision, public.safe_topic, text, text, text) to chacha_app;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to chacha_app;
grant execute on function public.complete_melon_read(uuid, uuid) to chacha_app;
grant execute on function public.set_melon_squat(uuid, uuid, boolean) to chacha_app;
grant execute on function public.set_melon_reaction(uuid, uuid, public.reaction_type, boolean) to chacha_app;
grant execute on function public.set_melon_basket_dismissal(uuid, uuid, boolean) to chacha_app;
grant execute on function public.delete_own_melon(uuid, uuid) to chacha_app;
grant execute on function public.get_melon_presence_target_v2(uuid, uuid, double precision, double precision) to chacha_app;
grant execute on function public.get_melon_read_policy(uuid, uuid) to chacha_app;
grant execute on function public.get_melon_comments(uuid, timestamptz, uuid, integer) to chacha_app;
grant execute on function public.add_melon_comment(uuid, uuid, text) to chacha_app;
grant execute on function public.get_squat_shelf_for_actor(uuid) to chacha_app;
grant execute on function public.mark_squat_alert_seen_for_actor(uuid, uuid) to chacha_app;
grant execute on function public.get_field_view_for_actor(uuid, text) to chacha_app;
grant execute on function public.plant_field_melon_for_actor(uuid, smallint, uuid) to chacha_app;
grant execute on function public.harvest_field_for_actor(uuid) to chacha_app;
grant execute on function public.create_content_report_for_actor(uuid, public.report_target_type, uuid, public.report_reason, text) to chacha_app;
grant execute on function public.reserve_account_auth_attempt(text, text, text) to chacha_app;
grant execute on function public.account_auth_target(text) to chacha_app;
grant execute on function public.account_auth_target_by_user(uuid) to chacha_app;
grant execute on function public.reserve_phone_auth_attempt(text, text, text) to chacha_app;
grant execute on function public.get_admin_overview() to chacha_app;
grant execute on function public.complete_profile_for_actor(uuid, text, text) to chacha_app;
grant execute on function public.get_profile_for_actor(uuid, boolean) to chacha_app;

comment on schema auth is
  'Standard PostgreSQL compatibility namespace. No Supabase Auth service is present.';
comment on table auth.users is
  'Minimal identity compatibility rows; password authority lives in local_auth_credentials.';
