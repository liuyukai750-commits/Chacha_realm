-- Supabase secret keys are API keys rather than legacy JWTs. PostgREST still
-- assumes the service_role database role from the key, but no legacy role
-- legacy role claim. Execution grants are therefore the authorization
-- boundary; actor status and target availability remain validated in-RPC.

create or replace function public.set_melon_reaction(
  p_actor_id uuid,
  p_melon_id uuid,
  p_reaction public.reaction_type,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare counts jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  if p_reaction <> 'like' then raise exception using errcode = '22023', message = 'unsupported_reaction'; end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  if p_active then
    insert into public.reactions (user_id, melon_id, reaction, legacy_reaction)
    values (p_actor_id, p_melon_id, 'like', null)
    on conflict (user_id, melon_id) do update
      set reaction = 'like', legacy_reaction = null, updated_at = now();
  else
    delete from public.reactions
    where user_id = p_actor_id and melon_id = p_melon_id and reaction = 'like'
      and coalesce(legacy_reaction, 'like'::public.reaction_type) <> 'follow_up';
  end if;

  counts := jsonb_build_object('like', public.melon_like_count(p_melon_id));
  return jsonb_build_object(
    'active', public.actor_liked_melon(p_actor_id, p_melon_id),
    'reactions', counts
  );
end;
$$;

create or replace function public.set_melon_squat(
  p_actor_id uuid,
  p_melon_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare effective_status public.melon_status;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  select public.effective_melon_status(status, matures_at, completed_reads)
  into effective_status from public.melons
  where id = p_melon_id and status in ('incubating', 'mature');
  if effective_status is null then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;

  if p_active then
    insert into public.squats (user_id, melon_id, mature_seen_at)
    values (p_actor_id, p_melon_id, case when effective_status = 'mature' then statement_timestamp() else null end)
    on conflict (user_id, melon_id) do update
      set mature_seen_at = case when effective_status = 'mature'
        then coalesce(public.squats.mature_seen_at, statement_timestamp())
        else public.squats.mature_seen_at end;
  else
    delete from public.squats where user_id = p_actor_id and melon_id = p_melon_id;
  end if;
  return jsonb_build_object('active', p_active, 'squatCount', public.melon_squat_count(p_melon_id));
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
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  if char_length(btrim(p_content)) not between 1 and 140 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id
      and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then raise exception using errcode = 'P0002', message = 'melon_not_available'; end if;
  if (select count(*) from public.comments where author_id = p_actor_id and created_at >= now() - interval '1 hour') >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_content));
  insert into public.comments (melon_id, author_id, content, safety_flags, held)
  values (p_melon_id, p_actor_id, btrim(p_content), flags, cardinality(flags) > 0)
  returning * into new_comment;
  if new_comment.held then return jsonb_build_object('held', true); end if;
  select alias into author_alias from public.profiles where id = p_actor_id;
  return jsonb_build_object('held', false, 'comment', jsonb_build_object(
    'id', new_comment.id, 'melonId', new_comment.melon_id, 'alias', author_alias,
    'content', new_comment.content, 'createdAt', new_comment.created_at
  ));
end;
$$;

revoke all on function public.set_melon_reaction(uuid, uuid, public.reaction_type, boolean) from public, anon, authenticated;
revoke all on function public.set_melon_squat(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.add_melon_comment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_melon_reaction(uuid, uuid, public.reaction_type, boolean) to service_role;
grant execute on function public.set_melon_squat(uuid, uuid, boolean) to service_role;
grant execute on function public.add_melon_comment(uuid, uuid, text) to service_role;
