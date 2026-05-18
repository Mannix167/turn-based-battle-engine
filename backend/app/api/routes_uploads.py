from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from app.config import UPLOAD_DIR


router = APIRouter()


async def save_raw_upload(request: Request, folder: str, filename: str | None) -> dict[str, str]:
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Upload body is empty")
    safe_name = Path(filename or f"{uuid4().hex}.bin").name
    target_dir = UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / safe_name
    target.write_bytes(content)
    return {"url": f"/uploads/{folder}/{safe_name}"}


@router.post("/portrait")
async def upload_portrait(request: Request, filename: str | None = None) -> dict[str, str]:
    return await save_raw_upload(request, "portraits", filename)


@router.post("/token")
async def upload_token(request: Request, filename: str | None = None) -> dict[str, str]:
    return await save_raw_upload(request, "tokens", filename)
