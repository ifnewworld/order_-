-- ============================================================
-- 변경 이력 테이블 (order_logs)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. order_logs 테이블 생성
create table if not exists order_logs (
    id          uuid primary key default gen_random_uuid(),
    order_id    uuid not null,
    action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
    sku         text,
    name        text,
    changed_fields  jsonb,
    snapshot    jsonb,
    created_at  timestamptz not null default now()
);

-- 2. RLS
alter table order_logs enable row level security;
create policy "public read"   on order_logs for select using (true);
create policy "public insert" on order_logs for insert with check (true);

-- 3. Realtime 활성화
alter publication supabase_realtime add table order_logs;

-- 4. 트리거 함수
create or replace function log_order_change()
returns trigger language plpgsql as $$
declare
    changed jsonb := '{}';
    k text;
    old_val jsonb;
    new_val jsonb;
begin
    if TG_OP = 'INSERT' then
        insert into order_logs(order_id, action, sku, name, snapshot)
        values (NEW.id, 'INSERT', NEW.sku, NEW.name, to_jsonb(NEW));

    elsif TG_OP = 'UPDATE' then
        -- 변경된 필드만 추출
        for k in select key from jsonb_each(to_jsonb(NEW))
        loop
            old_val := to_jsonb(OLD) -> k;
            new_val := to_jsonb(NEW) -> k;
            if old_val is distinct from new_val
               and k not in ('updated_at') then
                changed := changed || jsonb_build_object(
                    k, jsonb_build_object('from', old_val, 'to', new_val)
                );
            end if;
        end loop;

        if changed <> '{}' then
            insert into order_logs(order_id, action, sku, name, changed_fields, snapshot)
            values (NEW.id, 'UPDATE', NEW.sku, NEW.name, changed, to_jsonb(NEW));
        end if;

    elsif TG_OP = 'DELETE' then
        -- JS에서 직접 로그를 삽입하므로 트리거에서는 생략
        null;
    end if;

    return coalesce(NEW, OLD);
end;
$$;

-- 5. 트리거 등록
drop trigger if exists trg_order_logs on orders;
create trigger trg_order_logs
after insert or update or delete on orders
for each row execute function log_order_change();

-- 스키마 캐시 갱신
notify pgrst, 'reload schema';

-- 수정자 컬럼 추가 (로그인 없이 이름 입력 방식)
alter table order_logs add column if not exists modified_by text;