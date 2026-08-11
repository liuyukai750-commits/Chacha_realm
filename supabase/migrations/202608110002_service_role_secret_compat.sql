-- Supabase's new sb_secret_* keys authenticate PostgREST as the service_role
-- database role, but they do not carry the legacy JWT claim inspected by
-- auth.jwt(). The functions below are already callable only by service_role,
-- so the extra JWT assertion rejects legitimate server requests without
-- adding an authorization boundary. Remove that incompatible assertion while
-- preserving explicit EXECUTE grants as the database gate.

do $$
declare
  signature text;
  target regprocedure;
  definition text;
  legacy_jwt_guard constant text := E'\\n[[:space:]]*if[[:space:]]+coalesce\\(auth\\.jwt\\(\\)[[:space:]]*->>[[:space:]]*''role'',[[:space:]]*''''\\)[[:space:]]*<>[[:space:]]*''service_role''[[:space:]]+then[[:space:]]*\\n[[:space:]]*raise[[:space:]]+exception[[:space:]]+using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''42501'',[[:space:]]*message[[:space:]]*=[[:space:]]*''service_role_required'';[[:space:]]*\\n[[:space:]]*end[[:space:]]+if;';
  service_functions constant text[] := array[
    'public.create_nearby_melon(uuid,uuid,text,text,public.safe_topic,text,text,text)',
    'public.create_melon(uuid,uuid,text,uuid,public.safe_topic,text,text,text)',
    'public.complete_melon_read(uuid,uuid)',
    'public.get_melon_detail_for_actor(uuid,uuid)',
    'public.add_melon_comment(uuid,uuid,uuid,text)'
  ];
begin
  foreach signature in array service_functions loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'required service function is missing: %', signature;
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

revoke all on function public.create_nearby_melon(uuid, uuid, text, text, public.safe_topic, text, text, text) from public, anon, authenticated;
revoke all on function public.create_melon(uuid, uuid, text, uuid, public.safe_topic, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_melon_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_melon_detail_for_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_melon_comment(uuid, uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_nearby_melon(uuid, uuid, text, text, public.safe_topic, text, text, text) to service_role;
grant execute on function public.create_melon(uuid, uuid, text, uuid, public.safe_topic, text, text, text) to service_role;
grant execute on function public.complete_melon_read(uuid, uuid) to service_role;
grant execute on function public.get_melon_detail_for_actor(uuid, uuid) to service_role;
grant execute on function public.add_melon_comment(uuid, uuid, uuid, text) to service_role;
