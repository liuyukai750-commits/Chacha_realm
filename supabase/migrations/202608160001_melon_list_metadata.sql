-- List surfaces need stable public identity and creation time without exposing
-- auth ids, phone numbers or exact nearby coordinates.

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
  with base as (
    select public.field_view_for_profile_legacy_identity(p_profile_id, p_include_private) as value
  ), enriched_melons as (
    select coalesce(jsonb_agg(
      jsonb_strip_nulls(
        item
        || jsonb_build_object(
          'title', case
            when p_include_private or public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature' then m.title
            else null
          end,
          'createdAt', m.created_at
        )
        || (public.profile_public_identity(m.author_id) - 'publicId')
      ) order by m.created_at desc
    ), '[]'::jsonb) as items
    from base b
    cross join lateral jsonb_array_elements(coalesce(b.value->'melons', '[]'::jsonb)) item
    join public.melons m on m.id = (item->>'id')::uuid
  )
  select jsonb_set(
    b.value || public.profile_public_identity(p_profile_id),
    '{melons}',
    e.items,
    true
  )
  from base b cross join enriched_melons e;
$$;

revoke all on function public.field_view_for_profile(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.get_squat_shelf()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare result jsonb;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;

  with shelf_rows as (
    select
      s.created_at as squatted_at,
      s.mature_seen_at,
      m.*,
      public.effective_melon_status(m.status, m.matures_at, m.completed_reads) as effective_status,
      coalesce(ps.city_id, m.nearby_city_id) as resolved_city_id,
      coalesce(ps.district_id, 'nearby') as resolved_district_id,
      coalesce(ps.name, '附近生活圈') as resolved_spot_name,
      coalesce(ps.id::text, 'nearby:' || m.nearby_city_id) as resolved_spot_id
    from public.squats s
    join public.melons m on m.id = s.melon_id
    left join public.public_spots ps on ps.id = m.spot_id
    where s.user_id = actor
      and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
  ), items as (
    select jsonb_build_object(
      'melon', jsonb_strip_nulls(jsonb_build_object(
        'id', r.id,
        'status', r.effective_status,
        'burialKind', r.burial_kind,
        'topic', r.topic,
        'cityId', r.resolved_city_id,
        'districtId', r.resolved_district_id,
        'spot', jsonb_build_object(
          'id', r.resolved_spot_id,
          'cityId', r.resolved_city_id,
          'districtId', r.resolved_district_id,
          'name', r.resolved_spot_name
        ),
        'distanceBand', 'remote',
        'maturesAt', r.matures_at,
        'completedReads', r.completed_reads,
        'title', case when r.effective_status = 'mature' then r.title else null end,
        'commentCount', case when r.effective_status = 'mature'
          then (select count(*) from public.comments c where c.melon_id = r.id and not c.held)
          else null end,
        'createdAt', r.created_at,
        'isRemote', true,
        'revealMode', r.reveal_mode
      ) || (public.profile_public_identity(r.author_id) - 'publicId')),
      'squattedAt', r.squatted_at,
      'alertKind', case when r.effective_status = 'mature' and r.mature_seen_at is null then 'mature' else null end,
      'unread', r.effective_status = 'mature' and r.mature_seen_at is null
    ) as item,
    r.effective_status,
    r.mature_seen_at,
    r.matures_at,
    r.squatted_at
    from shelf_rows r
  )
  select jsonb_build_object(
    'unreadCount', count(*) filter (where effective_status = 'mature' and mature_seen_at is null),
    'items', coalesce(jsonb_agg(item order by
      (effective_status = 'mature' and mature_seen_at is null) desc,
      (effective_status = 'mature') desc,
      matures_at asc,
      squatted_at desc
    ), '[]'::jsonb)
  ) into result
  from items;

  return result;
end;
$$;

revoke all on function public.get_squat_shelf() from public, anon;
grant execute on function public.get_squat_shelf() to authenticated;

comment on function public.get_squat_shelf() is
  'On-demand squat shelf with public nickname, animal and creation time; returns no coordinates or auth identifiers.';
