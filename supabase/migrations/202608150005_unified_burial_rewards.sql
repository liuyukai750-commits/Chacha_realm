-- Unify public-spot and nearby-life-circle creation behind one transaction.
-- Every new safe original awards one true seed. Idempotent retries return the
-- original result. Ordinary profiles keep the anti-spam cap; the single
-- service-managed steward profile is exempt so launch testing is not blocked.

create or replace function public.create_melon_v3(
  p_actor_id uuid,
  p_operation_id uuid,
  p_burial_kind text,
  p_city_id text,
  p_spot_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_topic public.safe_topic,
  p_title text,
  p_content text,
  p_reveal_mode text default 'open'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_actor_id;
  new_id uuid := gen_random_uuid();
  flags text[];
  new_status public.melon_status;
  maturity timestamptz;
  awarded boolean := false;
  inserted_count integer := 0;
  wallet jsonb;
  previous record;
  profile_badge text;
  compatibility_cell text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if actor is null then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'invalid_operation';
  end if;
  if p_burial_kind not in ('public_spot', 'nearby_area') then
    raise exception using errcode = '22023', message = 'invalid_burial_kind';
  end if;
  if p_city_id not in ('changsha', 'beijing', 'shanghai', 'guangzhou', 'shenzhen') then
    raise exception using errcode = '22023', message = 'invalid_city';
  end if;
  if p_reveal_mode <> 'open' then
    raise exception using errcode = '22023', message = 'invalid_reveal_mode';
  end if;

  select p.identity_badge into profile_badge
  from public.profiles p
  where p.id = actor and p.account_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;

  if char_length(btrim(p_title)) not between 1 and 60
     or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;

  if p_burial_kind = 'public_spot' then
    if p_latitude is not null or p_longitude is not null
       or not exists (
         select 1 from public.public_spots s
         where s.id = p_spot_id and s.city_id = p_city_id and s.active
       ) then
      raise exception using errcode = '22023', message = 'invalid_spot';
    end if;
  else
    if p_spot_id is not null
       or p_latitude is null or p_latitude not between -90 and 90
       or p_longitude is null or p_longitude not between -180 and 180 then
      raise exception using errcode = '22023', message = 'invalid_location';
    end if;
    -- Compatibility only. Discovery and presence use the private exact anchor.
    compatibility_cell := pg_catalog.md5(p_latitude::text || ':' || p_longitude::text);
  end if;

  select
    m.id,
    public.effective_melon_status(m.status, m.matures_at, m.completed_reads) as status,
    m.matures_at,
    op.true_seed_awarded
  into previous
  from public.melon_create_operations op
  join public.melons m on m.id = op.melon_id
  where op.profile_id = actor and op.operation_id = p_operation_id;

  if found then
    select jsonb_build_object(
      'smallSeedCount', p.small_seed_count,
      'trueSeedCount', p.true_seed_count
    ) into wallet
    from public.profiles p
    where p.id = actor;

    return jsonb_build_object(
      'id', previous.id,
      'status', previous.status,
      'maturesAt', previous.matures_at,
      'trueSeedAwarded', previous.true_seed_awarded,
      'wallet', wallet
    );
  end if;

  if profile_badge is distinct from 'steward'
     and (select count(*) from public.melons where author_id = actor and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_title) || E'\n' || btrim(p_content));
  new_status := case
    when cardinality(flags) > 0 then 'held'::public.melon_status
    else 'incubating'::public.melon_status
  end;
  maturity := case
    when new_status = 'incubating' then statement_timestamp() + interval '2 hours'
    else null
  end;

  insert into public.melons (
    id,
    author_id,
    spot_id,
    burial_kind,
    nearby_city_id,
    nearby_cell_id,
    create_operation_id,
    topic,
    title,
    content,
    status,
    safety_flags,
    matures_at,
    reveal_mode
  ) values (
    new_id,
    actor,
    case when p_burial_kind = 'public_spot' then p_spot_id else null end,
    p_burial_kind,
    case when p_burial_kind = 'nearby_area' then p_city_id else null end,
    case when p_burial_kind = 'nearby_area' then compatibility_cell else null end,
    p_operation_id,
    p_topic,
    btrim(p_title),
    btrim(p_content),
    new_status,
    flags,
    maturity,
    'open'
  );

  if p_burial_kind = 'nearby_area' then
    insert into public.melon_location_anchors (melon_id, city_id, latitude, longitude)
    values (new_id, p_city_id, p_latitude, p_longitude);
  end if;

  if new_status = 'incubating' then
    insert into public.economy_ledger (
      beneficiary_id,
      reason,
      resource,
      amount,
      idempotency_key,
      melon_id
    ) values (
      actor,
      'true_seed_share',
      'true_seed',
      1,
      'share:melon:' || new_id::text,
      new_id
    )
    on conflict (idempotency_key) do nothing;
    get diagnostics inserted_count = row_count;
  end if;

  if inserted_count = 1 then
    update public.profiles
    set true_seed_count = true_seed_count + 1
    where id = actor;
    awarded := true;
  end if;

  insert into public.melon_create_operations (
    profile_id,
    operation_id,
    melon_id,
    true_seed_awarded
  ) values (
    actor,
    p_operation_id,
    new_id,
    awarded
  );

  select jsonb_build_object(
    'smallSeedCount', p.small_seed_count,
    'trueSeedCount', p.true_seed_count
  ) into wallet
  from public.profiles p
  where p.id = actor;

  return jsonb_build_object(
    'id', new_id,
    'status', new_status,
    'maturesAt', maturity,
    'trueSeedAwarded', awarded,
    'wallet', wallet
  );
end;
$$;

revoke all on function public.create_melon_v3(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_melon_v3(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) to service_role;
