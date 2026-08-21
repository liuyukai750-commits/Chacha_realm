-- pgcrypto lives in Supabase's extensions schema. These SECURITY DEFINER
-- triggers intentionally use an empty search_path, so digest must be fully
-- qualified or a held submission rolls back instead of entering moderation.
create or replace function public.record_held_melon_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'held' and cardinality(new.safety_flags) > 0 then
    insert into public.moderation_cases (target_type, target_id, author_id, safety_flags, evidence_digest)
    values (
      'melon',
      new.id,
      new.author_id,
      new.safety_flags,
      encode(extensions.digest(new.title || E'\n' || new.content, 'sha256'), 'hex')
    )
    on conflict (target_type, target_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.record_held_comment_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.held and cardinality(new.safety_flags) > 0 then
    insert into public.moderation_cases (target_type, target_id, author_id, safety_flags, evidence_digest)
    values (
      'comment',
      new.id,
      new.author_id,
      new.safety_flags,
      encode(extensions.digest(new.content, 'sha256'), 'hex')
    )
    on conflict (target_type, target_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_held_melon_case() from public, anon, authenticated;
revoke all on function public.record_held_comment_case() from public, anon, authenticated;
