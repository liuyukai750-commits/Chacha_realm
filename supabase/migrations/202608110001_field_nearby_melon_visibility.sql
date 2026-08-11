-- Keep an owner's field list complete across both burial modes. Nearby-life-circle
-- melons use a synthetic coarse spot and never expose the HMAC cell or coordinates.
create or replace function public.field_view_for_profile(p_profile_id uuid, p_include_private boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select * from public.profiles where id = p_profile_id
  ), active_plants as (
    select fp.*,
      case
        when fp.matures_at <= statement_timestamp() then 'mature'
        when fp.matures_at - interval '6 hours' <= statement_timestamp() then 'growing'
        else 'seedling'
      end as stage
    from public.field_plants fp
    where fp.owner_id = p_profile_id and fp.harvested_at is null
  ), plot_items as (
    select plots.plot_index,
      coalesce(jsonb_agg((
        jsonb_build_object(
          'plotIndex', ap.plot_index,
          'slotIndex', ap.slot_index,
          'stage', ap.stage
        ) || case when p_include_private then jsonb_build_object(
          'id', ap.id,
          'plantedAt', ap.planted_at,
          'maturesAt', ap.matures_at
        ) else '{}'::jsonb end) order by ap.slot_index
      ) filter (where ap.id is not null), '[]'::jsonb) as plants
    from generate_series(0, 2) as plots(plot_index)
    left join active_plants ap on ap.plot_index = plots.plot_index
    group by plots.plot_index
  ), public_melons as (
    select coalesce(jsonb_agg(jsonb_build_object(
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
      'revealMode', m.reveal_mode
    ) order by m.created_at desc), '[]'::jsonb) as items
    from public.melons m
    left join public.public_spots s on s.id = m.spot_id and s.active
    where m.author_id = p_profile_id
      and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
      and (
        (m.burial_kind = 'public_spot' and s.id is not null)
        or (m.burial_kind = 'nearby_area' and m.nearby_city_id is not null)
      )
  )
  select jsonb_strip_nulls(jsonb_build_object(
      'alias', t.alias,
      'animal', t.animal,
      'plots', (select jsonb_agg(jsonb_build_object(
        'plotIndex', pi.plot_index,
        'capacity', 3,
        'plants', pi.plants
      ) order by pi.plot_index) from plot_items pi),
      'plantedCount', (select count(*) from active_plants),
      'matureCount', (select count(*) from active_plants where stage = 'mature'),
      'melons', (select items from public_melons)
    ) || case when p_include_private then jsonb_build_object(
      'wallet', jsonb_build_object(
        'smallSeedCount', t.small_seed_count,
        'trueSeedCount', t.true_seed_count
      ),
      'experience', jsonb_build_object(
        'total', t.experience,
        'fromReads', t.experience_from_reads,
        'fromHarvests', t.experience_from_harvests
      ),
      'nextMaturesAt', (select min(matures_at) from active_plants where matures_at > statement_timestamp()),
      'canHarvest', (
        select count(*) = 9 and bool_and(matures_at <= statement_timestamp())
        from active_plants
      )
    ) else '{}'::jsonb end)
  from target t;
$$;

revoke all on function public.field_view_for_profile(uuid, boolean) from public, anon, authenticated;
