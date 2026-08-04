create extension if not exists pgcrypto;

create type public.city_opening_status as enum ('gathering', 'countdown', 'open');
create type public.melon_status as enum ('incubating', 'mature', 'archived', 'held', 'removed');
create type public.safe_topic as enum ('daily', 'work', 'relationship', 'food', 'neighborhood');
create type public.reaction_type as enum ('juicy', 'wild', 'hug', 'follow_up');
create type public.report_target_type as enum ('melon', 'comment');
create type public.report_reason as enum ('privacy', 'harassment', 'illegal', 'spam', 'other');
create type public.seed_reason as enum ('read_complete', 'author_read');

create table public.cities (
  id text primary key check (id in ('changsha', 'beijing', 'shanghai', 'guangzhou', 'shenzhen')),
  name text not null unique,
  opening_status public.city_opening_status not null default 'gathering',
  opens_at timestamptz,
  created_at timestamptz not null default now(),
  check ((opening_status = 'countdown') = (opens_at is not null))
);

create table public.districts (
  id text primary key,
  city_id text not null references public.cities(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (city_id, name),
  unique (id, city_id)
);

create table public.public_spots (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete restrict,
  district_id text not null,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, district_id, name),
  foreign key (district_id, city_id) references public.districts(id, city_id) on delete restrict
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null unique check (char_length(alias) between 2 and 40),
  animal text not null check (char_length(animal) between 1 and 20),
  seed_count integer not null default 0 check (seed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.melons (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  spot_id uuid not null references public.public_spots(id) on delete restrict,
  topic public.safe_topic not null,
  title text not null check (char_length(title) between 1 and 60),
  content text not null check (char_length(content) between 1 and 1000),
  status public.melon_status not null default 'incubating',
  safety_flags text[] not null default '{}',
  matures_at timestamptz,
  completed_reads integer not null default 0 check (completed_reads >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'held' and matures_at is null)
    or (status <> 'held' and matures_at is not null)
  )
);

create index melons_discovery_idx on public.melons (status, matures_at, created_at desc);
create index melons_spot_idx on public.melons (spot_id, created_at desc);
create index melons_author_idx on public.melons (author_id, created_at desc);

create table public.melon_completions (
  id uuid primary key default gen_random_uuid(),
  melon_id uuid not null references public.melons(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (melon_id, reader_id)
);

create index melon_completions_reader_day_idx
  on public.melon_completions (reader_id, completed_at desc);

create table public.seed_ledger (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.profiles(id) on delete cascade,
  reason public.seed_reason not null,
  amount smallint not null default 1 check (amount = 1),
  melon_id uuid not null references public.melons(id) on delete cascade,
  source_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (beneficiary_id, reason, melon_id, source_user_id)
);

create table public.squats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  melon_id uuid not null references public.melons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, melon_id)
);

create table public.reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  melon_id uuid not null references public.melons(id) on delete cascade,
  reaction public.reaction_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, melon_id)
);

create index reactions_melon_idx on public.reactions (melon_id, reaction);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  melon_id uuid not null references public.melons(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 140),
  safety_flags text[] not null default '{}',
  held boolean not null default false,
  created_at timestamptz not null default now()
);

