-- A field owner can reopen their own submission before maturity or while it
-- is held, without making that content public. Mature melons remain readable
-- by other users. Nearby melons use only their synthetic coarse spot here.
create or replace function public.get_melon_detail_for_actor(p_melon_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;

  select jsonb_build_object(
    'id', m.id,
    'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
    'burialKind', m.burial_kind,
    'topic', m.topic,
    'cityId', coalesce(s.city_id, m.nearby_city_id),
    'districtId', coalesce(s.district_id, m.nearby_city_id || '-nearby'),
    'spot', case when m.burial_kind = 'nearby_area'
      then jsonb_build_object(
        'id', 'nearby-life-circle',
        'cityId', m.nearby_city_id,
        'districtId', m.nearby_city_id || '-nearby',
        'name', '附近生活圈'
      )
      else jsonb_build_object(
        'id', s.id,
        'cityId', s.city_id,
        'districtId', s.district_id,
        'name', s.name
      )
    end,
    'distanceBand', 'remote',
    'maturesAt', m.matures_at,
    'completedReads', m.completed_reads,
    'isRemote', true,
    'revealMode', m.reveal_mode,
    'alias', p.alias,
    'title', m.title,
    'content', m.content,
    'createdAt', m.created_at,
    'squatted', exists(select 1 from public.squats q where q.melon_id = m.id and q.user_id = p_actor_id),
    'reactions', jsonb_build_object(
      'juicy', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'juicy'),
      'wild', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'wild'),
      'hug', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'hug'),
      'follow_up', (select count(*) from public.reactions r where r.melon_id = m.id and r.reaction = 'follow_up')
    )
  ) into result
  from public.melons m
  left join public.public_spots s on s.id = m.spot_id
  join public.profiles p on p.id = m.author_id
  where m.id = p_melon_id
    and m.status <> 'removed'
    and (
      m.author_id = p_actor_id
      or public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature'
    )
    and (
      (m.burial_kind = 'public_spot' and s.id is not null)
      or (m.burial_kind = 'nearby_area' and m.nearby_city_id is not null)
    );
  return result;
end;
$$;

revoke all on function public.get_melon_detail_for_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to service_role;
