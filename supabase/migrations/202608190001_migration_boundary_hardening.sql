-- Harden the source-side migration boundary without switching the running app.
-- Supabase Auth and PostgREST remain the active providers after this migration.

-- Refresh every supported password snapshot. A password-backed account must
-- never disappear silently because its login handle or hash shape drifted.
insert into public.local_auth_credentials (
  profile_id,
  password_digest,
  password_algorithm,
  password_changed_at,
  source_user_updated_at
)
select
  u.id,
  u.encrypted_password,
  case
    when u.encrypted_password ~ '^[$]argon2id[$]v=[0-9]+[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$' then 'argon2id'
    else 'bcrypt'
  end as password_algorithm,
  coalesce(u.updated_at, u.created_at, statement_timestamp()),
  u.updated_at
from public.account_login_credentials c
join auth.users u
  on u.id = c.profile_id
 and u.email = c.login_email
join public.profiles p on p.id = u.id
where u.encrypted_password ~ '^[$]2[aby][$][0-9]{2}[$].{53}$'
   or u.encrypted_password ~ '^[$]argon2id[$]v=[0-9]+[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$'
on conflict (profile_id) do update
set password_digest = excluded.password_digest,
    password_algorithm = excluded.password_algorithm,
    password_changed_at = excluded.password_changed_at,
    source_user_updated_at = excluded.source_user_updated_at,
    updated_at = statement_timestamp();

create or replace function public.local_auth_snapshot_audit()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'passwordAccounts', count(*),
    'emailMismatch', count(*) filter (
      where u.id is not null and c.login_email is distinct from u.email
    ),
    'unsupportedHash', count(*) filter (
      where u.id is not null
        and not (
          coalesce(u.encrypted_password ~ '^[$]2[aby][$][0-9]{2}[$].{53}$', false)
          or coalesce(u.encrypted_password ~ '^[$]argon2id[$]v=[0-9]+[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$', false)
        )
    ),
    'missingAuthUser', count(*) filter (where u.id is null),
    'missingSnapshot', count(*) filter (where lc.profile_id is null),
    'staleSnapshot', count(*) filter (
      where u.id is not null
        and lc.profile_id is not null
        and (
          lc.password_digest is distinct from u.encrypted_password
          or lc.source_user_updated_at is distinct from u.updated_at
          or lc.password_algorithm is distinct from case
            when u.encrypted_password ~ '^[$]argon2id[$]v=[0-9]+[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$'
              then 'argon2id'
            else 'bcrypt'
          end
        )
    ),
    'orphanSnapshot', (
      select count(*)
      from public.local_auth_credentials orphan
      where not exists (
        select 1
        from public.account_login_credentials mapped
        where mapped.profile_id = orphan.profile_id
      )
    )
  )
  from public.account_login_credentials c
  left join auth.users u on u.id = c.profile_id
  left join public.local_auth_credentials lc on lc.profile_id = c.profile_id;
$$;

revoke all on function public.local_auth_snapshot_audit()
  from public, anon, authenticated, service_role;
grant execute on function public.local_auth_snapshot_audit() to service_role;

do $$
declare
  audit jsonb := public.local_auth_snapshot_audit();
begin
  if coalesce((audit->>'emailMismatch')::integer, 0) > 0
     or coalesce((audit->>'unsupportedHash')::integer, 0) > 0
     or coalesce((audit->>'missingAuthUser')::integer, 0) > 0
     or coalesce((audit->>'missingSnapshot')::integer, 0) > 0
     or coalesce((audit->>'staleSnapshot')::integer, 0) > 0
     or coalesce((audit->>'orphanSnapshot')::integer, 0) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'local_auth_snapshot_incomplete',
      detail = audit::text;
  end if;
end;
$$;

-- The earlier additive preparation accepted any string beginning with
-- "$argon2id$". Tighten the stored snapshot gate before it can be used by a
-- target password verifier.
alter table public.local_auth_credentials
  drop constraint if exists local_auth_credentials_digest_shape_check;
alter table public.local_auth_credentials
  add constraint local_auth_credentials_digest_shape_check check (
    (password_algorithm = 'bcrypt' and password_digest ~ '^[$]2[aby][$][0-9]{2}[$].{53}$')
    or
    (password_algorithm = 'argon2id' and password_digest ~ '^[$]argon2id[$]v=[0-9]+[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$')
  );

