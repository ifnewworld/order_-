from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from app.db import get_supabase
from app.schemas import PhotoOut
from typing import List, Optional
import uuid

router = APIRouter()
BUCKET = "order-photos"
TABLE = "order_photos"
ORDERS_TABLE = "orders"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_MB = 10


@router.get("/{order_id}", response_model=List[PhotoOut])
async def list_photos(order_id: uuid.UUID):
    sb = get_supabase()
    res = (
        sb.table(TABLE)
        .select("*")
        .eq("order_id", str(order_id))
        .order("created_at", desc=False)
        .execute()
    )
    return res.data


@router.post("/{order_id}", response_model=PhotoOut, status_code=201)
async def upload_photo(
    order_id: uuid.UUID,
    file: UploadFile = File(...),
    uploaded_by: Optional[str] = Form(None),
):
    # 파일 타입 검증
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="jpg/png/webp/gif 파일만 업로드 가능합니다")

    contents = await file.read()

    # 파일 크기 검증
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"파일 크기는 {MAX_SIZE_MB}MB 이하여야 합니다")

    sb = get_supabase()

    # Storage 경로: orders/{order_id}/{uuid}.{ext}
    ext = (file.filename or "photo").rsplit(".", 1)[-1].lower()
    storage_path = f"orders/{order_id}/{uuid.uuid4()}.{ext}"

    upload_res = sb.storage.from_(BUCKET).upload(
        path=storage_path,
        file=contents,
        file_options={"content-type": file.content_type},
    )

    if hasattr(upload_res, "error") and upload_res.error:
        raise HTTPException(status_code=500, detail="Storage 업로드 실패")

    # Public URL 조회
    public_url = sb.storage.from_(BUCKET).get_public_url(storage_path)

    # order_photos 테이블에 기록
    row = {
        "order_id": str(order_id),
        "url": public_url,
        "filename": file.filename,
        "uploaded_by": uploaded_by,
    }
    insert_res = sb.table(TABLE).insert(row).execute()

    if not insert_res.data:
        raise HTTPException(status_code=500, detail="DB 저장 실패")

    # 사진이 생겼으니 photo_taken = true 자동 반영
    sb.table(ORDERS_TABLE).update({"photo_taken": True}).eq(
        "id", str(order_id)
    ).execute()

    return insert_res.data[0]

from fastapi.responses import StreamingResponse
import httpx

@router.get("/{photo_id}/download")
async def download_photo(photo_id: uuid.UUID):
    sb = get_supabase()
    res = sb.table(TABLE).select("url, filename").eq("id", str(photo_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")

    url: str = res.data[0]["url"]
    filename: str = res.data[0]["filename"] or "photo.jpg"

    async with httpx.AsyncClient() as client:
        r = await client.get(url)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="이미지 다운로드 실패")

    from urllib.parse import quote

    encoded_filename = quote(filename, safe='')

    return StreamingResponse(
        iter([r.content]),
        media_type=r.headers.get("content-type", "image/jpeg"),
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )

@router.delete("/{photo_id}", status_code=204)
async def delete_photo(photo_id: uuid.UUID):
    sb = get_supabase()

    # 삭제 전 URL 조회 (Storage 경로 추출용)
    res = sb.table(TABLE).select("url, order_id").eq("id", str(photo_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")

    url: str = res.data[0]["url"]
    order_id: str = res.data[0]["order_id"]

    # Storage 경로 추출: URL에서 /order-photos/ 이후 부분
    marker = f"/{BUCKET}/"
    if marker in url:
        storage_path = url.split(marker, 1)[1].split("?")[0]
        sb.storage.from_(BUCKET).remove([storage_path])

    # DB 레코드 삭제
    sb.table(TABLE).delete().eq("id", str(photo_id)).execute()

    # 남은 사진이 없으면 photo_taken = false 로 되돌림
    remaining = (
        sb.table(TABLE).select("id").eq("order_id", order_id).execute()
    )
    if not remaining.data:
        sb.table(ORDERS_TABLE).update({"photo_taken": False}).eq(
            "id", order_id
        ).execute()
