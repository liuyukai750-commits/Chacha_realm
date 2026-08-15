-- Discovery cards show only the author's chosen public nickname and animal.
-- Exact coordinates remain private inputs used solely for server-side distance checks.
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
    select jsonb_strip_nulls(
      jsonb_build_object(
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
      ) || (public.profile_public_identity(m.author_id) - 'publicId')
    ) as item
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

revoke all on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  to service_role;
