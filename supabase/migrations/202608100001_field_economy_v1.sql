-- V1 closes the eat -> seed -> plant -> harvest loop.
-- User coordinates are deliberately absent: only configured public spots persist locations.

alter table public.profiles
  add column if not exists small_seed_count smallint not null default 0 check (small_seed_count between 0 and 4),
  add column if not exists true_seed_count integer not null default 0 check (true_seed_count >= 0),
  add column if not exists experience integer not null default 0 check (experience >= 0),
  add column if not exists experience_from_reads integer not null default 0 check (experience_from_reads >= 0),
  add column if not exists experience_from_harvests integer not null default 0 check (experience_from_harvests >= 0),
  add column if not exists wallet_migrated_at timestamptz;

-- One-time compatibility migration. seed_count remains read-only legacy data after this point.
update public.profiles
set true_seed_count = seed_count / 5,
    small_seed_count = (seed_count % 5)::smallint,
    wallet_migrated_at = statement_timestamp()
where wallet_migrated_at is null;

alter table public.profiles
  alter column wallet_migrated_at set default now(),
  alter column wallet_migrated_at set not null;

create table public.field_harvests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plant_count smallint not null default 9 check (plant_count = 9),
  experience_awarded smallint not null default 9 check (experience_awarded = 9),
  harvested_at timestamptz not null default now()
);

create index field_harvests_owner_idx
  on public.field_harvests (owner_id, harvested_at desc);

create table public.field_plants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plot_index smallint not null check (plot_index between 0 and 2),
  slot_index smallint not null check (slot_index between 0 and 2),
  planted_at timestamptz not null default now(),
  matures_at timestamptz not null default (now() + interval '12 hours'),
  harvested_at timestamptz,
  harvest_batch_id uuid references public.field_harvests(id) on delete restrict,
  check (matures_at = planted_at + interval '12 hours'),
  check ((harvested_at is null) = (harvest_batch_id is null))
);

create unique index field_plants_active_slot_idx
  on public.field_plants (owner_id, plot_index, slot_index)
  where harvested_at is null;
create index field_plants_owner_active_idx
  on public.field_plants (owner_id, matures_at)
  where harvested_at is null;