create index comments_melon_idx on public.comments (melon_id, created_at);
create index comments_author_rate_idx on public.comments (author_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index reports_reporter_rate_idx on public.reports (reporter_id, created_at desc);

alter table public.cities enable row level security;
alter table public.districts enable row level security;
alter table public.public_spots enable row level security;
alter table public.profiles enable row level security;
alter table public.melons enable row level security;
alter table public.melon_completions enable row level security;
alter table public.seed_ledger enable row level security;
alter table public.squats enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

create policy cities_are_public on public.cities for select to anon, authenticated using (true);
create policy districts_are_public on public.districts for select to anon, authenticated using (true);
create policy active_spots_are_public on public.public_spots for select to anon, authenticated using (active);
create policy profile_owner_can_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_seed_ledger on public.seed_ledger for select to authenticated using (beneficiary_id = (select auth.uid()));
create policy own_squats on public.squats for select to authenticated using (user_id = (select auth.uid()));
create policy own_reactions on public.reactions for select to authenticated using (user_id = (select auth.uid()));
create policy own_reports on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

revoke all on public.profiles, public.melons, public.melon_completions, public.seed_ledger,
  public.squats, public.reactions, public.comments, public.reports from anon, authenticated;
grant select on public.cities, public.districts, public.public_spots to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger melons_touch_updated_at before update on public.melons
for each row execute function public.touch_updated_at();
create trigger reactions_touch_updated_at before update on public.reactions
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_anonymous_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  animals constant text[] := array['猹', '水豚', '狐狸', '熊猫', '青蛙', '仓鼠'];
  chosen_animal text;
  chosen_alias text;
begin
  chosen_animal := animals[1 + floor(random() * array_length(animals, 1))::integer];
  loop
    chosen_alias := chosen_animal || ' ' || lpad(floor(random() * 100000)::integer::text, 5, '0');
    begin
      insert into public.profiles (id, alias, animal) values (new.id, chosen_alias, chosen_animal);
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_anonymous_user();

create or replace function public.content_safety_flags(p_text text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p_text ~* '(微信|威信|vx|v信|qq|扣扣|telegram|whatsapp|手机号|电话|加我)[[:space:][:punct:]]*[a-z0-9_-]{5,}' then 'contact' end,
    case when p_text ~ '1[3-9][0-9][ -]?[0-9]{4}[ -]?[0-9]{4}' then 'phone' end,
    case when p_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' then 'email' end,
    case when p_text ~ '(住址|家庭住址|身份证号|门牌号|几栋几单元|[0-9]{1,4}号楼[0-9]{1,4}室)' then 'precise_address' end,
    case when p_text ~ '(人肉|开盒|身份证|银行卡号|杀人|制毒|贩毒)' then 'illegal_or_doxxing' end
  ], null);
$$;

create or replace function public.effective_melon_status(p_status public.melon_status, p_matures_at timestamptz, p_reads integer)
returns public.melon_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status in ('held', 'removed') then p_status
    when p_matures_at <= now() - interval '24 hours' and p_reads = 0 then 'archived'::public.melon_status
    when p_matures_at <= now() then 'mature'::public.melon_status
    else 'incubating'::public.melon_status
  end;
$$;

create or replace function public.create_melon(
  p_spot_id uuid,
  p_topic public.safe_topic,
  p_title text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  new_id uuid;
  flags text[];
  new_status public.melon_status;
  maturity timestamptz;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if char_length(btrim(p_title)) not between 1 and 60 or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  if not exists (select 1 from public.public_spots where id = p_spot_id and active) then
    raise exception using errcode = '22023', message = 'invalid_spot';
  end if;
  if (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_title) || E'\n' || btrim(p_content));
  new_status := case when cardinality(flags) > 0 then 'held'::public.melon_status else 'incubating'::public.melon_status end;
  maturity := case when new_status = 'incubating' then now() + interval '2 hours' else null end;

  insert into public.melons (author_id, spot_id, topic, title, content, status, safety_flags, matures_at)
  values (actor, p_spot_id, p_topic, btrim(p_title), btrim(p_content), new_status, flags, maturity)
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'status', new_status, 'maturesAt', maturity);
end;
$$;

