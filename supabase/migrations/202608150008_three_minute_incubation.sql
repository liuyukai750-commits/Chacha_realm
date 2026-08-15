-- Story melons mature after three minutes in every supported city and for both
-- public-spot and nearby-life-circle burial. Field plants keep their separate
-- twelve-hour growth rule.

update public.melons
set matures_at = created_at + interval '3 minutes'
where status = 'incubating'
  and matures_at > created_at + interval '3 minutes';

create or replace function public.create_melon_v4(
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
  result jsonb;
  melon_id uuid;
  effective_status public.melon_status;
  effective_matures_at timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  result := public.create_melon_v3(
    p_actor_id,
    p_operation_id,
    p_burial_kind,
    p_city_id,
    p_spot_id,
    p_latitude,
    p_longitude,
    p_topic,
    p_title,
    p_content,
    p_reveal_mode
  );
  melon_id := (result ->> 'id')::uuid;

  update public.melons
  set matures_at = created_at + interval '3 minutes'
  where id = melon_id
    and status = 'incubating'
    and matures_at > created_at + interval '3 minutes';

  select
    public.effective_melon_status(status, matures_at, completed_reads),
    matures_at
  into effective_status, effective_matures_at
  from public.melons
  where id = melon_id;

  return result || jsonb_build_object(
    'status', effective_status,
    'maturesAt', effective_matures_at
  );
end;
$$;

revoke all on function public.create_melon_v4(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_melon_v4(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) to service_role;
