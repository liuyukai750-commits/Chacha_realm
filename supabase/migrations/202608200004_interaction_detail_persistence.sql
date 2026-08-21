-- Restore the interaction fields that the current detail wrapper must return.
-- The legacy detail body on the migrated PostgreSQL instance predates the
-- single-like interaction shape, while the write functions already use it.

create or replace function public.get_melon_detail_for_actor(
  p_melon_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  author_id uuid;
begin
  result := public.get_melon_detail_for_actor_legacy_identity(p_melon_id, p_actor_id);
  if result is null then return null; end if;

  select m.author_id into author_id
  from public.melons m
  where m.id = p_melon_id;

  return result
    || public.profile_public_identity(author_id)
    || jsonb_build_object(
      'squatted', exists(
        select 1 from public.squats q
        where q.melon_id = p_melon_id and q.user_id = p_actor_id
      ),
      'squatCount', public.melon_squat_count(p_melon_id),
      'liked', public.actor_liked_melon(p_actor_id, p_melon_id),
      'reactions', jsonb_build_object('like', public.melon_like_count(p_melon_id))
    );
end;
$$;

revoke all on function public.get_melon_detail_for_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid)
  to service_role;
