-- Expand display names without rewriting earlier applied migrations. The UI
-- separately avoids truncating active IME composition text.
alter table public.profiles
  drop constraint if exists profiles_display_name_format,
  add constraint profiles_display_name_format check (
    display_name is null
    or (
      char_length(display_name) between 1 and 12
      and display_name = btrim(display_name)
      and display_name ~ '^[一-鿿A-Za-z0-9]+$'
    )
  );

create or replace function public.complete_current_profile(
  p_display_name text,
  p_animal text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
     or not exists (
       select 1 from auth.users
       where id = actor
         and (
           phone is not null
           or email like '%@accounts.chachajie.invalid'
           or raw_app_meta_data ->> 'chacha_auth_kind' = 'password'
         )
     ) then
    raise exception using errcode = '42501', message = 'permanent_account_required';
  end if;
  if p_display_name is null
     or char_length(p_display_name) not between 1 and 12
     or p_display_name <> btrim(p_display_name)
     or p_display_name !~ '^[一-鿿A-Za-z0-9]+$'
     or p_display_name = '猹猹国王'
     or p_display_name ~* '(官方|客服|管理员|系统|平台|猹猹街|政府|公安|警察|微信|加我|手机|电话|色情|约炮|赌博|博彩)'
     or p_animal not in ('猹', '水豚', '狐狸', '熊猫', '青蛙', '仓鼠') then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  select * into profile_row from public.profiles where id = actor for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if profile_row.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'account_banned';
  end if;
  if profile_row.onboarding_completed_at is null then
    update public.profiles
    set display_name = p_display_name,
        animal = p_animal,
        onboarding_completed_at = now()
    where id = actor;
  end if;
  return public.get_current_profile();
end;
$$;

grant execute on function public.complete_current_profile(text, text) to authenticated;

comment on constraint profiles_display_name_format on public.profiles is
  'Public display names contain 1-12 Chinese characters, ASCII letters, or digits.';
