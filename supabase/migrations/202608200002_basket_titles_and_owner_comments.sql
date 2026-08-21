-- Keep the user's title visible while a melon incubates, and expose an
-- explicit author marker on flat comments. Authorization remains at the API
-- boundary plus explicit database EXECUTE grants.

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
        'title', m.title,
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

create or replace function public.get_melon_comments(
  p_melon_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 21
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 51 or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_comments_page';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id
      and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;

  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into result
  from (
    select c.id, c.created_at,
      jsonb_build_object(
        'id', c.id,
        'melonId', c.melon_id,
        'alias', p.alias,
        'isOwner', c.author_id = m.author_id,
        'content', c.content,
        'createdAt', c.created_at
      ) || public.profile_public_identity(c.author_id) as item
    from public.comments c
    join public.profiles p on p.id = c.author_id
    join public.melons m on m.id = c.melon_id
    where c.melon_id = p_melon_id
      and not c.held
      and (
        p_cursor_created_at is null
        or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by c.created_at desc, c.id desc
    limit p_limit
  ) page;
  return result;
end;
$$;

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
declare new_comment public.comments;
declare flags text[];
declare author_alias text;
declare melon_author_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  if char_length(btrim(p_content)) not between 1 and 140 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  select author_id into melon_author_id
  from public.melons
  where id = p_melon_id
    and public.effective_melon_status(status, matures_at, completed_reads) = 'mature';
  if melon_author_id is null then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;
  if (select count(*) from public.comments where author_id = p_actor_id and created_at >= now() - interval '1 hour') >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_content));
  insert into public.comments (melon_id, author_id, content, safety_flags, held)
  values (p_melon_id, p_actor_id, btrim(p_content), flags, cardinality(flags) > 0)
  returning * into new_comment;
  if new_comment.held then return jsonb_build_object('held', true); end if;

  select alias into author_alias from public.profiles where id = p_actor_id;
  return jsonb_build_object(
    'held', false,
    'comment', jsonb_build_object(
      'id', new_comment.id,
      'melonId', new_comment.melon_id,
      'alias', author_alias,
      'isOwner', p_actor_id = melon_author_id,
      'content', new_comment.content,
      'createdAt', new_comment.created_at
    ) || public.profile_public_identity(p_actor_id)
  );
end;
$$;

revoke all on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.get_melon_comments(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.add_melon_comment(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_discovery_candidates_for_visitor_v2(text, double precision, double precision)
  to service_role;
grant execute on function public.get_melon_comments(uuid, timestamptz, uuid, integer)
  to service_role;
grant execute on function public.add_melon_comment(uuid, uuid, text)
  to service_role;
