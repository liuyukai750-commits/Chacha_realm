-- Public story cards may show the author's chosen animal avatar. Internal auth
-- identifiers and private account fields remain excluded from every DTO.
create or replace function public.profile_public_identity(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_strip_nulls(jsonb_build_object(
    'displayName', coalesce(p.display_name, p.alias),
    'publicId', p.public_id,
    'animal', p.animal
  )), '{}'::jsonb)
  from public.profiles p
  where p.id = p_profile_id;
$$;

revoke all on function public.profile_public_identity(uuid) from public, anon, authenticated;
grant execute on function public.profile_public_identity(uuid) to service_role;
