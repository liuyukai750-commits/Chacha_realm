-- Phone identity and profile onboarding. Phone numbers stay in auth.users only.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists public_id text,
  add column if not exists onboarding_completed_at timestamptz;

create or replace function public.generate_chacha_public_id()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := 'CC-';
  index integer;
begin
  for index in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, index) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

do $$
declare
  profile_row record;
  candidate text;
begin
  for profile_row in select id from public.profiles where public_id is null loop
    loop
      candidate := public.generate_chacha_public_id();
      exit when not exists (select 1 from public.profiles where public_id = candidate);
    end loop;
    update public.profiles set public_id = candidate where id = profile_row.id;
  end loop;
end;
$$;

alter table public.profiles alter column public_id set not null;
alter table public.profiles alter column public_id set default public.generate_chacha_public_id();
create unique index if not exists profiles_public_id_unique_idx on public.profiles (public_id);

alter table public.profiles
  drop constraint if exists profiles_display_name_format,
  add constraint profiles_display_name_format check (
    display_name is null
    or (
      char_length(display_name) between 1 and 6
      and display_name = btrim(display_name)
    )
  ),
  drop constraint if exists profiles_animal_identity_choices,
  add constraint profiles_animal_identity_choices check (
    animal in ('猹', '水豚', '狐狸', '熊猫', '青蛙', '仓鼠')
  );

create table if not exists public.auth_phone_attempts (
  id bigint generated always as identity primary key,
  phone_digest text not null check (char_length(phone_digest) = 64),
  ip_digest text not null check (char_length(ip_digest) = 64),
  action text not null check (action in ('request', 'verify')),
  created_at timestamptz not null default now()
);

create index if not exists auth_phone_attempts_phone_idx
  on public.auth_phone_attempts (phone_digest, action, created_at desc);
create index if not exists auth_phone_attempts_ip_idx
  on public.auth_phone_attempts (ip_digest, action, created_at desc);

alter table public.auth_phone_attempts enable row level security;
revoke all on public.auth_phone_attempts from public, anon, authenticated;

create or replace function public.reserve_phone_auth_attempt(
  p_phone_digest text,
  p_ip_digest text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_attempt timestamptz;
  phone_count integer;
  ip_count integer;
begin
  if p_phone_digest !~ '^[0-9a-f]{64}$'
     or p_ip_digest !~ '^[0-9a-f]{64}$'
     or p_action not in ('request', 'verify') then
    raise exception using errcode = '22023', message = 'invalid_auth_attempt';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_digest || ':' || p_action, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_ip_digest || ':' || p_action, 0));
  delete from public.auth_phone_attempts where created_at < now() - interval '2 days';

  if p_action = 'request' then
    select max(created_at), count(*) filter (where created_at >= now() - interval '1 day')
      into last_attempt, phone_count
    from public.auth_phone_attempts
    where phone_digest = p_phone_digest and action = 'request';

    select count(*) into ip_count
    from public.auth_phone_attempts
    where ip_digest = p_ip_digest
      and action = 'request'
      and created_at >= now() - interval '1 hour';

    if last_attempt > now() - interval '60 seconds'
       or phone_count >= 10
       or ip_count >= 30 then
      raise exception using errcode = 'P0001', message = 'rate_limited';
    end if;
  else
    select count(*) into phone_count
    from public.auth_phone_attempts
    where phone_digest = p_phone_digest
      and action = 'verify'
      and created_at >= now() - interval '10 minutes';

    select count(*) into ip_count
    from public.auth_phone_attempts
    where ip_digest = p_ip_digest
      and action = 'verify'
      and created_at >= now() - interval '10 minutes';

    if phone_count >= 10 or ip_count >= 30 then
      raise exception using errcode = 'P0001', message = 'rate_limited';
    end if;
  end if;

  insert into public.auth_phone_attempts (phone_digest, ip_digest, action)
  values (p_phone_digest, p_ip_digest, p_action);
  return jsonb_build_object('reserved', true);
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
       where id = actor and phone is not null
     ) then
    raise exception using errcode = '42501', message = 'phone_account_required';
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

  -- Onboarding is intentionally immutable in V1. Retrying the same request is safe.
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

