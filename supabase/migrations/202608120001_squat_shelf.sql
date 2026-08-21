-- In-app squat shelf. This intentionally does not add web push, device tokens,
-- email, raw coordinates or a background scheduler. Maturity is derived from
-- the database clock whenever the signed-in user opens or returns to the app.

alter table public.squats
  add column if not exists mature_seen_at timestamptz;

create index if not exists squats_user_created_idx
  on public.squats (user_id, created_at desc);

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
  where id = p_melon_id and status not in ('held', 'removed');

  if not found then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;

  if p_active then
    insert into public.squats (user_id, melon_id, mature_seen_at)
    values (
      actor,
      p_melon_id,
      case when effective_status = 'mature' then statement_timestamp() else null end
    )
    on conflict (user_id, melon_id) do update
      set mature_seen_at = case
        when effective_status = 'mature' then coalesce(public.squats.mature_seen_at, statement_timestamp())
        else null
      end;
  else
    delete from public.squats where user_id = actor and melon_id = p_melon_id;
  end if;

  return jsonb_build_object('active', p_active);
end;
$$;

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
      'melon', jsonb_build_object(
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
        'isRemote', true,
        'revealMode', r.reveal_mode
      ),
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

create or replace function public.mark_squat_alert_seen(p_melon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;

  update public.squats s
    set mature_seen_at = coalesce(s.mature_seen_at, statement_timestamp())
  from public.melons m
  where s.user_id = actor
    and s.melon_id = p_melon_id
    and m.id = s.melon_id
    and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature';

  if not found then
    raise exception using errcode = 'P0002', message = 'squat_alert_not_found';
  end if;

  return jsonb_build_object('seen', true);
end;
$$;

revoke all on function public.get_squat_shelf() from public, anon;
revoke all on function public.mark_squat_alert_seen(uuid) from public, anon;
revoke all on function public.set_melon_squat(uuid, boolean) from public, anon;
grant execute on function public.get_squat_shelf() to authenticated;
grant execute on function public.mark_squat_alert_seen(uuid) to authenticated;
grant execute on function public.set_melon_squat(uuid, boolean) to authenticated;

comment on function public.get_squat_shelf() is
  'On-demand in-app squat alerts. Returns blurred public location metadata only and no coordinates or device notification token.';
