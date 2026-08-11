-- Enable V1 nearby-life-circle burial without storing raw user coordinates.
-- Raw latitude/longitude are accepted only by the API request lifecycle, converted
-- to an HMAC cell id, and never written to PostgreSQL.

alter table public.melons
  add column if not exists burial_kind text not null default 'public_spot'
    check (burial_kind in ('public_spot', 'nearby_area')),
  add column if not exists nearby_city_id text,
  add column if not exists nearby_cell_id text;

alter table public.melons
  alter column spot_id drop not null;

alter table public.melons
  add constraint melons_burial_anchor_check
  check (
    (burial_kind = 'public_spot' and spot_id is not null and nearby_city_id is null and nearby_cell_id is null)
    or
    (burial_kind = 'nearby_area' and spot_id is null and nearby_city_id is not null and nearby_cell_id is not null)
  ) not valid;

create index if not exists melons_nearby_cell_idx
  on public.melons (nearby_city_id, nearby_cell_id, created_at desc)
  where burial_kind = 'nearby_area';

alter table public.melons
  add column if not exists create_operation_id uuid;

create unique index if not exists melons_author_create_operation_idx
  on public.melons (author_id, create_operation_id)
  where create_operation_id is not null;

create table if not exists public.melon_create_operations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  melon_id uuid not null references public.melons(id) on delete cascade,
  true_seed_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, operation_id)
);

alter table public.melon_create_operations enable row level security;
revoke all on public.melon_create_operations from public, anon, authenticated;

