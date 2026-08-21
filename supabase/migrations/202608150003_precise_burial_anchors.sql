-- Freeze the two burial modes:
-- 1. nearby_area uses the phone position captured at publish time as a fixed,
--    private anchor and is discoverable only within 1 km of that point.
-- 2. public_spot uses the configured public-zone centre, is readable city-wide,
--    and grants comment presence only within 1 km of that centre.

create table if not exists public.melon_location_anchors (
  melon_id uuid primary key references public.melons(id) on delete cascade,
  city_id text not null check (city_id in ('changsha', 'beijing', 'shanghai', 'guangzhou', 'shenzhen')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default statement_timestamp()
);

alter table public.melon_location_anchors enable row level security;
revoke all on public.melon_location_anchors from public, anon, authenticated;

create index if not exists melon_location_anchors_city_idx
  on public.melon_location_anchors (city_id, melon_id);

create or replace function public.private_distance_meters(
  p_from_latitude double precision,
  p_from_longitude double precision,
  p_to_latitude double precision,
  p_to_longitude double precision
)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select 6371000.0 * 2.0 * asin(
    sqrt(
      least(1.0, greatest(0.0,
        power(sin(radians(p_to_latitude - p_from_latitude) / 2.0), 2.0)
        + cos(radians(p_from_latitude)) * cos(radians(p_to_latitude))
        * power(sin(radians(p_to_longitude - p_from_longitude) / 2.0), 2.0)
      ))
    )
  );
$$;

revoke all on function public.private_distance_meters(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;

create or replace function public.create_nearby_melon_v2(
  p_actor_id uuid,
  p_operation_id uuid,
  p_city_id text,
  p_latitude double precision,
  p_longitude double precision,
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
  result jsonb;
  created_melon_id uuid;
  compatibility_cell text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'invalid_location';
  end if;

  -- Keep the legacy column populated for schema compatibility. It is no
  -- longer used for discovery or presence decisions.
  compatibility_cell := pg_catalog.md5(p_latitude::text || ':' || p_longitude::text);
  result := public.create_nearby_melon(
    p_actor_id,
    p_operation_id,
    p_city_id,
    compatibility_cell,
    p_topic,
    p_title,
    p_content,
    p_reveal_mode
  );
  created_melon_id := (result ->> 'id')::uuid;

  insert into public.melon_location_anchors (melon_id, city_id, latitude, longitude)
  values (created_melon_id, p_city_id, p_latitude, p_longitude)
  on conflict (melon_id) do nothing;

  return result;
end;
$$;

create or replace function public.get_discovery_candidates_for_visitor_v2(
  p_city_id text,
  p_latitude double precision default null,
  p_longitude double precision default null
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
      'cityId', coalesce(s.city_id, anchor.city_id),
      'districtId', coalesce(s.district_id, anchor.city_id || '-nearby'),
      'spot', case when m.burial_kind = 'nearby_area'
        then jsonb_build_object('id', 'nearby-life-circle', 'cityId', anchor.city_id, 'districtId', anchor.city_id || '-nearby', 'name', '附近生活圈')
        else jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name)
      end,
      'distanceMeters', case
        when p_latitude is null or p_longitude is null then null
        when m.burial_kind = 'nearby_area' then public.private_distance_meters(p_latitude, p_longitude, anchor.latitude, anchor.longitude)
        else public.private_distance_meters(p_latitude, p_longitude, s.latitude, s.longitude)
      end,
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
    left join public.melon_location_anchors anchor on anchor.melon_id = m.id
    where public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
      and (
        (m.burial_kind = 'public_spot' and s.city_id = p_city_id)
        or (
          m.burial_kind = 'nearby_area'
          and anchor.city_id = p_city_id
          and p_latitude is not null
          and p_longitude is not null
          and public.private_distance_meters(p_latitude, p_longitude, anchor.latitude, anchor.longitude) <= 1000
        )
      )
  ) candidates;
$$;

create or replace function public.get_melon_presence_target_v2(
  p_melon_id uuid,
  p_actor_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'burialKind', m.burial_kind,
    'withinOneKm', case
      when m.burial_kind = 'nearby_area' and anchor.melon_id is not null
        then public.private_distance_meters(p_latitude, p_longitude, anchor.latitude, anchor.longitude) <= 1000
      when m.burial_kind = 'public_spot' and s.id is not null
        then public.private_distance_meters(p_latitude, p_longitude, s.latitude, s.longitude) <= 1000
      else false
    end
  )
  from public.melons m
  left join public.public_spots s on s.id = m.spot_id and s.active
  left join public.melon_location_anchors anchor on anchor.melon_id = m.id
  where m.id = p_melon_id
    and exists (select 1 from public.profiles p where p.id = p_actor_id and p.account_status = 'active')
    and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature';
$$;

create or replace function public.get_melon_read_policy(
  p_melon_id uuid,
  p_actor_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'burialKind', m.burial_kind,
    'isOwner', m.author_id = p_actor_id
  )
  from public.melons m
  where m.id = p_melon_id
    and exists (select 1 from public.profiles p where p.id = p_actor_id and p.account_status = 'active');
$$;

revoke all on function public.create_nearby_melon_v2(uuid, uuid, text, double precision, double precision, public.safe_topic, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.get_melon_presence_target_v2(uuid, uuid, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.get_melon_read_policy(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_melon_comments(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.create_nearby_melon_v2(uuid, uuid, text, double precision, double precision, public.safe_topic, text, text, text)
  to service_role;
grant execute on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  to service_role;
grant execute on function public.get_melon_presence_target_v2(uuid, uuid, double precision, double precision)
  to service_role;
grant execute on function public.get_melon_read_policy(uuid, uuid)
  to service_role;
grant execute on function public.get_melon_comments(uuid, timestamptz, uuid, integer)
  to service_role;
