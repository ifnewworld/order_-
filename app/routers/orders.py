from fastapi import APIRouter, HTTPException
from app.db import get_supabase
from app.schemas import OrderCreate, OrderUpdate, OrderOut
from typing import List
import uuid

router = APIRouter()
TABLE = "orders"


@router.get("", response_model=List[OrderOut])
async def list_orders():
    sb = get_supabase()
    res = sb.table(TABLE).select("*").order("created_at", desc=True).execute()
    return res.data


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(payload: OrderCreate):
    sb = get_supabase()
    res = sb.table(TABLE).insert(payload.model_dump()).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="저장 실패")
    return res.data[0]


@router.patch("/{order_id}", response_model=OrderOut)
async def update_order(order_id: uuid.UUID, payload: OrderUpdate):
    sb = get_supabase()
    data = payload.model_dump(exclude_none=True)

    # modified_by는 orders 테이블에 저장하지 않고, 로그용으로만 분리
    modified_by = data.pop("modified_by", None)

    if not data:
        raise HTTPException(status_code=400, detail="수정할 필드가 없습니다")

    res = (
        sb.table(TABLE)
        .update(data)
        .eq("id", str(order_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

    # 로그에 modified_by 직접 기록 (트리거가 못하는 부분을 보완)
    if modified_by:
        sb.table("order_logs").update({"modified_by": modified_by}).eq(
            "order_id", str(order_id)
        ).is_("modified_by", "null").order(
            "created_at", desc=True
        ).limit(1).execute()

    return res.data[0]


@router.delete("/{order_id}", status_code=204)
async def delete_order(order_id: uuid.UUID):
    sb = get_supabase()
    sb.table(TABLE).delete().eq("id", str(order_id)).execute()