create or replace function public.create_nearby_melon(
  p_actor_id uuid,
  p_operation_id uuid,
  p_city_id text,
  p_nearby_cell_id text,
  p_topic public.safe_topic,
  p_title text,
  p_content text,
  p_reveal_mode text default 'open'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_actor_id;
  new_id uuid := gen_random_uuid();
  flags text[];
  new_status public.melon_status;
  maturity timestamptz;
  today_key text := to_char((statement_timestamp() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
  awarded boolean := false;
  inserted_count integer := 0;
  wallet jsonb;
  previous record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'invalid_operation'; end if;
  if p_reveal_mode not in ('open', 'seek_locked') then
    raise exception using errcode = '22023', message = 'invalid_reveal_mode';
  end if;

  if p_city_id not in ('changsha', 'beijing', 'shanghai', 'guangzhou', 'shenzhen') then
    raise exception using errcode = '22023', message = 'invalid_city';
  end if;

  if p_nearby_cell_id is null or length(p_nearby_cell_id) < 16 then
    raise exception using errcode = '22023', message = 'invalid_nearby_cell';
  end if;

  perform 1 from public.profiles
  where id = actor and account_status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_banned'; end if;

  if char_length(btrim(p_title)) not between 1 and 60 or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;

  select m.id, public.effective_melon_status(m.status, m.matures_at, m.completed_reads) as status, m.matures_at, op.true_seed_awarded
    into previous
  from public.melon_create_operations op
  join public.melons m on m.id = op.melon_id
  where op.profile_id = actor and op.operation_id = p_operation_id;

  if found then
    select jsonb_build_object('smallSeedCount', small_seed_count, 'trueSeedCount', true_seed_count)
      into wallet
    from public.profiles
    where id = actor;

    return jsonb_build_object(
      'id', previous.id,
      'status', previous.status,
      'maturesAt', previous.matures_at,
      'trueSeedAwarded', previous.true_seed_awarded,
      'wallet', wallet
    );
  end if;

  if (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_title) || E'\n' || btrim(p_content));
  new_status := case when cardinality(flags) > 0 then 'held'::public.melon_status else 'incubating'::public.melon_status end;
  maturity := case when new_status = 'incubating' then statement_timestamp() + interval '2 hours' else null end;

  insert into public.melons (
    id, author_id, spot_id, burial_kind, nearby_city_id, nearby_cell_id, create_operation_id,
    topic, title, content, status, safety_flags, matures_at, reveal_mode
  )
  values (
    new_id, actor, null, 'nearby_area', p_city_id, p_nearby_cell_id, p_operation_id,
    p_topic, btrim(p_title), btrim(p_content), new_status, flags, maturity, 'open'
  );

  if new_status = 'incubating' then
    insert into public.economy_ledger (
      beneficiary_id, reason, resource, amount, idempotency_key, melon_id
    ) values (
      actor,
      'true_seed_share',
      'true_seed',
      1,
      'share:' || actor::text || ':' || today_key,
      new_id
    )
    on conflict (idempotency_key) do nothing;
    get diagnostics inserted_count = row_count;
  end if;

  if inserted_count = 1 then
    update public.profiles set true_seed_count = true_seed_count + 1 where id = actor;
    awarded := true;
  end if;

  insert into public.melon_create_operations (profile_id, operation_id, melon_id, true_seed_awarded)
  values (actor, p_operation_id, new_id, awarded);

  select jsonb_build_object('smallSeedCount', small_seed_count, 'trueSeedCount', true_seed_count)
    into wallet
  from public.profiles
  where id = actor;

  return jsonb_build_object(
    'id', new_id,
    'status', new_status,
    'maturesAt', maturity,
    'trueSeedAwarded', awarded,
    'wallet', wallet
  );
end;
$$;

create or replace function public.create_melon(
  p_actor_id uuid,
  p_operation_id uuid,
  p_city_id text,
  p_spot_id uuid,
  p_topic public.safe_topic,
  p_title text,
  p_content text,
  p_reveal_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_actor_id;
  new_id uuid := gen_random_uuid();
  flags text[];
  new_status public.melon_status;
  maturity timestamptz;
  today_key text := to_char((statement_timestamp() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
  awarded boolean := false;
  inserted_count integer := 0;
  wallet jsonb;
  previous record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'invalid_operation'; end if;
  if p_reveal_mode not in ('open', 'seek_locked') then
    raise exception using errcode = '22023', message = 'invalid_reveal_mode';
  end if;

  perform 1 from public.profiles
  where id = actor and account_status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_banned'; end if;

  if char_length(btrim(p_title)) not between 1 and 60 or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;

  if not exists (select 1 from public.public_spots where id = p_spot_id and city_id = p_city_id and active) then
    raise exception using errcode = '22023', message = 'invalid_spot';
  end if;

  select m.id, public.effective_melon_status(m.status, m.matures_at, m.completed_reads) as status, m.matures_at, op.true_seed_awarded
    into previous
  from public.melon_create_operations op
  join public.melons m on m.id = op.melon_id
  where op.profile_id = actor and op.operation_id = p_operation_id;

  if found then
    select jsonb_build_object('smallSeedCount', small_seed_count, 'trueSeedCount', true_seed_count)
      into wallet
    from public.profiles
    where id = actor;

    return jsonb_build_object(
      'id', previous.id,
      'status', previous.status,
      'maturesAt', previous.matures_at,
      'trueSeedAwarded', previous.true_seed_awarded,
      'wallet', wallet
    );
  end if;

  if (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_title) || E'\n' || btrim(p_content));
  new_status := case when cardinality(flags) > 0 then 'held'::public.melon_status else 'incubating'::public.melon_status end;
  maturity := case when new_status = 'incubating' then statement_timestamp() + interval '2 hours' else null end;

  insert into public.melons (id, author_id, spot_id, burial_kind, create_operation_id, topic, title, content, status, safety_flags, matures_at, reveal_mode)
  values (new_id, actor, p_spot_id, 'public_spot', p_operation_id, p_topic, btrim(p_title), btrim(p_content), new_status, flags, maturity, 'open');

  if new_status = 'incubating' then
    insert into public.economy_ledger (
      beneficiary_id, reason, resource, amount, idempotency_key, melon_id
    ) values (
      actor,
      'true_seed_share',
      'true_seed',
      1,
      'share:' || actor::text || ':' || today_key,
      new_id
    )
    on conflict (idempotency_key) do nothing;
    get diagnostics inserted_count = row_count;
  end if;

  if inserted_count = 1 then
    update public.profiles set true_seed_count = true_seed_count + 1 where id = actor;
    awarded := true;
  end if;

  insert into public.melon_create_operations (profile_id, operation_id, melon_id, true_seed_awarded)
  values (actor, p_operation_id, new_id, awarded);

  select jsonb_build_object('smallSeedCount', small_seed_count, 'trueSeedCount', true_seed_count)
    into wallet
  from public.profiles
  where id = actor;

  return jsonb_build_object(
    'id', new_id,
    'status', new_status,
    'maturesAt', maturity,
    'trueSeedAwarded', awarded,
    'wallet', wallet
  );
end;
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
    select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id,
      'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
      'burialKind', m.burial_kind,
      'topic', m.topic,
      'cityId', coalesce(s.city_id, m.nearby_city_id),
      'districtId', coalesce(s.district_id, coalesce(m.nearby_city_id, 'nearby') || '-nearby'),
      'spot', case when m.burial_kind = 'nearby_area'
        then jsonb_build_object('id', 'nearby-life-circle', 'cityId', m.nearby_city_id, 'districtId', m.nearby_city_id || '-nearby', 'name', '附近生活圈')
        else jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name)
      end,
      'spotLatitude', coalesce(s.latitude, 0),
      'spotLongitude', coalesce(s.longitude, 0),
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'revealMode', 'open',
      'title', case when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature' then m.title else null end,
      'commentCount', case when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature'
        then (select count(*) from public.comments c where c.melon_id = m.id and not c.held)
        else null
      end,
      'createdAt', m.created_at
    )) as item
    from public.melons m
    left join public.public_spots s on s.id = m.spot_id and s.active
    where m.burial_kind = 'public_spot'
      and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
  ) candidates;