create or replace function public.complete_melon_read(p_melon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader uuid := auth.uid();
  melon_author uuid;
  melon_reads integer;
  current_seed_count integer;
  inserted_count integer;
  daily_reads integer;
  reader_awarded boolean := false;
  author_awarded boolean := false;
begin
  if reader is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;

  select author_id, completed_reads into melon_author, melon_reads
  from public.melons
  where id = p_melon_id
    and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  insert into public.melon_completions (melon_id, reader_id)
  values (p_melon_id, reader)
  on conflict (melon_id, reader_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select seed_count into current_seed_count from public.profiles where id = reader;
    return jsonb_build_object(
      'counted', false,
      'readerSeedAwarded', false,
      'authorSeedAwarded', false,
      'readerSeedCount', current_seed_count,
      'completedReads', melon_reads
    );
  end if;

  update public.melons
  set completed_reads = completed_reads + 1,
      status = 'mature'
  where id = p_melon_id
  returning completed_reads into melon_reads;

  select count(*) into daily_reads
  from public.melon_completions
  where reader_id = reader
    and completed_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  if daily_reads <= 3 then
    insert into public.seed_ledger (beneficiary_id, reason, melon_id, source_user_id)
    values (reader, 'read_complete', p_melon_id, reader)
    on conflict do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      update public.profiles set seed_count = seed_count + 1 where id = reader;
      reader_awarded := true;
    end if;
  end if;

  if melon_author <> reader then
    insert into public.seed_ledger (beneficiary_id, reason, melon_id, source_user_id)
    values (melon_author, 'author_read', p_melon_id, reader)
    on conflict do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      update public.profiles set seed_count = seed_count + 1 where id = melon_author;
      author_awarded := true;
    end if;
  end if;

  select seed_count into current_seed_count from public.profiles where id = reader;
  return jsonb_build_object(
    'counted', true,
    'readerSeedAwarded', reader_awarded,
    'authorSeedAwarded', author_awarded,
    'readerSeedCount', current_seed_count,
    'completedReads', melon_reads
  );
end;
$$;

create or replace function public.set_melon_squat(p_melon_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if not exists (select 1 from public.melons where id = p_melon_id and status not in ('held', 'removed')) then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;
  if p_active then
    insert into public.squats (user_id, melon_id) values (actor, p_melon_id) on conflict do nothing;
  else
    delete from public.squats where user_id = actor and melon_id = p_melon_id;
  end if;
  return jsonb_build_object('active', p_active);
end;
$$;

create or replace function public.set_melon_reaction(p_melon_id uuid, p_reaction public.reaction_type)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare counts jsonb;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  insert into public.reactions (user_id, melon_id, reaction)
  values (actor, p_melon_id, p_reaction)
  on conflict (user_id, melon_id) do update set reaction = excluded.reaction;

  select jsonb_build_object(
    'juicy', count(*) filter (where reaction = 'juicy'),
    'wild', count(*) filter (where reaction = 'wild'),
    'hug', count(*) filter (where reaction = 'hug'),
    'follow_up', count(*) filter (where reaction = 'follow_up')
  ) into counts from public.reactions where melon_id = p_melon_id;
  return counts;
end;
$$;

create or replace function public.add_melon_comment(p_melon_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare new_comment public.comments;
declare flags text[];
declare author_alias text;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if char_length(btrim(p_content)) not between 1 and 140 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;
  if (select count(*) from public.comments where author_id = actor and created_at >= now() - interval '1 hour') >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_content));
  insert into public.comments (melon_id, author_id, content, safety_flags, held)
  values (p_melon_id, actor, btrim(p_content), flags, cardinality(flags) > 0)
  returning * into new_comment;
  if new_comment.held then raise exception using errcode = 'P0001', message = 'content_held'; end if;

  select alias into author_alias from public.profiles where id = actor;
  return jsonb_build_object(
    'id', new_comment.id,
    'melonId', new_comment.melon_id,
    'alias', author_alias,
    'content', new_comment.content,
    'createdAt', new_comment.created_at
  );
end;
$$;

create or replace function public.create_content_report(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_details is not null and char_length(btrim(p_details)) > 500 then
    raise exception using errcode = '22023', message = 'invalid_details_length';
  end if;
  if (select count(*) from public.reports where reporter_id = actor and created_at >= now() - interval '24 hours') >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  if p_target_type = 'melon' and not exists (select 1 from public.melons where id = p_target_id) then
    raise exception using errcode = 'P0002', message = 'target_not_found';
  end if;
  if p_target_type = 'comment' and not exists (select 1 from public.comments where id = p_target_id) then
    raise exception using errcode = 'P0002', message = 'target_not_found';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (actor, p_target_type, p_target_id, p_reason, nullif(btrim(p_details), ''))
  on conflict (reporter_id, target_type, target_id) do nothing;
  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('alias', p.alias, 'animal', p.animal, 'seedCount', p.seed_count)
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.get_city_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(city_item order by city_item->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'districts', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from public.districts d where d.city_id = c.id
      ), '[]'::jsonb),
      'spots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'cityId', s.city_id,
          'districtId', s.district_id,
          'name', s.name
        ) order by s.name)
        from public.public_spots s where s.city_id = c.id and s.active
      ), '[]'::jsonb),
      'opening', jsonb_build_object(
        'cityId', c.id,
        'status', c.opening_status,
        'safeMelons', (select count(*) from public.melons m join public.public_spots s on s.id = m.spot_id where s.city_id = c.id and m.status not in ('held', 'removed')),
        'distinctAuthors', (select count(distinct m.author_id) from public.melons m join public.public_spots s on s.id = m.spot_id where s.city_id = c.id and m.status not in ('held', 'removed')),
        'distinctSpots', (select count(distinct m.spot_id) from public.melons m join public.public_spots s on s.id = m.spot_id where s.city_id = c.id and m.status not in ('held', 'removed')),
        'distinctTopics', (select count(distinct m.topic) from public.melons m join public.public_spots s on s.id = m.spot_id where s.city_id = c.id and m.status not in ('held', 'removed')),
        'opensAt', c.opens_at
      )
    ) as city_item
    from public.cities c
  ) catalog;
