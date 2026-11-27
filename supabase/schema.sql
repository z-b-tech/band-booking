-- ============================================================
--  音乐社排练室预约 · Supabase 数据库结构
--  用法：Supabase 控制台 → 左侧 SQL Editor → 粘贴全部 → Run
--  可重复执行（幂等）
--  说明：gen_random_uuid() 是 Postgres 13+ 内置函数，不需要 pgcrypto 扩展
-- ============================================================

-- ------------------------------------------------------------
-- 1. 排练预约
-- ------------------------------------------------------------
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  band_name          text not null check (char_length(band_name) between 1 and 40),
  leader_name        text not null check (char_length(leader_name) between 1 and 20),
  contact_type       text not null default 'wechat'
                     check (contact_type in ('wechat','qq','phone')),
  contact            text not null check (char_length(contact) between 3 and 60),
  booking_date       date not null,
  start_time         time not null,
  end_time           time not null,
  needs_double_pedal boolean not null default false,
  note               text not null default '' check (char_length(note) <= 200),
  cancel_token       text not null,
  created_at         timestamptz not null default now(),
  constraint booking_time_order  check (end_time > start_time),
  constraint booking_in_window   check (
       (start_time >= time '10:00' and end_time <= time '14:00')
    or (start_time >= time '17:30' and end_time <= time '21:00')
  )
);
create index if not exists bookings_date_idx on public.bookings (booking_date, start_time);

-- ------------------------------------------------------------
-- 2. 设备 & 外借
-- ------------------------------------------------------------
create table if not exists public.equipment (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 30),
  total_qty  int  not null default 1 check (total_qty >= 0),
  note       text not null default '',
  sort_order int  not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.borrows (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid references public.equipment(id) on delete set null,
  item_name     text not null,
  qty           int  not null default 1 check (qty > 0),
  borrower_name text not null check (char_length(borrower_name) between 1 and 20),
  contact_type  text not null default 'wechat'
                check (contact_type in ('wechat','qq','phone')),
  contact       text not null,
  borrow_date   date not null,
  start_time    time not null,
  end_time      time not null,
  note          text not null default '' check (char_length(note) <= 200),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','returned')),
  cancel_token  text not null,
  created_at    timestamptz not null default now(),
  constraint borrow_time_order check (end_time > start_time)
);
create index if not exists borrows_date_idx on public.borrows (borrow_date, start_time);

-- ------------------------------------------------------------
-- 3. 公开视图（不含联系方式）
--    anon 只能读这些视图，读不到原表
-- ------------------------------------------------------------
create or replace view public.bookings_public as
select id, band_name, leader_name, booking_date, start_time, end_time,
       needs_double_pedal, note, created_at
from public.bookings;

create or replace view public.equipment_public as
select id, name, total_qty, note, sort_order
from public.equipment;

create or replace view public.borrows_public as
select id, equipment_id, item_name, qty, borrower_name,
       borrow_date, start_time, end_time, note, status, created_at
from public.borrows;

-- ------------------------------------------------------------
-- 4. 权限：先全禁，再开视图
-- ------------------------------------------------------------
revoke all on public.bookings   from anon;
revoke all on public.borrows    from anon;
revoke all on public.equipment  from anon;

grant select on public.bookings_public  to anon, authenticated;
grant select on public.equipment_public to anon, authenticated;
grant select on public.borrows_public   to anon, authenticated;

alter table public.bookings  enable row level security;
alter table public.borrows   enable row level security;
alter table public.equipment enable row level security;

-- 登录用户（管理员）拥有全部权限，具体由策略放行
grant select, insert, update, delete on public.bookings  to authenticated;
grant select, insert, update, delete on public.borrows   to authenticated;
grant select, insert, update, delete on public.equipment to authenticated;

drop policy if exists admin_all_bookings  on public.bookings;
drop policy if exists admin_all_borrows   on public.borrows;
drop policy if exists admin_all_equipment on public.equipment;

