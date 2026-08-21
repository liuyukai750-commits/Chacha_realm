begin;

do $$
begin
  if to_regprocedure('public.handle_new_anonymous_user()') is null then
    raise exception using
      errcode = 'P0001',
      message = 'registration_profile_trigger_function_missing';
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_anonymous_user();

commit;
