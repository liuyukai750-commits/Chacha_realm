-- Presence-gated comments, account enforcement and minimal moderation audit data.
-- Raw device coordinates are intentionally absent from every table in this migration.

create type public.account_status as enum ('active', 'banned');
create type public.moderation_case_status as enum ('pending', 'approved', 'rejected');
create type public.moderation_appeal_status as enum ('none', 'requested', 'accepted', 'rejected');

alter table public.profiles
  add column account_status public.account_status not null default 'active';

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target_type not null,
  target_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  safety_flags text[] not null,
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  status public.moderation_case_status not null default 'pending',
  resolution_code text check (resolution_code is null or char_length(resolution_code) between 1 and 80),
  appeal_status public.moderation_appeal_status not null default 'none',
  appeal_reason_code text check (appeal_reason_code is null or char_length(appeal_reason_code) between 1 and 80),
  reviewer_subject text check (reviewer_subject is null or char_length(reviewer_subject) <= 120),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (target_type, target_id)
);

create table public.account_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_status public.account_status not null,
  new_status public.account_status not null,
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  evidence_ref text check (evidence_ref is null or char_length(evidence_ref) <= 240),
  actor_subject text not null check (char_length(actor_subject) between 1 and 120),
  created_at timestamptz not null default now()
);

create index moderation_cases_queue_idx on public.moderation_cases (status, created_at);
create index account_moderation_actions_profile_idx on public.account_moderation_actions (profile_id, created_at desc);
create index comments_public_page_idx on public.comments (melon_id, created_at desc, id desc) where not held;

alter table public.moderation_cases enable row level security;
alter table public.account_moderation_actions enable row level security;
revoke all on public.moderation_cases, public.account_moderation_actions from public, anon, authenticated;

create or replace function public.content_safety_flags(p_text text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p_text ~* '(微信|威信|vx|v信|qq|扣扣|telegram|whatsapp|手机号|电话|加我)[[:space:][:punct:]]*[a-z0-9_-]{5,}' then 'contact' end,
    case when p_text ~ '(^|[^0-9])1[3-9][0-9][ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)' then 'phone' end,
    case when p_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' then 'email' end,
    case when p_text ~ '(住址|家庭住址|门牌号|几栋几单元|[0-9]{1,4}号楼[0-9]{1,4}室)' then 'precise_address' end,
    case when p_text ~ '([0-9]{17}[0-9Xx]|(银行卡|卡号)[[:space:]:：-]*[0-9]{16,19})' then 'personal_identifier' end,
    case when p_text ~ '((真名|实名|本名|身份证姓名|姓名)(叫|是|为|[:：])?[[:space:]，,]*[一-龥]{2,4}|(同事|老板|老师|医生|店员|邻居|经理|主管|房东|中介)(叫|是|为|[:：])?[[:space:]]*[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊甄魏家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公][一-龥]{1,2}|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊甄魏家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公][一-龥]{1,2}(老师|医生|经理|老板|同学|女士|先生))' then 'real_name' end,
    case when p_text ~ '(约炮|裸照|发.{0,6}裸照|想睡你|摸你胸|强奸你|口交|性交|性器官)' then 'sexual_harassment' end,
    case when p_text ~ '((真名|实名|本名|姓名)(叫|是|为|[:：])?[[:space:]，,]*[一-龥]{2,4}|(同事|老板|老师|医生|店员|邻居|经理|主管|房东|中介)(叫|是|为|[:：])?[[:space:]]*[一-龥]{2,4}).{0,24}(诈骗|猥亵|强奸|出轨|偷窃|吸毒|卖淫|嫖娼)' then 'identifiable_allegation' end,
    case when p_text ~ '(人肉|开盒|身份证|银行卡号|杀人|制毒|贩毒)' then 'illegal_or_doxxing' end
  ], null);
$$;

create or replace function public.reject_banned_actor_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is not null and exists (
    select 1 from public.profiles where id = actor and account_status = 'banned'
  ) then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  return null;
end;
$$;