create policy admin_all_bookings  on public.bookings  for all to authenticated using (true) with check (true);
create policy admin_all_borrows   on public.borrows   for all to authenticated using (true) with check (true);
create policy admin_all_equipment on public.equipment for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 5. 预约：创建 / 取消（security definer，绕过 RLS）
-- ------------------------------------------------------------
create or replace function public.create_booking(
  p_band text, p_leader text, p_contact_type text, p_contact text,
  p_date date, p_start time, p_end time, p_double boolean,
  p_note text, p_token text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_now   time := (now() at time zone 'Asia/Shanghai')::time;
begin
  if coalesce(btrim(p_band), '') = ''   then raise exception '乐队名不能为空';   end if;
  if coalesce(btrim(p_leader), '') = '' then raise exception '负责人不能为空';   end if;
  if coalesce(btrim(p_contact), '') = '' then raise exception '联系方式不能为空'; end if;
  if p_contact_type not in ('wechat','qq','phone') then raise exception '联系方式类型不合法'; end if;

  if p_date < v_today               then raise exception '不能预约过去的日期'; end if;
  if p_date > v_today + 10          then raise exception '最多只能预约 10 天以内'; end if;
  if p_end <= p_start               then raise exception '结束时间必须晚于开始时间'; end if;
  if not ((p_start >= time '10:00' and p_end <= time '14:00')
       or (p_start >= time '17:30' and p_end <= time '21:00')) then
    raise exception '不在开放时间内（10:00–14:00 / 17:30–21:00）';
  end if;
  if p_date = v_today and p_start <= v_now then
    raise exception '这个时段已经开始或过去了';
  end if;

  insert into public.bookings (
    band_name, leader_name, contact_type, contact,
    booking_date, start_time, end_time, needs_double_pedal, note, cancel_token
  ) values (
    btrim(p_band), btrim(p_leader), p_contact_type, btrim(p_contact),
    p_date, p_start, p_end, coalesce(p_double, false), coalesce(p_note, ''), p_token
  ) returning id into v_id;

  return v_id;
end $$;

create or replace function public.cancel_booking(p_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v uuid;
begin
  delete from public.bookings
   where id = p_id and cancel_token = p_token
   returning id into v;
  if v is null then raise exception '取消失败：记录不存在或凭证不对'; end if;
  return true;
end $$;

-- ------------------------------------------------------------
-- 6. 外借：创建 / 取消
-- ------------------------------------------------------------
create or replace function public.create_borrow(
  p_equipment_id uuid, p_item_name text, p_qty int, p_borrower text,
  p_contact_type text, p_contact text, p_date date,
  p_start time, p_end time, p_note text, p_token text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_total int;
  v_used  int;
begin
  if coalesce(btrim(p_borrower), '') = '' then raise exception '借用人不能为空'; end if;
  if coalesce(btrim(p_contact), '') = ''  then raise exception '联系方式不能为空'; end if;
  if p_qty is null or p_qty < 1           then raise exception '数量至少为 1'; end if;
  if p_date < v_today                     then raise exception '不能选择过去的日期'; end if;
  if p_date > v_today + 10                then raise exception '最多只能提前 10 天'; end if;
  if p_end <= p_start                     then raise exception '归还时间必须晚于开始时间'; end if;

  if p_equipment_id is not null then
    select total_qty into v_total from public.equipment where id = p_equipment_id;
    if v_total is null then raise exception '设备不存在'; end if;

    select coalesce(sum(qty), 0) into v_used
      from public.borrows
     where equipment_id = p_equipment_id
       and status in ('pending','approved')
       and borrow_date = p_date
       and start_time < p_end and end_time > p_start;

    if v_used + p_qty > v_total then
      raise exception '库存不足：这个时段只剩 % 件', greatest(v_total - v_used, 0);
    end if;
  end if;

  insert into public.borrows (
    equipment_id, item_name, qty, borrower_name, contact_type, contact,
    borrow_date, start_time, end_time, note, status, cancel_token
  ) values (
    p_equipment_id, p_item_name, p_qty, btrim(p_borrower), p_contact_type, btrim(p_contact),
    p_date, p_start, p_end, coalesce(p_note, ''), 'pending', p_token
  ) returning id into v_id;

  return v_id;
end $$;

create or replace function public.cancel_borrow(p_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v uuid;
begin
  delete from public.borrows
   where id = p_id and cancel_token = p_token
   returning id into v;
  if v is null then raise exception '取消失败：记录不存在或凭证不对'; end if;
  return true;
end $$;

grant execute on function public.create_booking(text,text,text,text,date,time,time,boolean,text,text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid,text) to anon, authenticated;
grant execute on function public.create_borrow(uuid,text,int,text,text,text,date,time,time,text,text) to anon, authenticated;
grant execute on function public.cancel_borrow(uuid,text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. 初始设备（只插一次）
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.equipment) then
    insert into public.equipment (name, total_qty, note, sort_order) values
      ('音箱（一体式）', 2, '含电源线、喇叭线', 10),
      ('鼓组（爵士鼓）', 1, '不含镲片', 20),
      ('贝斯音箱',       1, '', 30),
      ('麦克风',         4, '含支架', 40),
      ('DI 盒',          2, '', 50),
      ('电源排插',       3, '', 60);
  end if;
end $$;
