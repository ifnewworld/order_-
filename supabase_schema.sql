-- ============================================================
-- 발주 관리 시스템 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

create table if not exists orders (
    id          uuid primary key default gen_random_uuid(),
    sku         text not null,
    name        text not null,
    category    text not null,
    qty         integer not null default 0,
    broken      integer not null default 0,
    factory_arrived  boolean not null default false,
    factory_inspected boolean not null default false,
    rocket_arrived   boolean not null default false,
    rocket_growth_registered boolean not null default false,
    coupang_wing_registered  boolean not null default false,
    extra_qty   integer not null default 0,
    note        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- updated_at 자동 갱신 함수
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_orders_updated_at
before update on orders
for each row execute function update_updated_at();

-- RLS: 공개 읽기 / 공개 쓰기 (팀 공유 목적)
alter table orders enable row level security;

create policy "public read"  on orders for select using (true);
create policy "public insert" on orders for insert with check (true);
create policy "public update" on orders for update using (true);
create policy "public delete" on orders for delete using (true);

-- Realtime 활성화
alter publication supabase_realtime add table orders;

alter table orders
  add column if not exists rocket_growth_registered boolean not null default false,
  add column if not exists coupang_wing_registered  boolean not null default false;
  ADD COLUMN IF NOT EXISTS photo_taken BOOLEAN NOT NULL DEFAULT FALSE;
  ADD COLUMN IF NOT EXISTS shipping_to_korea BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ordered_at DATE;


ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS rocket_inbound_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rocket_inbound_completed  BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
-- 스키마 캐시 강제 갱신
notify pgrst, 'reload schema';