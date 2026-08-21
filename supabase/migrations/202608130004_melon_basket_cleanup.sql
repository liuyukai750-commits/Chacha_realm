-- Keep the discovery basket bounded per user without affecting the squat shelf.
-- Completed and manually dismissed melons disappear only from discovery. A
-- squatted melon remains in public.squats until that user explicitly cancels it.

create table if not exists public.melon_basket_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  melon_id uuid not null references public.melons(id) on delete cascade,
  dismissed_at timestamptz not null default statement_timestamp(),
  primary key (user_id, melon_id)
);

alter table public.melon_basket_dismissals enable row level security;
revoke all on public.melon_basket_dismissals from public, anon, authenticated;

create or replace function public.get_melon_basket_exclusions(p_actor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(excluded.melon_id), '[]'::jsonb)
  from (
    select c.melon_id
    from public.melon_completions c
    where c.reader_id = p_actor_id
    union
    select d.melon_id
    from public.melon_basket_dismissals d
    where d.user_id = p_actor_id
  ) excluded
  where exists (select 1 from public.profiles p where p.id = p_actor_id);
$$;

create or replace function public.set_melon_basket_dismissal(
  p_actor_id uuid,
  p_melon_id uuid,
  p_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id
      and public.effective_melon_status(status, matures_at, completed_reads) in ('incubating', 'mature')
  ) then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;

  if p_hidden then
    insert into public.melon_basket_dismissals (user_id, melon_id)
    values (p_actor_id, p_melon_id)
    on conflict (user_id, melon_id) do update set dismissed_at = statement_timestamp();
  else
    delete from public.melon_basket_dismissals
    where user_id = p_actor_id and melon_id = p_melon_id;
  end if;

  return jsonb_build_object('hidden', p_hidden);
end;
$$;

create or replace function public.delete_own_melon(p_actor_id uuid, p_melon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and account_status = 'active') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;

  update public.melons
  set status = 'removed'
  where id = p_melon_id
    and author_id = p_actor_id
    and status <> 'removed';
  if not found then
    raise exception using errcode = 'P0002', message = 'melon_not_found_or_not_owner';
  end if;

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.get_melon_basket_exclusions(uuid) from public, anon, authenticated;
revoke all on function public.set_melon_basket_dismissal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_own_melon(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_melon_basket_exclusions(uuid) to service_role;
grant execute on function public.set_melon_basket_dismissal(uuid, uuid, boolean) to service_role;
grant execute on function public.delete_own_melon(uuid, uuid) to service_role;

comment on table public.melon_basket_dismissals is
  'Per-user discovery dismissal only. It never removes a squat or the source melon.';
