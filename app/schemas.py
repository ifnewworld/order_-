from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class OrderBase(BaseModel):
    sku: str = Field(..., min_length=1, description="SKU 코드")
    name: str = Field(..., min_length=1, description="상품명")
    category: str = Field(..., min_length=1, description="카테고리")
    shipping_to_korea: bool = Field(False, description="한국으로 오는 중 여부")
    ordered_at: Optional[str] = Field(None, description="주문한 날짜")
    qty: int = Field(0, ge=0, description="주문 수량")
    broken: int = Field(0, ge=0, description="파손 물량")
    factory_arrived: bool = Field(False, description="공장 도착 여부")
    factory_inspected: bool = Field(False, description="공장 검수 여부")
    photo_taken: bool = Field(False, description="사진 촬영 완료 여부")
    rocket_arrived: bool = Field(False, description="로켓그로스 도착 여부")
    rocket_growth_registered: bool = Field(False, description="로켓그로스 등록 완료 여부")
    coupang_wing_registered: bool = Field(False, description="쿠팡윙 등록 완료 여부")
    extra_qty: int = Field(0, ge=0, description="추가 주문 수량")
    note: Optional[str] = Field(None, description="비고")
    


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    shipping_to_korea: Optional[bool] = None
    ordered_at: Optional[str] = None
    qty: Optional[int] = Field(None, ge=0)
    broken: Optional[int] = Field(None, ge=0)
    factory_arrived: Optional[bool] = None
    factory_inspected: Optional[bool] = None
    photo_taken: Optional[bool] = None
    rocket_arrived: Optional[bool] = None
    rocket_growth_registered: Optional[bool] = None
    coupang_wing_registered: Optional[bool] = None
    extra_qty: Optional[int] = Field(None, ge=0)
    note: Optional[str] = None
    modified_by: Optional[str] = None


class OrderOut(OrderBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
