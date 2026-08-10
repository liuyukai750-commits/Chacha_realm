-- Split mature melons into open small melons and on-site seek-locked melons.
-- Exact location and presence credentials remain outside PostgreSQL.

alter table public.melons
  add column reveal_mode text not null default 'open'
  check (reveal_mode in ('open', 'seek_locked'));

revoke all on function public.create_melon(uuid, public.safe_topic, text, text) from public, anon, authenticated;

create or replace function public.create_melon(
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
declare result jsonb;
begin
  if p_reveal_mode not in ('open', 'seek_locked') then
    raise exception using errcode = '22023', message = 'invalid_reveal_mode';
  end if;

  result := public.create_melon(p_spot_id, p_topic, p_title, p_content);
  update public.melons
  set reveal_mode = p_reveal_mode
  where id = (result ->> 'id')::uuid;
  return result;
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
      'topic', m.topic,
      'cityId', s.city_id,
      'districtId', s.district_id,
      'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
      'spotLatitude', s.latitude,
      'spotLongitude', s.longitude,
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'revealMode', m.reveal_mode,
      'title', case
        when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature' then m.title
        else null
      end,
      'commentCount', case
        when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature'
          then (select count(*) from public.comments c where c.melon_id = m.id and not c.held)
        else null
      end,
      'createdAt', m.created_at
    )) as item
    from public.melons m
    join public.public_spots s on s.id = m.spot_id and s.active
    where public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
  ) candidates;
$$;

create or replace function public.get_melon_detail_for_actor(p_melon_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;

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
  join public.public_spots s on s.id = m.spot_id
  join public.profiles p on p.id = m.author_id
  where m.id = p_melon_id
    and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature';
  return result;
end;
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
        'isRemote', true,
        'revealMode', m.reveal_mode
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

revoke all on function public.create_melon(uuid, public.safe_topic, text, text, text) from public, anon;
revoke all on function public.get_melon_detail(uuid) from public, anon, authenticated;
revoke all on function public.get_melon_detail_for_actor(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_melon(uuid, public.safe_topic, text, text, text) to authenticated;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to service_role;

comment on column public.melons.reveal_mode is
  'open melons can be read anywhere; seek_locked melons require a server-verified found-level public-spot presence token.';
