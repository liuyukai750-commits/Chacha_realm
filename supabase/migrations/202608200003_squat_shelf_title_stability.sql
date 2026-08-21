-- Keep the author's title visible while a squatted melon is still incubating.
-- Interaction totals and actor state remain authoritative in the database;
-- this function only shapes the user's persisted squat shelf.

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
        'title', r.title,
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
grant execute on function public.get_squat_shelf() to authenticated, service_role;

comment on function public.get_squat_shelf() is
  'Persisted squat shelf with author titles for both incubating and mature melons; returns no coordinates or auth identifiers.';