create table public.economy_ledger (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'small_seed_read',
    'small_seed_exchange',
    'true_seed_share',
    'true_seed_plant',
    'author_read_xp',
    'field_harvest_xp'
  )),
  resource text not null check (resource in ('small_seed', 'true_seed', 'experience')),
  amount integer not null check (amount <> 0),
  idempotency_key text not null unique,
  melon_id uuid references public.melons(id) on delete cascade,
  plant_id uuid references public.field_plants(id) on delete cascade,
  harvest_batch_id uuid references public.field_harvests(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index economy_ledger_beneficiary_idx
  on public.economy_ledger (beneficiary_id, created_at desc);

alter table public.field_harvests enable row level security;
alter table public.field_plants enable row level security;
alter table public.economy_ledger enable row level security;

revoke all on public.field_harvests, public.field_plants, public.economy_ledger
  from anon, authenticated;

create trigger field_harvests_reject_banned before insert or update or delete on public.field_harvests
for each statement execute function public.reject_banned_actor_write();
create trigger field_plants_reject_banned before insert or update or delete on public.field_plants
for each statement execute function public.reject_banned_actor_write();
create trigger economy_ledger_reject_banned before insert or update or delete on public.economy_ledger
for each statement execute function public.reject_banned_actor_write();

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'wallet', jsonb_build_object(
      'smallSeedCount', p.small_seed_count,
      'trueSeedCount', p.true_seed_count
    ),
    'experience', jsonb_build_object(
      'total', p.experience,
      'fromReads', p.experience_from_reads,
      'fromHarvests', p.experience_from_harvests
    ),
    'accountStatus', p.account_status
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.create_melon(uuid, public.safe_topic, text, text) from public, anon, authenticated;
revoke all on function public.create_melon(uuid, public.safe_topic, text, text, text) from public, anon, authenticated;

create or replace function public.create_melon(
  p_actor_id uuid,
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
declare
  actor uuid := p_actor_id;
  result jsonb;
  new_id uuid;
  flags text[];
  new_status public.melon_status;
  maturity timestamptz;
  awarded boolean := false;
  china_day date := (statement_timestamp() at time zone 'Asia/Shanghai')::date;
  wallet jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_reveal_mode not in ('open', 'seek_locked') then
    raise exception using errcode = '22023', message = 'invalid_reveal_mode';
  end if;

  perform 1 from public.profiles
  where id = actor and account_status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_banned'; end if;

  if char_length(btrim(p_title)) not between 1 and 60 or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  if not exists (select 1 from public.public_spots where id = p_spot_id and active) then
    raise exception using errcode = '22023', message = 'invalid_spot';
  end if;
  if (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_title) || E'\n' || btrim(p_content));
  new_status := case when cardinality(flags) > 0 then 'held'::public.melon_status else 'incubating'::public.melon_status end;
  maturity := case when new_status = 'incubating' then now() + interval '2 hours' else null end;

  insert into public.melons (author_id, spot_id, topic, title, content, status, safety_flags, matures_at, reveal_mode)
  values (actor, p_spot_id, p_topic, btrim(p_title), btrim(p_content), new_status, flags, maturity, p_reveal_mode)
  returning id into new_id;

  result := jsonb_build_object('id', new_id, 'status', new_status, 'maturesAt', maturity);

  if result ->> 'status' = 'incubating' then
    insert into public.economy_ledger (
      beneficiary_id, reason, resource, amount, idempotency_key, melon_id
    ) values (
      actor,
      'true_seed_share',
      'true_seed',
      1,
      'share:' || actor::text || ':' || china_day::text,
      (result ->> 'id')::uuid
    )
    on conflict (idempotency_key) do nothing;
    if found then
      update public.profiles set true_seed_count = true_seed_count + 1 where id = actor;
      awarded := true;
    end if;
  end if;

  select jsonb_build_object(
    'smallSeedCount', small_seed_count,
    'trueSeedCount', true_seed_count
  ) into wallet from public.profiles where id = actor;

  return result || jsonb_build_object('trueSeedAwarded', awarded, 'wallet', wallet);
end;
$$;

revoke all on function public.complete_melon_read(uuid) from public, anon, authenticated;

create or replace function public.complete_melon_read(p_actor_id uuid, p_melon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader uuid := p_actor_id;
  melon_author uuid;
  melon_reads integer;
  inserted_count integer;
  rewarded_reads integer;
  current_small smallint;
  current_true integer;
  small_awarded boolean := false;
  auto_converted boolean := false;
  author_xp integer := 0;
  author_active boolean := false;
  day_start timestamptz := date_trunc('day', statement_timestamp() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  day_end timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if reader is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  day_end := day_start + interval '1 day';

  select author_id, completed_reads into melon_author, melon_reads
  from public.melons
  where id = p_melon_id
    and public.effective_melon_status(status, matures_at, completed_reads) = 'mature';
  if not found then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  if reader::text < melon_author::text then
    perform pg_advisory_xact_lock(hashtextextended('profile:' || reader::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('profile:' || melon_author::text, 0));
  elsif reader::text > melon_author::text then
    perform pg_advisory_xact_lock(hashtextextended('profile:' || melon_author::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('profile:' || reader::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('profile:' || reader::text, 0));
  end if;

  select small_seed_count, true_seed_count into current_small, current_true
  from public.profiles
  where id = reader and account_status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_banned'; end if;

  select author_id, completed_reads into melon_author, melon_reads
  from public.melons
  where id = p_melon_id
    and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  select account_status = 'active' into author_active
  from public.profiles
  where id = melon_author
  for update;

  -- Self-reads are not public-quality reads and never mint resources.
  if melon_author = reader then
    return jsonb_build_object(
      'counted', false,
      'smallSeedAwarded', false,
      'autoConverted', false,
      'wallet', jsonb_build_object('smallSeedCount', current_small, 'trueSeedCount', current_true),
      'authorExperienceAwarded', 0,
      'completedReads', melon_reads
    );
  end if;

  insert into public.melon_completions (melon_id, reader_id)
  values (p_melon_id, reader)
  on conflict (melon_id, reader_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return jsonb_build_object(
      'counted', false,
      'smallSeedAwarded', false,
      'autoConverted', false,
      'wallet', jsonb_build_object('smallSeedCount', current_small, 'trueSeedCount', current_true),
      'authorExperienceAwarded', 0,
      'completedReads', melon_reads
    );
  end if;

  update public.melons
  set completed_reads = completed_reads + 1,
      status = 'mature'
  where id = p_melon_id
  returning completed_reads into melon_reads;

  select count(*) into rewarded_reads
  from public.economy_ledger
  where beneficiary_id = reader
    and reason = 'small_seed_read'
    and created_at >= day_start
    and created_at < day_end;

  if rewarded_reads < 5 then
    insert into public.economy_ledger (
      beneficiary_id, reason, resource, amount, idempotency_key, melon_id
    ) values (
      reader,
      'small_seed_read',
      'small_seed',
      1,
      'read:' || p_melon_id::text || ':' || reader::text || ':small',
      p_melon_id
    );
    small_awarded := true;

    if current_small = 4 then
      update public.profiles
      set small_seed_count = 0,
          true_seed_count = true_seed_count + 1
      where id = reader
      returning small_seed_count, true_seed_count into current_small, current_true;

      insert into public.economy_ledger (
        beneficiary_id, reason, resource, amount, idempotency_key, melon_id
      ) values
        (reader, 'small_seed_exchange', 'small_seed', -5,
          'read:' || p_melon_id::text || ':' || reader::text || ':exchange-consume', p_melon_id),
        (reader, 'small_seed_exchange', 'true_seed', 1,
          'read:' || p_melon_id::text || ':' || reader::text || ':exchange-mint', p_melon_id);
      auto_converted := true;
    else
      update public.profiles
      set small_seed_count = small_seed_count + 1
      where id = reader
      returning small_seed_count, true_seed_count into current_small, current_true;
    end if;
  end if;

  if author_active then
    insert into public.economy_ledger (
      beneficiary_id, reason, resource, amount, idempotency_key, melon_id
    ) values (
      melon_author,
      'author_read_xp',
      'experience',
      1,
      'read:' || p_melon_id::text || ':' || reader::text || ':author-xp',
      p_melon_id
    ) on conflict (idempotency_key) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      update public.profiles
      set experience = experience + 1,
          experience_from_reads = experience_from_reads + 1
      where id = melon_author;
      author_xp := 1;
    end if;
  end if;

  return jsonb_build_object(
    'counted', true,
    'smallSeedAwarded', small_awarded,
    'autoConverted', auto_converted,
    'wallet', jsonb_build_object('smallSeedCount', current_small, 'trueSeedCount', current_true),
    'authorExperienceAwarded', author_xp,
    'completedReads', melon_reads
  );
end;
$$;

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
      'topic', m.topic,
      'cityId', s.city_id,
      'districtId', s.district_id,
      'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
      'distanceBand', 'remote',
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'isRemote', true,
      'revealMode', m.reveal_mode
    ) order by m.created_at desc), '[]'::jsonb) as items
    from public.melons m
    join public.public_spots s on s.id = m.spot_id
    where m.author_id = p_profile_id
      and public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
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

create or replace function public.get_field_view(p_alias text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_alias is null then
    target_id := auth.uid();
  else
    select id into target_id from public.profiles where alias = p_alias;
  end if;
  if target_id is null then return null; end if;
  return public.field_view_for_profile(target_id, p_alias is null);
end;
$$;

create or replace function public.plant_field_melon(p_plot_index smallint, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  next_slot smallint;
  new_plant public.field_plants;
  existing_plant public.field_plants;
  wallet jsonb;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;
  if p_plot_index is null or p_plot_index not between 0 and 2 or p_operation_id is null then
    raise exception using errcode = '22023', message = 'invalid_plot_index';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('profile:' || actor::text, 0));
  perform 1 from public.profiles where id = actor and account_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;

  select fp.* into existing_plant
  from public.economy_ledger el
  join public.field_plants fp on fp.id = el.plant_id
  where el.idempotency_key = 'plant-operation:' || actor::text || ':' || p_operation_id::text
    and el.beneficiary_id = actor
    and el.reason = 'true_seed_plant';
  if found then
    select jsonb_build_object(
      'smallSeedCount', small_seed_count,
      'trueSeedCount', true_seed_count
    ) into wallet from public.profiles where id = actor;
    return jsonb_build_object(
      'plant', jsonb_build_object(
        'id', existing_plant.id,
        'plotIndex', existing_plant.plot_index,
        'slotIndex', existing_plant.slot_index,
        'plantedAt', existing_plant.planted_at,
        'maturesAt', existing_plant.matures_at,
        'stage', case
          when existing_plant.matures_at <= statement_timestamp() then 'mature'
          when existing_plant.matures_at - interval '6 hours' <= statement_timestamp() then 'growing'
          else 'seedling'
        end
      ),
      'wallet', wallet,
      'field', public.field_view_for_profile(actor, true)
    );
  end if;

  if not exists (select 1 from public.profiles where id = actor and true_seed_count > 0) then
    raise exception using errcode = 'P0001', message = 'insufficient_true_seeds';
  end if;

  select candidate::smallint into next_slot
  from generate_series(0, 2) as slots(candidate)
  where not exists (
    select 1 from public.field_plants
    where owner_id = actor
      and plot_index = p_plot_index
      and slot_index = candidate
      and harvested_at is null
  )
  order by candidate
  limit 1;
  if next_slot is null then raise exception using errcode = 'P0001', message = 'field_plot_full'; end if;

  insert into public.field_plants (owner_id, plot_index, slot_index)
  values (actor, p_plot_index, next_slot)
  returning * into new_plant;

  update public.profiles set true_seed_count = true_seed_count - 1 where id = actor;
  insert into public.economy_ledger (
    beneficiary_id, reason, resource, amount, idempotency_key, plant_id
  ) values (
    actor, 'true_seed_plant', 'true_seed', -1,
    'plant-operation:' || actor::text || ':' || p_operation_id::text,
    new_plant.id
  );

  select jsonb_build_object(
    'smallSeedCount', small_seed_count,
    'trueSeedCount', true_seed_count
  ) into wallet from public.profiles where id = actor;

  return jsonb_build_object(
    'plant', jsonb_build_object(
      'id', new_plant.id,
      'plotIndex', new_plant.plot_index,
      'slotIndex', new_plant.slot_index,
      'plantedAt', new_plant.planted_at,
      'maturesAt', new_plant.matures_at,
      'stage', 'seedling'
    ),
    'wallet', wallet,
    'field', public.field_view_for_profile(actor, true)
  );
end;
$$;

create or replace function public.harvest_field()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  active_count integer;
  mature_count integer;
  batch_id uuid := gen_random_uuid();
  experience_result jsonb;
begin
  if actor is null then raise exception using errcode = '28000', message = 'unauthorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile:' || actor::text, 0));
  perform 1 from public.profiles where id = actor and account_status = 'active' for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_banned'; end if;

  select count(*), count(*) filter (where matures_at <= statement_timestamp())
  into active_count, mature_count
  from public.field_plants
  where owner_id = actor and harvested_at is null;

  if active_count <> 9 or mature_count <> 9 then
    raise exception using errcode = 'P0001', message = 'field_not_ready';
  end if;

  insert into public.field_harvests (id, owner_id) values (batch_id, actor);
  update public.field_plants
  set harvested_at = statement_timestamp(), harvest_batch_id = batch_id
  where owner_id = actor and harvested_at is null;

  update public.profiles
  set experience = experience + 9,
      experience_from_harvests = experience_from_harvests + 9
  where id = actor;

  insert into public.economy_ledger (
    beneficiary_id, reason, resource, amount, idempotency_key, harvest_batch_id
  ) values (
    actor, 'field_harvest_xp', 'experience', 9, 'harvest:' || batch_id::text, batch_id
  );

  select jsonb_build_object(
    'total', experience,
    'fromReads', experience_from_reads,
    'fromHarvests', experience_from_harvests
  ) into experience_result from public.profiles where id = actor;

  return jsonb_build_object(
    'harvestedCount', 9,
    'experienceAwarded', 9,
    'experience', experience_result,
    'field', public.field_view_for_profile(actor, true)
  );
end;
$$;

revoke all on function public.field_view_for_profile(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_melon(uuid, uuid, public.safe_topic, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_melon_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.plant_field_melon(smallint, uuid) from public, anon;
revoke all on function public.harvest_field() from public, anon;

grant execute on function public.create_melon(uuid, uuid, public.safe_topic, text, text, text) to service_role;
grant execute on function public.complete_melon_read(uuid, uuid) to service_role;
grant execute on function public.plant_field_melon(smallint, uuid) to authenticated;
grant execute on function public.harvest_field() to authenticated;

comment on column public.profiles.seed_count is
  'Legacy V0 value, migrated once into small_seed_count and true_seed_count; V1 never writes it.';
comment on table public.economy_ledger is
  'Immutable idempotent resource and XP audit trail. No user coordinates or movement traces are stored.';
comment on table public.field_plants is
  'Three plots x three positions. Server timestamps are the growth-state source of truth.';