-- Auth deletion must be able to cascade through a user's authored melons.
alter table public.melons drop constraint if exists melons_author_id_fkey;
alter table public.melons
  add constraint melons_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

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
      else 'phone'
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

revoke all on function public.generate_chacha_public_id() from public, anon, authenticated;
revoke all on function public.reserve_phone_auth_attempt(text, text, text) from public, anon, authenticated;
revoke all on function public.complete_current_profile(text, text) from public, anon;
grant execute on function public.reserve_phone_auth_attempt(text, text, text) to service_role;
grant execute on function public.complete_current_profile(text, text) to authenticated;
grant execute on function public.get_current_profile() to authenticated;

comment on table public.auth_phone_attempts is
  'Rate-limit digests only. Raw phone numbers and IP addresses are never persisted here.';
comment on column public.profiles.public_id is
  'Stable public identifier. Internal auth.users UUID remains private and owns all data.';

-- Keep alias for old links, while every new public DTO also carries the
-- user-chosen display name and non-guessable public id. The wrapper approach
-- preserves the already-tested moderation, visibility, and field rules.
create or replace function public.profile_public_identity(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_strip_nulls(jsonb_build_object(
    'displayName', coalesce(p.display_name, p.alias),
    'publicId', p.public_id
  )), '{}'::jsonb)
  from public.profiles p
  where p.id = p_profile_id;
$$;

alter function public.get_melon_detail_for_actor(uuid, uuid)
  rename to get_melon_detail_for_actor_legacy_identity;

create or replace function public.get_melon_detail_for_actor(p_melon_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  author_id uuid;
begin
  result := public.get_melon_detail_for_actor_legacy_identity(p_melon_id, p_actor_id);
  if result is null then return null; end if;
  select m.author_id into author_id from public.melons m where m.id = p_melon_id;
  return result || public.profile_public_identity(author_id);
end;
$$;

alter function public.get_melon_comments(uuid, timestamptz, uuid, integer)
  rename to get_melon_comments_legacy_identity;

create or replace function public.get_melon_comments(
  p_melon_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 21
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    page.item || public.profile_public_identity(c.author_id)
    order by page.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.get_melon_comments_legacy_identity(
      p_melon_id, p_cursor_created_at, p_cursor_id, p_limit
    )
  ) with ordinality as page(item, ordinality)
  join public.comments c on c.id = (page.item->>'id')::uuid;
$$;

alter function public.add_melon_comment(uuid, uuid, text)
  rename to add_melon_comment_legacy_identity;

create or replace function public.add_melon_comment(
  p_actor_id uuid,
  p_melon_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result := public.add_melon_comment_legacy_identity(p_actor_id, p_melon_id, p_content);
  if result->'comment' is not null then
    result := jsonb_set(
      result,
      '{comment}',
      (result->'comment') || public.profile_public_identity(p_actor_id)
    );
  end if;
  return result;
end;
$$;

alter function public.field_view_for_profile(uuid, boolean)
  rename to field_view_for_profile_legacy_identity;

create or replace function public.field_view_for_profile(
  p_profile_id uuid,
  p_include_private boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.field_view_for_profile_legacy_identity(p_profile_id, p_include_private)
    || public.profile_public_identity(p_profile_id);
$$;

create or replace function public.get_field_view(p_alias text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;
  if p_alias is null then
    target_id := auth.uid();
  else
    select p.id into target_id
    from public.profiles p
    where p.public_id = upper(p_alias) or p.alias = p_alias
    order by (p.public_id = upper(p_alias)) desc
    limit 1;
  end if;
  if target_id is null then return null; end if;
  return public.field_view_for_profile(target_id, p_alias is null);
end;
$$;

revoke all on function public.profile_public_identity(uuid) from public, anon, authenticated;
revoke all on function public.get_melon_detail_for_actor_legacy_identity(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_melon_comments_legacy_identity(uuid, timestamptz, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.add_melon_comment_legacy_identity(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.field_view_for_profile_legacy_identity(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_melon_detail_for_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_melon_comment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_melon_comments(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to service_role;
grant execute on function public.add_melon_comment(uuid, uuid, text) to service_role;
grant execute on function public.get_melon_comments(uuid, timestamptz, uuid, integer) to authenticated;
