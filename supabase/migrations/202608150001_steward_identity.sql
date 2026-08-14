-- A single, service-managed founder identity. Ordinary profiles can never
-- claim the reserved display name or badge through onboarding APIs.
alter table public.profiles
  add column if not exists identity_badge text;

alter table public.profiles
  drop constraint if exists profiles_identity_badge_allowed,
  add constraint profiles_identity_badge_allowed
    check (identity_badge is null or identity_badge = 'steward');

create unique index if not exists profiles_single_steward_idx
  on public.profiles (identity_badge)
  where identity_badge = 'steward';

alter table public.profiles
  drop constraint if exists profiles_reserved_steward_name,
  add constraint profiles_reserved_steward_name
    check (display_name is distinct from '猹猹国王' or identity_badge = 'steward')
    not valid;

create or replace function public.assign_steward_identity(
  p_public_id text,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  result jsonb;
begin
  select p.id into target_id
  from public.profiles p
  where p.public_id = upper(btrim(p_public_id))
  for update;

  if target_id is null then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;

  if p_enabled then
    -- Clean up any pre-migration use of the newly reserved nickname only when
    -- the real steward is assigned, so rollout never strands the owner.
    update public.profiles
    set display_name = alias
    where id <> target_id
      and display_name = '猹猹国王';

    update public.profiles
    set display_name = '猹猹国王',
        identity_badge = 'steward'
    where id = target_id;
  else
    update public.profiles
    set display_name = case when display_name = '猹猹国王' then alias else display_name end,
        identity_badge = null
    where id = target_id;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'displayName', p.display_name,
    'publicId', p.public_id,
    'identityBadge', p.identity_badge
  )) into result
  from public.profiles p
  where p.id = target_id;

  return result;
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

create or replace function public.profile_public_identity(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_strip_nulls(jsonb_build_object(
    'displayName', coalesce(p.display_name, p.alias),
    'publicId', p.public_id,
    'identityBadge', p.identity_badge
  )), '{}'::jsonb)
  from public.profiles p
  where p.id = p_profile_id;
$$;

revoke all on function public.assign_steward_identity(text, boolean) from public, anon, authenticated;
revoke all on function public.profile_public_identity(uuid) from public, anon, authenticated;
grant execute on function public.assign_steward_identity(text, boolean) to service_role;
grant execute on function public.complete_current_profile(text, text) to authenticated;
grant execute on function public.get_current_profile() to authenticated;

comment on column public.profiles.identity_badge is
  'Service-managed public identity marker. Null for ordinary users; steward is reserved for the project owner.';
comment on function public.assign_steward_identity(text, boolean) is
  'Service-only assignment for the single 猹猹街主理人 identity.';