$$;

create or replace function public.get_discovery_candidates_for_visitor(
  p_city_id text,
  p_nearby_cell_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by item->>'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id,
      'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
      'burialKind', m.burial_kind,
      'topic', m.topic,
      'cityId', coalesce(s.city_id, m.nearby_city_id),
      'districtId', coalesce(s.district_id, coalesce(m.nearby_city_id, 'nearby') || '-nearby'),
      'spot', case when m.burial_kind = 'nearby_area'
        then jsonb_build_object('id', 'nearby-life-circle', 'cityId', m.nearby_city_id, 'districtId', m.nearby_city_id || '-nearby', 'name', '附近生活圈')
        else jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name)
      end,
      'spotLatitude', coalesce(s.latitude, 0),
      'spotLongitude', coalesce(s.longitude, 0),
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'revealMode', 'open',
      'title', case when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature' then m.title else null end,
      'commentCount', case when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature'
        then (select count(*) from public.comments c where c.melon_id = m.id and not c.held)
        else null
      end,
      'createdAt', m.created_at
    )) as item
    from public.melons m
    left join public.public_spots s on s.id = m.spot_id and s.active
    where public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
      and (
        m.burial_kind = 'public_spot'
        or (
          m.burial_kind = 'nearby_area'
          and m.nearby_city_id = p_city_id
          and p_nearby_cell_id is not null
          and m.nearby_cell_id = p_nearby_cell_id
        )
      )
  ) candidates;
$$;

revoke all on function public.create_melon(uuid, uuid, text, uuid, public.safe_topic, text, text, text) from public, anon, authenticated;
revoke all on function public.create_nearby_melon(uuid, uuid, text, text, public.safe_topic, text, text, text) from public, anon, authenticated;
revoke all on function public.get_discovery_candidates_for_visitor(text, text) from public, anon, authenticated;
grant execute on function public.create_melon(uuid, uuid, text, uuid, public.safe_topic, text, text, text) to service_role;
grant execute on function public.create_nearby_melon(uuid, uuid, text, text, public.safe_topic, text, text, text) to service_role;
grant execute on function public.get_discovery_candidates_for_visitor(text, text) to service_role;