$$;

create or replace function public.get_discovery_candidates()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by item->>'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id,
      'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
      'topic', m.topic,
      'cityId', s.city_id,
      'districtId', s.district_id,
      'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
      'spotLatitude', s.latitude,
      'spotLongitude', s.longitude,
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'createdAt', m.created_at
    ) as item
    from public.melons m
    join public.public_spots s on s.id = m.spot_id and s.active
    where public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
  ) candidates;
$$;

create or replace function public.get_melon_detail(p_melon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'status', 'mature',
    'topic', m.topic,
    'cityId', s.city_id,
    'districtId', s.district_id,
    'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
    'distanceBand', 'remote',
    'completedReads', m.completed_reads,
    'isRemote', true,
    'alias', p.alias,
    'title', m.title,
    'content', m.content,
    'createdAt', m.created_at,
    'squatted', exists(select 1 from public.squats q where q.melon_id = m.id and q.user_id = auth.uid()),
    'reactions', jsonb_build_object(
      'juicy', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'juicy'),
      'wild', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'wild'),
      'hug', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'hug'),
      'follow_up', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'follow_up')
    )
  )
  from public.melons m
  join public.public_spots s on s.id = m.spot_id
  join public.profiles p on p.id = m.author_id
  where m.id = p_melon_id
    and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature';
$$;

create or replace function public.get_field_view(p_alias text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'seedCount', p.seed_count,
    'melons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
        'topic', m.topic,
        'cityId', s.city_id,
        'districtId', s.district_id,
        'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
        'distanceBand', 'remote',
        'maturesAt', m.matures_at,
        'completedReads', m.completed_reads,
        'isRemote', true
      ) order by m.created_at desc)
      from public.melons m
      join public.public_spots s on s.id = m.spot_id
      where m.author_id = p.id
        and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
    ), '[]'::jsonb)
  )
  from public.profiles p
  where (p_alias is null and p.id = auth.uid()) or (p_alias is not null and p.alias = p_alias)
  limit 1;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_anonymous_user() from public, anon, authenticated;
revoke all on function public.content_safety_flags(text) from public, anon, authenticated;
revoke all on function public.effective_melon_status(public.melon_status, timestamptz, integer) from public, anon, authenticated;

revoke all on function public.create_melon(uuid, public.safe_topic, text, text) from public, anon;
revoke all on function public.complete_melon_read(uuid) from public, anon;
revoke all on function public.set_melon_squat(uuid, boolean) from public, anon;
revoke all on function public.set_melon_reaction(uuid, public.reaction_type) from public, anon;
revoke all on function public.add_melon_comment(uuid, text) from public, anon;
revoke all on function public.create_content_report(public.report_target_type, uuid, public.report_reason, text) from public, anon;
revoke all on function public.get_current_profile() from public, anon;
revoke all on function public.get_city_catalog() from public;
revoke all on function public.get_discovery_candidates() from public, anon;
revoke all on function public.get_melon_detail(uuid) from public, anon;
revoke all on function public.get_field_view(text) from public, anon;
grant execute on function public.create_melon(uuid, public.safe_topic, text, text) to authenticated;
grant execute on function public.complete_melon_read(uuid) to authenticated;
grant execute on function public.set_melon_squat(uuid, boolean) to authenticated;
grant execute on function public.set_melon_reaction(uuid, public.reaction_type) to authenticated;
grant execute on function public.add_melon_comment(uuid, text) to authenticated;
grant execute on function public.create_content_report(public.report_target_type, uuid, public.report_reason, text) to authenticated;
grant execute on function public.get_current_profile() to authenticated;
grant execute on function public.get_city_catalog() to anon, authenticated;
grant execute on function public.get_discovery_candidates() to authenticated;
grant execute on function public.get_melon_detail(uuid) to authenticated;
grant execute on function public.get_field_view(text) to authenticated;
