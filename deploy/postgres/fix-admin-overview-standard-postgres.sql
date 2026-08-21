\set ON_ERROR_STOP on

begin;

-- Supabase authorizes this server-only aggregate with a JWT claim. Standard
-- PostgreSQL has no PostgREST JWT context, so the dedicated chacha_app role's
-- EXECUTE grant is the equivalent trust boundary.
do $$
declare
  target regprocedure := to_regprocedure('public.get_admin_overview()');
  definition text;
  legacy_jwt_guard constant text := E'\\n[[:space:]]*if[[:space:]]+coalesce\\(auth\\.jwt\\(\\)[[:space:]]*->>[[:space:]]*''role'',[[:space:]]*''''\\)[[:space:]]*<>[[:space:]]*''service_role''[[:space:]]+then[[:space:]]*\\n[[:space:]]*raise[[:space:]]+exception[[:space:]]+using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''42501'',[[:space:]]*message[[:space:]]*=[[:space:]]*''service_role_required'';[[:space:]]*\\n[[:space:]]*end[[:space:]]+if;';
begin
  if target is null then
    raise exception 'required service function is missing: public.get_admin_overview()';
  end if;

  definition := pg_get_functiondef(target::oid);
  if position('service_role_required' in definition) > 0 then
    definition := regexp_replace(definition, legacy_jwt_guard, '', 'i');
    if position('service_role_required' in definition) > 0 then
      raise exception 'could not remove legacy JWT guard from public.get_admin_overview()';
    end if;
    execute definition;
  end if;
end;
$$;

revoke all on function public.get_admin_overview()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_overview() to chacha_app;

commit;
