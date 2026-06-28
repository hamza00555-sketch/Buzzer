-- ============================================================
--  مخطط قاعدة بيانات تطبيق الباصرة (Quiz Buzzer + أوضاع اللعب)
--  شغّله في Supabase SQL Editor لإعادة بناء الـ backend من الصفر.
-- ============================================================

-- ---------- الجداول ----------
create table if not exists public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  mode             text not null default 'buzz',   -- buzz | mcq | feud | closest
  phase            text not null default 'lobby',  -- lobby | live | reveal
  round            int  not null default 0,
  question         text not null default '',
  payload          jsonb not null default '{}'::jsonb,  -- إعدادات/نتائج الجولة الحالية
  round_started_at timestamptz,                          -- بداية مرحلة live (لمزامنة المؤقّت)
  created_at       timestamptz not null default now()
);

create table if not exists public.players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  name      text not null,
  score     int  not null default 0,
  joined_at timestamptz not null default now()
);

-- ضغطات وضع الباصرة (الترتيب العادل من وقت السيرفر)
create table if not exists public.buzzes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      int  not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint buzzes_unique_per_round unique (room_id, round, player_id)
);

-- إجابات بقية الأوضاع (mcq: فهرس الخيار · feud: نص التخمين · closest: الرقم)
create table if not exists public.answers (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      int  not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  value      text not null,
  is_correct boolean,
  points     int  not null default 0,
  created_at timestamptz not null default now(),
  -- يمنع نفس القيمة مرتين، ويسمح بتخمينات مختلفة (مهم لـ Family Feud)
  constraint answers_unique_value unique (room_id, round, player_id, value)
);

create index if not exists idx_players_room        on public.players(room_id);
create index if not exists idx_buzzes_room_round    on public.buzzes(room_id, round, created_at);
create index if not exists idx_answers_room_round   on public.answers(room_id, round, created_at);

-- ---------- التزامن اللحظي (Realtime) ----------
alter table public.rooms   replica identity full;
alter table public.players replica identity full;
alter table public.buzzes  replica identity full;
alter table public.answers replica identity full;

do $$
declare t text;
begin
  foreach t in array array['rooms','players','buzzes','answers'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- الصلاحيات (RLS) ----------
-- سياسات سمحة مناسبة للعبة فرح غير حساسة. للتشديد راجع قسم الأمان في DOCUMENTATION.md
alter table public.rooms   enable row level security;
alter table public.players enable row level security;
alter table public.buzzes  enable row level security;
alter table public.answers enable row level security;

drop policy if exists anon_all_rooms   on public.rooms;
drop policy if exists anon_all_players on public.players;
drop policy if exists anon_all_buzzes  on public.buzzes;
drop policy if exists anon_all_answers on public.answers;

create policy anon_all_rooms   on public.rooms   for all to anon using (true) with check (true);
create policy anon_all_players on public.players for all to anon using (true) with check (true);
create policy anon_all_buzzes  on public.buzzes  for all to anon using (true) with check (true);
create policy anon_all_answers on public.answers for all to anon using (true) with check (true);