create trigger melons_reject_banned before insert or update or delete on public.melons
for each statement execute function public.reject_banned_actor_write();
create trigger completions_reject_banned before insert or update or delete on public.melon_completions
for each statement execute function public.reject_banned_actor_write();
create trigger seed_ledger_reject_banned before insert or update or delete on public.seed_ledger
for each statement execute function public.reject_banned_actor_write();
create trigger squats_reject_banned before insert or update or delete on public.squats
for each statement execute function public.reject_banned_actor_write();
create trigger reactions_reject_banned before insert or update or delete on public.reactions
for each statement execute function public.reject_banned_actor_write();
create trigger comments_reject_banned before insert or update or delete on public.comments
for each statement execute function public.reject_banned_actor_write();
create trigger reports_reject_banned before insert or update or delete on public.reports
for each statement execute function public.reject_banned_actor_write();

create or replace function public.record_held_melon_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'held' and cardinality(new.safety_flags) > 0 then
    insert into public.moderation_cases (target_type, target_id, author_id, safety_flags, evidence_digest)
    values ('melon', new.id, new.author_id, new.safety_flags, encode(digest(new.title || E'\n' || new.content, 'sha256'), 'hex'))
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
    values ('comment', new.id, new.author_id, new.safety_flags, encode(digest(new.content, 'sha256'), 'hex'))
    on conflict (target_type, target_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger melons_record_held_case after insert or update of status on public.melons
for each row execute function public.record_held_melon_case();
create trigger comments_record_held_case after insert or update of held on public.comments
for each row execute function public.record_held_comment_case();

create or replace function public.get_melon_comments(
  p_melon_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 21
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 51 or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_comments_page';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id
      and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;

  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into result
  from (
    select
      c.id,
      c.created_at,
      jsonb_build_object(
        'id', c.id,
        'melonId', c.melon_id,
        'alias', p.alias,
        'content', c.content,
        'createdAt', c.created_at
      ) as item
    from public.comments c
    join public.profiles p on p.id = c.author_id
    where c.melon_id = p_melon_id
      and not c.held
      and (
        p_cursor_created_at is null
        or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by c.created_at desc, c.id desc
    limit p_limit
  ) page;
  return result;
end;
$$;

drop function if exists public.add_melon_comment(uuid, text);

create or replace function public.add_melon_comment(
  p_actor_id uuid,
  p_melon_id uuid,
  p_spot_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare new_comment public.comments;
declare flags text[];
declare author_alias text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '28000', message = 'unauthorized';
  end if;
  if exists (select 1 from public.profiles where id = p_actor_id and account_status = 'banned') then
    raise exception using errcode = 'P0001', message = 'account_banned';
  end if;
  if char_length(btrim(p_content)) not between 1 and 140 then
    raise exception using errcode = '22023', message = 'invalid_content_length';
  end if;
  if not exists (
    select 1 from public.melons
    where id = p_melon_id
      and spot_id = p_spot_id
      and public.effective_melon_status(status, matures_at, completed_reads) = 'mature'
  ) then
    raise exception using errcode = 'P0002', message = 'melon_not_available';
  end if;
  if (select count(*) from public.comments where author_id = p_actor_id and created_at >= now() - interval '1 hour') >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  flags := public.content_safety_flags(btrim(p_content));
  insert into public.comments (melon_id, author_id, content, safety_flags, held)
  values (p_melon_id, p_actor_id, btrim(p_content), flags, cardinality(flags) > 0)
  returning * into new_comment;

  if new_comment.held then
    return jsonb_build_object('held', true);
  end if;

  select alias into author_alias from public.profiles where id = p_actor_id;
  return jsonb_build_object(
    'held', false,
    'comment', jsonb_build_object(
      'id', new_comment.id,
      'melonId', new_comment.melon_id,
      'alias', author_alias,
      'content', new_comment.content,
      'createdAt', new_comment.created_at
    )
  );
end;
$$;

create or replace function public.set_profile_account_status(
  p_profile_id uuid,
  p_status public.account_status,
  p_reason_code text,
  p_evidence_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior public.account_status;
declare actor_subject text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if char_length(btrim(p_reason_code)) not between 1 and 80
    or (p_evidence_ref is not null and char_length(btrim(p_evidence_ref)) > 240) then
    raise exception using errcode = '22023', message = 'invalid_moderation_input';
  end if;

  select account_status into prior from public.profiles where id = p_profile_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'profile_not_found'; end if;
  actor_subject := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), 'service_role');

  update public.profiles set account_status = p_status where id = p_profile_id;
  insert into public.account_moderation_actions (
    profile_id, previous_status, new_status, reason_code, evidence_ref, actor_subject
  ) values (
    p_profile_id, prior, p_status, btrim(p_reason_code), nullif(btrim(p_evidence_ref), ''), actor_subject
  );

  return jsonb_build_object('profileId', p_profile_id, 'accountStatus', p_status);
end;
$$;

create or replace function public.review_moderation_case(
  p_case_id uuid,
  p_status public.moderation_case_status,
  p_resolution_code text,
  p_appeal_status public.moderation_appeal_status default null,
  p_appeal_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_subject text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if char_length(btrim(p_resolution_code)) not between 1 and 80
    or (p_appeal_reason_code is not null and char_length(btrim(p_appeal_reason_code)) > 80) then
    raise exception using errcode = '22023', message = 'invalid_moderation_input';
  end if;
  actor_subject := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), 'service_role');

  update public.moderation_cases
  set status = p_status,
      resolution_code = btrim(p_resolution_code),
      appeal_status = coalesce(p_appeal_status, appeal_status),
      appeal_reason_code = coalesce(nullif(btrim(p_appeal_reason_code), ''), appeal_reason_code),
      reviewer_subject = actor_subject,
      reviewed_at = now()
  where id = p_case_id;
  if not found then raise exception using errcode = 'P0002', message = 'moderation_case_not_found'; end if;

  return jsonb_build_object('caseId', p_case_id, 'status', p_status);
end;
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'alias', p.alias,
    'animal', p.animal,
    'seedCount', p.seed_count,
    'accountStatus', p.account_status
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.get_discovery_candidates()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by item->>'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id,
      'status', public.effective_melon_status(m.status, m.matures_at, m.completed_reads),
      'topic', m.topic,
      'cityId', s.city_id,
      'districtId', s.district_id,
      'spot', jsonb_build_object('id', s.id, 'cityId', s.city_id, 'districtId', s.district_id, 'name', s.name),
      'spotLatitude', s.latitude,
      'spotLongitude', s.longitude,
      'maturesAt', m.matures_at,
      'completedReads', m.completed_reads,
      'title', case
        when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature' then m.title
        else null
      end,
      'commentCount', case
        when public.effective_melon_status(m.status, m.matures_at, m.completed_reads) = 'mature'
          then (select count(*) from public.comments c where c.melon_id = m.id and not c.held)
        else null
      end,
      'createdAt', m.created_at
    )) as item
    from public.melons m
    join public.public_spots s on s.id = m.spot_id and s.active
    where public.effective_melon_status(m.status, m.matures_at, m.completed_reads) in ('incubating', 'mature')
  ) candidates;
$$;

revoke all on function public.reject_banned_actor_write() from public, anon, authenticated;
revoke all on function public.record_held_melon_case() from public, anon, authenticated;
revoke all on function public.record_held_comment_case() from public, anon, authenticated;
revoke all on function public.get_melon_comments(uuid, timestamptz, uuid, integer) from public;
revoke all on function public.add_melon_comment(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_profile_account_status(uuid, public.account_status, text, text) from public, anon, authenticated;
revoke all on function public.review_moderation_case(uuid, public.moderation_case_status, text, public.moderation_appeal_status, text) from public, anon, authenticated;

grant execute on function public.get_melon_comments(uuid, timestamptz, uuid, integer) to anon, authenticated;
grant execute on function public.add_melon_comment(uuid, uuid, uuid, text) to service_role;
grant execute on function public.set_profile_account_status(uuid, public.account_status, text, text) to service_role;
grant execute on function public.review_moderation_case(uuid, public.moderation_case_status, text, public.moderation_appeal_status, text) to service_role;

comment on table public.reports is
  'User reports enter a review queue only; no report count or report insert automatically changes account_status.';
comment on table public.moderation_cases is
  'Minimal review metadata. Original content remains only in its held source row; evidence_digest detects later mutation without duplicating content.';
