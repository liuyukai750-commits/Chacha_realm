-- Aggregate-only dashboard data for the application server. This function
-- never returns auth UUIDs, phone numbers, content, or precise coordinates.
create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  with boundaries as (
    select
      date_trunc('day', statement_timestamp() at time zone 'Asia/Shanghai')
        at time zone 'Asia/Shanghai' as today_start,
      statement_timestamp() as generated_at
  ), activity as (
    select m.author_id as profile_id, m.created_at as occurred_at from public.melons m
    union all
    select mc.reader_id, mc.completed_at from public.melon_completions mc
    union all
    select c.author_id, c.created_at from public.comments c
    union all
    select r.user_id, r.created_at from public.reactions r
    union all
    select s.user_id, s.created_at from public.squats s
    union all
    select fp.owner_id, fp.planted_at from public.field_plants fp
    union all
    select fh.owner_id, fh.harvested_at from public.field_harvests fh
    union all
    select report.reporter_id, report.created_at from public.reports report
  ), melon_cities as (
    select
      m.id,
      coalesce(ps.city_id, m.nearby_city_id) as city_id,
      m.status not in ('held', 'removed') as is_published
    from public.melons m
    left join public.public_spots ps on ps.id = m.spot_id
  ), city_ids(city_id) as (
    values ('changsha'::text), ('beijing'), ('shanghai'), ('guangzhou'), ('shenzhen')
  )
  select jsonb_build_object(
    'generatedAt', b.generated_at,
    'timezone', 'Asia/Shanghai',
    'users', jsonb_build_object(
      'registrations', jsonb_build_object(
        'total', (
          select count(*) from public.profiles p
          where p.onboarding_completed_at is not null
        ),
        'today', (
          select count(*) from public.profiles p
          where p.onboarding_completed_at >= b.today_start
        )
      ),
      'active', jsonb_build_object(
        'today', (
          select count(distinct a.profile_id)
          from activity a
          join public.profiles p on p.id = a.profile_id
          where p.onboarding_completed_at is not null
            and a.occurred_at >= b.today_start
        ),
        'last7Days', (
          select count(distinct a.profile_id)
          from activity a
          join public.profiles p on p.id = a.profile_id
          where p.onboarding_completed_at is not null
            and a.occurred_at >= b.today_start - interval '6 days'
        ),
        'last30Days', (
          select count(distinct a.profile_id)
          from activity a
          join public.profiles p on p.id = a.profile_id
          where p.onboarding_completed_at is not null
            and a.occurred_at >= b.today_start - interval '29 days'
        )
      )
    ),
    'engagement', jsonb_build_object(
      'publishedMelons', jsonb_build_object(
        'total', (select count(*) from public.melons m where m.status not in ('held', 'removed')),
        'today', (
          select count(*) from public.melons m
          where m.status not in ('held', 'removed') and m.created_at >= b.today_start
        )
      ),
      'effectiveReads', jsonb_build_object(
        'total', (select count(*) from public.melon_completions),
        'today', (select count(*) from public.melon_completions mc where mc.completed_at >= b.today_start)
      ),
      'comments', jsonb_build_object(
        'total', (select count(*) from public.comments c where not c.held),
        'today', (select count(*) from public.comments c where not c.held and c.created_at >= b.today_start)
      ),
      'likes', jsonb_build_object(
        'total', (
          select count(*) from public.reactions r
          where r.reaction = 'like'
            and coalesce(r.legacy_reaction, 'like'::public.reaction_type) <> 'follow_up'
        ),
        'today', (
          select count(*) from public.reactions r
          where r.reaction = 'like'
            and coalesce(r.legacy_reaction, 'like'::public.reaction_type) <> 'follow_up'
            and r.created_at >= b.today_start
        )
      ),
      'squats', jsonb_build_object(
        'active', (select count(*) from public.squats),
        'addedToday', (select count(*) from public.squats s where s.created_at >= b.today_start)
      )
    ),
    'economy', jsonb_build_object(
      'balances', jsonb_build_object(
        'smallSeeds', (select coalesce(sum(p.small_seed_count), 0) from public.profiles p),
        'trueSeeds', (select coalesce(sum(p.true_seed_count), 0) from public.profiles p)
      ),
      'earned', jsonb_build_object(
        'smallSeeds', jsonb_build_object(
          'total', (
            select coalesce(sum(el.amount), 0) from public.economy_ledger el
            where el.reason = 'small_seed_read' and el.amount > 0
          ),
          'today', (
            select coalesce(sum(el.amount), 0) from public.economy_ledger el
            where el.reason = 'small_seed_read' and el.amount > 0 and el.created_at >= b.today_start
          )
        ),
        'trueSeeds', jsonb_build_object(
          'total', (
            select coalesce(sum(el.amount), 0) from public.economy_ledger el
            where el.resource = 'true_seed' and el.amount > 0
          ),
          'today', (
            select coalesce(sum(el.amount), 0) from public.economy_ledger el
            where el.resource = 'true_seed' and el.amount > 0 and el.created_at >= b.today_start
          )
        )
      ),
      'trueSeedsPlanted', jsonb_build_object(
        'total', (
          select coalesce(sum(-el.amount), 0) from public.economy_ledger el
          where el.reason = 'true_seed_plant' and el.amount < 0
        ),
        'today', (
          select coalesce(sum(-el.amount), 0) from public.economy_ledger el
          where el.reason = 'true_seed_plant' and el.amount < 0 and el.created_at >= b.today_start
        )
      ),
      'fieldPlants', jsonb_build_object(
        'planted', jsonb_build_object(
          'total', (select count(*) from public.field_plants),
          'today', (select count(*) from public.field_plants fp where fp.planted_at >= b.today_start)
        ),
        'active', (select count(*) from public.field_plants fp where fp.harvested_at is null)
      ),
      'fieldHarvests', jsonb_build_object(
        'batches', jsonb_build_object(
          'total', (select count(*) from public.field_harvests),
          'today', (select count(*) from public.field_harvests fh where fh.harvested_at >= b.today_start)
        ),
        'plants', jsonb_build_object(
          'total', (select coalesce(sum(fh.plant_count), 0) from public.field_harvests fh),
          'today', (
            select coalesce(sum(fh.plant_count), 0) from public.field_harvests fh
            where fh.harvested_at >= b.today_start
          )
        )
      )
    ),
    'cities', (
      select jsonb_agg(jsonb_build_object(
        'cityId', city.city_id,
        'publishedMelons', (
          select count(*) from melon_cities mc
          where mc.city_id = city.city_id and mc.is_published
        ),
        'effectiveReads', (
          select count(*)
          from public.melon_completions completion
          join melon_cities mc on mc.id = completion.melon_id
          where mc.city_id = city.city_id
        ),
        'comments', (
          select count(*)
          from public.comments comment_row
          join melon_cities mc on mc.id = comment_row.melon_id
          where mc.city_id = city.city_id and not comment_row.held
        ),
        'likes', (
          select count(*)
          from public.reactions reaction_row
          join melon_cities mc on mc.id = reaction_row.melon_id
          where mc.city_id = city.city_id
            and reaction_row.reaction = 'like'
            and coalesce(reaction_row.legacy_reaction, 'like'::public.reaction_type) <> 'follow_up'
        ),
        'squats', (
          select count(*)
          from public.squats squat_row
          join melon_cities mc on mc.id = squat_row.melon_id
          where mc.city_id = city.city_id
        )
      ) order by city.city_id)
      from city_ids city
    ),
    'moderation', jsonb_build_object(
      'pendingReviewCases', (
        select count(*) from public.moderation_cases moderation_case
        where moderation_case.status = 'pending'
      ),
      'heldMelons', (select count(*) from public.melons m where m.status = 'held'),
      'heldComments', (select count(*) from public.comments c where c.held),
      'reports', jsonb_build_object(
        'total', (select count(*) from public.reports),
        'today', (select count(*) from public.reports report where report.created_at >= b.today_start)
      ),
      'reportedTargets', (
        select count(distinct (report.target_type::text || ':' || report.target_id::text))
        from public.reports report
      ),
      'bannedProfiles', (
        select count(*) from public.profiles p where p.account_status = 'banned'
      ),
      'banActions', jsonb_build_object(
        'total', (
          select count(*) from public.account_moderation_actions action
          where action.new_status = 'banned'
        ),
        'today', (
          select count(*) from public.account_moderation_actions action
          where action.new_status = 'banned' and action.created_at >= b.today_start
        )
      )
    )
  ) into result
  from boundaries b;

  return result;
end;
$$;

revoke all on function public.get_admin_overview() from public, anon, authenticated;
grant execute on function public.get_admin_overview() to service_role;

comment on function public.get_admin_overview() is
  'Service-role-only aggregate dashboard. Asia/Shanghai day boundary; no identity, content, or location detail.';
