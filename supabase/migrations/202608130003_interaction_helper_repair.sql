-- Repair installations where the server-authoritative interaction RPCs were
-- applied without the earlier helper migration. This migration is idempotent
-- and does not discard existing reaction or squat rows.

alter table public.reactions
  add column if not exists legacy_reaction public.reaction_type;

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

revoke all on function public.melon_like_count(uuid) from public, anon, authenticated;
revoke all on function public.actor_liked_melon(uuid, uuid) from public, anon, authenticated;
revoke all on function public.melon_squat_count(uuid) from public, anon, authenticated;
grant execute on function public.melon_like_count(uuid) to service_role;
grant execute on function public.actor_liked_melon(uuid, uuid) to service_role;
grant execute on function public.melon_squat_count(uuid) to service_role;
