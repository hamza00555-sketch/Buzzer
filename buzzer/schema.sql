-- ============================================================
--  مخطط قاعدة بيانات تطبيق الباصرة (Quiz Buzzer)
--  شغّله في Supabase SQL Editor لإعادة بناء الـ backend من الصفر.
-- ============================================================

-- ---------- الجداول ----------
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  state      text not null default 'lobby',   -- lobby | armed | locked
  round      int  not null default 0,
  question   text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  name      text not null,
  score     int  not null default 0,
  joined_at timestamptz not null default now()
);

create table if not exists public.buzzes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      int  not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(), -- وقت السيرفر = أساس الترتيب العادل
  constraint buzzes_unique_per_round unique (room_id, round, player_id)
);

create index if not exists idx_players_room on public.players(room_id);
create index if not exists idx_buzzes_room_round on public.buzzes(room_id, round, created_at);

-- ---------- التزامن اللحظي (Realtime) ----------
alter table public.rooms   replica identity full;
alter table public.players replica identity full;
alter table public.buzzes  replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms')   then alter publication supabase_realtime add table public.rooms;   end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='players') then alter publication supabase_realtime add table public.players; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='buzzes')  then alter publication supabase_realtime add table public.buzzes;  end if;
end $$;

-- ---------- الصلاحيات (RLS) ----------
-- سياسات سمحة مناسبة للعبة فرح غير حساسة. للتشديد راجع قسم الأمان في DOCUMENTATION.md
alter table public.rooms   enable row level security;
alter table public.players enable row level security;
alter table public.buzzes  enable row level security;

drop policy if exists anon_all_rooms   on public.rooms;
drop policy if exists anon_all_players on public.players;
drop policy if exists anon_all_buzzes  on public.buzzes;

create policy anon_all_rooms   on public.rooms   for all to anon using (true) with check (true);
create policy anon_all_players on public.players for all to anon using (true) with check (true);
create policy anon_all_buzzes  on public.buzzes  for all to anon using (true) with check (true);
