-- Collapse V0 light reactions into V1 "like" plus "follow up" squats.
-- Existing rows are not discarded: legacy_reaction records the original value,
-- old follow_up rows seed squats, and old juicy/wild/hug rows count as likes.

alter table public.reactions
  add column if not exists legacy_reaction public.reaction_type;

update public.reactions
set legacy_reaction = reaction
where legacy_reaction is null
  and reaction in ('juicy', 'wild', 'hug', 'follow_up');

insert into public.squats (user_id, melon_id, mature_seen_at)
select r.user_id, r.melon_id, statement_timestamp()
from public.reactions r
join public.melons m on m.id = r.melon_id
where coalesce(r.legacy_reaction, r.reaction) = 'follow_up'
on conflict (user_id, melon_id) do nothing;

update public.reactions
set reaction = 'like'
where reaction in ('juicy', 'wild', 'hug', 'follow_up');

create or replace function public.melon_like_count(p_melon_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.reactions r
  where r.melon_id = p_melon_id
    and r.reaction = 'like'
    and coalesce(r.legacy_reaction, 'like'::public.reaction_type) <> 'follow_up';
$$;

create or replace function public.actor_liked_melon(p_actor_id uuid, p_melon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reactions r
    where r.user_id = p_actor_id
      and r.melon_id = p_melon_id
      and r.reaction = 'like'
      and coalesce(r.legacy_reaction, 'like'::public.reaction_type) <> 'follow_up'
  );
$$;

create or replace function public.melon_squat_count(p_melon_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.squats s
  where s.melon_id = p_melon_id;
$$;

drop function if exists public.set_melon_reaction(uuid, public.reaction_type);

create or replace function public.set_melon_reaction(
  p_melon_id uuid,
  p_reaction public.reaction_type,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare counts jsonb;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_reaction <> 'like' then raise exception using errcode = '22023', message = 'unsupported_reaction'; end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  if p_active then
    insert into public.reactions (user_id, melon_id, reaction, legacy_reaction)
    values (actor, p_melon_id, 'like', null)
    on conflict (user_id, melon_id) do update
      set reaction = 'like',
          legacy_reaction = null,
          updated_at = now();
  else
    delete from public.reactions
    where user_id = actor
      and melon_id = p_melon_id
      and reaction = 'like'
      and coalesce(legacy_reaction, 'like'::public.reaction_type) <> 'follow_up';
  end if;

  counts := jsonb_build_object('like', public.melon_like_count(p_melon_id));
  return jsonb_build_object(
    'active', public.actor_liked_melon(actor, p_melon_id),
    'reactions', counts
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
declare effective_status public.melon_status;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  select public.effective_melon_status(status, matures_at, completed_reads)
  into effective_status
  from public.melons
  where id = p_melon_id and status in ('incubating', 'mature');
  if effective_status is null then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  if p_active then
    insert into public.squats (user_id, melon_id, mature_seen_at)
    values (actor, p_melon_id, case when effective_status = 'mature' then statement_timestamp() else null end)
    on conflict (user_id, melon_id) do update
      set mature_seen_at = case
        when effective_status = 'mature' then coalesce(public.squats.mature_seen_at, statement_timestamp())
        else public.squats.mature_seen_at
      end;
  else
    delete from public.squats where user_id = actor and melon_id = p_melon_id;
  end if;
  return jsonb_build_object('active', p_active, 'squatCount', public.melon_squat_count(p_melon_id));
end;
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
      then jsonb_build_object('id', 'nearby-life-circle', 'cityId', m.nearby_city_id, 'districtId', m.nearby_city_id || '-nearby', 'name', '附近生活圈')
      else jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name)
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
    'squatCount', public.melon_squat_count(m.id),
    'liked', public.actor_liked_melon(p_actor_id, m.id),
    'reactions', jsonb_build_object('like', public.melon_like_count(m.id))
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

revoke all on function public.melon_like_count(uuid) from public, anon;
revoke all on function public.actor_liked_melon(uuid, uuid) from public, anon;
revoke all on function public.melon_squat_count(uuid) from public, anon;
revoke all on function public.set_melon_reaction(uuid, public.reaction_type, boolean) from public, anon;
revoke all on function public.set_melon_squat(uuid, boolean) from public, anon;
revoke all on function public.get_melon_detail_for_actor(uuid, uuid) from public, anon, authenticated;

grant execute on function public.melon_like_count(uuid) to authenticated, service_role;
grant execute on function public.actor_liked_melon(uuid, uuid) to authenticated, service_role;
grant execute on function public.melon_squat_count(uuid) to authenticated, service_role;
grant execute on function public.set_melon_reaction(uuid, public.reaction_type, boolean) to authenticated;
grant execute on function public.set_melon_squat(uuid, boolean) to authenticated;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to service_role;
