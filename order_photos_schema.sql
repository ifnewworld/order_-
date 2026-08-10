-- ============================================================
-- 사진 관리 테이블 (order_photos)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. 테이블 생성
create table if not exists order_photos (
    id           uuid primary key default gen_random_uuid(),
    order_id     uuid not null references orders(id) on delete cascade,
    url          text not null,
    filename     text,
    uploaded_by  text,
    created_at   timestamptz not null default now()
);

-- 2. RLS
alter table order_photos enable row level security;
create policy "public read"   on order_photos for select using (true);
create policy "public insert" on order_photos for insert with check (true);
create policy "public delete" on order_photos for delete using (true);

-- 3. Realtime
alter publication supabase_realtime add table order_photos;

-- 4. 스키마 캐시 갱신
notify pgrst, 'reload schema';

-- ============================================================
-- Supabase Storage 버킷 설정 (대시보드에서 수동으로)
-- Storage > New bucket
--   name: order-photos
--   Public: ON
-- ============================================================