-- Explicit actor authority. The second argument carries the validated session
-- kind while the legacy wrapper preserves the current Supabase JWT behavior.
-- A standard PostgreSQL target will replace only the adapter-specific identity
-- lookup, not this JSON contract.
create or replace function public.get_profile_for_actor(
  p_actor_id uuid,
  p_is_anonymous boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'displayName', p.display_name,
    'publicId', p.public_id,
    'identityBadge', p.identity_badge,
    'maskedPhone', case
      when u.phone is null then null
      else substr(right(u.phone, 11), 1, 3) || '****' || right(u.phone, 4)
    end,
    'onboardingComplete', p.onboarding_completed_at is not null,
    'authKind', case
      when p_is_anonymous then 'anonymous'
      when exists (
        select 1 from public.account_login_credentials c where c.profile_id = p.id
      ) or exists (
        select 1 from public.local_auth_credentials lc where lc.profile_id = p.id
      ) then 'password'
      when u.phone is not null then 'phone'
      else 'password'
    end,
    'wallet', jsonb_build_object(
      'smallSeedCount', p.small_seed_count,
      'trueSeedCount', p.true_seed_count
    ),
    'experience', jsonb_build_object(
      'total', p.experience,
      'fromReads', p.experience_from_reads,
      'fromHarvests', p.experience_from_harvests
    ),
    'accountStatus', p.account_status
  ))
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_actor_id;
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_profile_for_actor(
    auth.uid(),
    coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );
$$;

revoke all on function public.get_profile_for_actor(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.get_profile_for_actor(uuid, boolean) to service_role;

revoke all on function public.get_current_profile() from public, anon;
grant execute on function public.get_current_profile() to authenticated;

-- Transaction-scoped actor context bridges the current auth.uid()-based RPCs
-- without trusting actor identifiers from clients. Only service_role can enter
-- through the explicit wrappers below; a future PostgreSQL adapter will set the
-- same app.actor_id setting on its transaction.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.set_actor_context(
  p_actor_id uuid,
  p_is_anonymous boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_id
  ) then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;

  perform set_config('app.actor_id', p_actor_id::text, true);
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_id,
      'role', 'authenticated',
      'is_anonymous', p_is_anonymous
    )::text,
    true
  );
end;
$$;

revoke all on function app_private.set_actor_context(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.complete_profile_for_actor(
  p_actor_id uuid,
  p_display_name text,
  p_animal text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.complete_current_profile(p_display_name, p_animal);
end;
$$;

create or replace function public.get_squat_shelf_for_actor(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.get_squat_shelf();
end;
$$;

create or replace function public.mark_squat_alert_seen_for_actor(
  p_actor_id uuid,
  p_melon_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.mark_squat_alert_seen(p_melon_id);
end;
$$;

create or replace function public.get_field_view_for_actor(
  p_actor_id uuid,
  p_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.get_field_view(p_alias);
end;
$$;

create or replace function public.plant_field_melon_for_actor(
  p_actor_id uuid,
  p_plot_index smallint,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.plant_field_melon(p_plot_index, p_operation_id);
end;
$$;

create or replace function public.harvest_field_for_actor(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.harvest_field();
end;
$$;

create or replace function public.create_content_report_for_actor(
  p_actor_id uuid,
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.set_actor_context(p_actor_id, false);
  return public.create_content_report(p_target_type, p_target_id, p_reason, p_details);
end;
$$;

revoke all on function public.complete_profile_for_actor(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_squat_shelf_for_actor(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_squat_alert_seen_for_actor(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_field_view_for_actor(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.plant_field_melon_for_actor(uuid, smallint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.harvest_field_for_actor(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.create_content_report_for_actor(
  uuid, public.report_target_type, uuid, public.report_reason, text
) from public, anon, authenticated, service_role;

grant execute on function public.complete_profile_for_actor(uuid, text, text) to service_role;
grant execute on function public.get_squat_shelf_for_actor(uuid) to service_role;
grant execute on function public.mark_squat_alert_seen_for_actor(uuid, uuid) to service_role;
grant execute on function public.get_field_view_for_actor(uuid, text) to service_role;
grant execute on function public.plant_field_melon_for_actor(uuid, smallint, uuid) to service_role;
grant execute on function public.harvest_field_for_actor(uuid) to service_role;
grant execute on function public.create_content_report_for_actor(
  uuid, public.report_target_type, uuid, public.report_reason, text
) to service_role;

comment on function public.local_auth_snapshot_audit() is
  'Count-only migration gate. Never returns password hashes or login handles.';
comment on function public.get_profile_for_actor(uuid, boolean) is
  'Explicit actor profile authority for service-side transports; returns no auth UUID.';
comment on function app_private.set_actor_context(uuid, boolean) is
  'Transaction-only actor bridge. Never callable by application-facing roles.';
