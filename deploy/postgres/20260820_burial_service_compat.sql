-- Standard PostgreSQL has no PostgREST JWT claim. These functions are already
-- protected by explicit EXECUTE grants, so remove the stale Supabase-only JWT
-- assertion from the active burial wrapper and its implementation.
do $$
declare
  signature text;
  target regprocedure;
  definition text;
  legacy_jwt_guard constant text := E'\\n[[:space:]]*if[[:space:]]+coalesce\\(auth\\.jwt\\(\\)[[:space:]]*->>[[:space:]]*''role'',[[:space:]]*''''\\)[[:space:]]*<>[[:space:]]*''service_role''[[:space:]]+then[[:space:]]*\\n[[:space:]]*raise[[:space:]]+exception[[:space:]]+using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''42501'',[[:space:]]*message[[:space:]]*=[[:space:]]*''service_role_required'';[[:space:]]*\\n[[:space:]]*end[[:space:]]+if;';
  service_functions constant text[] := array[
    'public.create_melon_v3(uuid,uuid,text,text,uuid,double precision,double precision,public.safe_topic,text,text,text)',
    'public.create_melon_v4(uuid,uuid,text,text,uuid,double precision,double precision,public.safe_topic,text,text,text)'
  ];
begin
  foreach signature in array service_functions loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'required burial function is missing: %', signature;
    end if;

    definition := pg_get_functiondef(target::oid);
    if position('service_role_required' in definition) > 0 then
      definition := regexp_replace(definition, legacy_jwt_guard, '', 'i');
      if position('service_role_required' in definition) > 0 then
        raise exception 'could not remove legacy JWT guard from %', signature;
      end if;
      execute definition;
    end if;
  end loop;
end;
$$;

revoke all on function public.create_melon_v3(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) from public, anon, authenticated;
revoke all on function public.create_melon_v4(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_melon_v3(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) to service_role;
grant execute on function public.create_melon_v4(
  uuid, uuid, text, text, uuid, double precision, double precision,
  public.safe_topic, text, text, text
) to service_role, chacha_app;
