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

create or replace function public.create_nearby_melon(
  p_actor_id uuid,
  p_city_id text,
  p_nearby_cell_id text,
  p_topic text,
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
  new_status text := 'incubating';
  maturity timestamptz := statement_timestamp() + interval '2 hours';
  today_key text := to_char((statement_timestamp() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
  awarded boolean := false;
  wallet jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  if p_city_id not in ('changsha', 'beijing', 'shanghai', 'guangzhou', 'shenzhen') then
    raise exception using errcode = '22023', message = 'invalid_city';
  end if;

  if p_nearby_cell_id is null or length(p_nearby_cell_id) < 16 then
    raise exception using errcode = '22023', message = 'invalid_nearby_cell';
  end if;

  if (select account_status from public.profiles where id = actor) = 'banned' then
    raise exception using errcode = '42501', message = 'account_banned';
  end if;

  if (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = '23514', message = 'daily_melon_limit';
  end if;

  insert into public.melons (id, author_id, spot_id, burial_kind, nearby_city_id, nearby_cell_id, topic, title, content, status, matures_at, reveal_mode)
  values (new_id, actor, null, 'nearby_area', p_city_id, p_nearby_cell_id, p_topic, btrim(p_title), btrim(p_content), new_status, maturity, 'open');

  insert into public.seed_ledger (profile_id, reason, resource, amount, melon_id, idempotency_key)
  values (actor, 'true_seed_share', 'true_seed', 1, new_id, 'share:' || actor || ':' || today_key)
  on conflict (idempotency_key) do nothing;

  get diagnostics awarded = row_count;
  if awarded then
    update public.profiles set true_seed_count = true_seed_count + 1 where id = actor;
  end if;

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
      'nearbyCellId', m.nearby_cell_id,
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
  ) candidates;
$$;
