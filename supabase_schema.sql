-- 엄만달 서버 스키마 v1 — 사용자별 데이터 동기화
-- 새 개인 Supabase 계정 연결 후 적용할 것

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 행 수준 보안: 본인 데이터만 읽고 쓸 수 있다
alter table public.user_data enable row level security;

create policy "own_select" on public.user_data
  for select using ((select auth.uid()) = user_id);
create policy "own_insert" on public.user_data
  for insert with check ((select auth.uid()) = user_id);
create policy "own_update" on public.user_data
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own_delete" on public.user_data
  for delete using ((select auth.uid()) = user_id);
