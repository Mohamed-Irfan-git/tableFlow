import io
import base64
import binascii
import secrets
from pathlib import Path
import os

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.session import get_db
from app.models import MenuItem, Restaurant, RestaurantTable, Role, User

import logging
from supabase import create_client

router = APIRouter(prefix="/menu", tags=["menu"])


class MenuPayload(BaseModel):
    restaurant_id: int
    name: str = Field(min_length=2, max_length=120)
    detail: str = Field(default="", max_length=400)
    category: str = Field(min_length=2, max_length=60)
    image: str = Field(default="/images/dish-pasta.png", max_length=500)
    price_cents: int = Field(gt=0, le=100000000)
    available: bool = True


class MenuPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    detail: str | None = Field(default=None, max_length=400)
    category: str | None = Field(default=None, min_length=2, max_length=60)
    image: str | None = Field(default=None, max_length=500)
    price_cents: int | None = Field(default=None, gt=0, le=100000000)
    available: bool | None = None


def serialize(item: MenuItem):
    return {key: getattr(item, key) for key in ("id", "name", "detail", "category", "image", "price_cents", "available")}


def check_image(url: str):
    # Only built-in image paths or remote HTTPS images; no javascript/data URLs.
    if not (url.startswith("/images/") or url.startswith("https://") or url.startswith("/api/v1/menu/photos/")):
        raise HTTPException(422, "Image must be an uploaded image, /images/... or HTTPS URL")


@router.get("")
def list_menu(restaurant_id: int, db: Session = Depends(get_db)):
    return [serialize(item) for item in db.scalars(select(MenuItem).where(MenuItem.restaurant_id == restaurant_id).order_by(MenuItem.id)).all()]


@router.post("", status_code=201)
def add_menu(payload: MenuPayload, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    if not db.get(Restaurant, payload.restaurant_id):
        raise HTTPException(404, "Restaurant not found")
    check_image(payload.image)
    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize(item)


@router.patch("/{item_id}")
def patch_menu(item_id: int, payload: MenuPatch, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(404, "Menu item not found")
    updates = payload.model_dump(exclude_unset=True)
    if "image" in updates:
        check_image(updates["image"])
    for key, value in updates.items():
        setattr(item, key, value)
    db.commit()
    return serialize(item)


@router.delete("/{item_id}", status_code=204)
def delete_menu(item_id: int, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(404, "Menu item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.get("/qr")
def qr_svg(restaurant_id: int, db: Session = Depends(get_db)):
    if not db.get(Restaurant, restaurant_id):
        raise HTTPException(404, "Restaurant not found")
    base = os.getenv("PUBLIC_CUSTOMER_URL", "http://localhost:3000").rstrip("/")
    url = base + "/menu"
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=3)
    output = io.BytesIO()
    img.save(output)
    return Response(content=output.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


PHOTO_DIR = Path(os.getenv("TABLEFLOW_PHOTO_DIR", "/app/uploaded_menu_photos"))

class PhotoUpload(BaseModel):
    filename: str = Field(max_length=160)
    data: str  # base64; validated below

@router.post("/photos", status_code=201)
def upload_photo(
    payload: PhotoUpload,
    _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)),
):
    ext = Path(payload.filename.lower()).suffix

    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }

    if ext not in content_types:
        raise HTTPException(
            status_code=422,
            detail="Choose a JPG, PNG, WebP or GIF photo",
        )

    if len(payload.data) > 8_000_000:
        raise HTTPException(
            status_code=413,
            detail="Photo too large (maximum 4 MB)",
        )

    try:
        raw = base64.b64decode(payload.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=422, detail="Invalid image data")

    if not raw or len(raw) > 4_000_000:
        raise HTTPException(
            status_code=413,
            detail="Photo must be under 4 MB",
        )

    signatures = {
        ".jpg": lambda data: data.startswith(b"\xff\xd8\xff"),
        ".jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
        ".png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
        ".webp": lambda data: (
            data.startswith(b"RIFF") and data[8:12] == b"WEBP"
        ),
        ".gif": lambda data: data.startswith((b"GIF87a", b"GIF89a")),
    }

    if not signatures[ext](raw):
        raise HTTPException(
            status_code=422,
            detail="File contents do not match image type",
        )

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "menu-item")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=503,
            detail="Image storage is not configured",
        )

    # Generate a random filename rather than trusting the uploaded filename.
    name = f"{secrets.token_hex(16)}{ext}"

    try:
        supabase = create_client(supabase_url, supabase_key)

        supabase.storage.from_(bucket).upload(
            name,
            raw,
            file_options={
                "content-type": content_types[ext],
                "upsert": "false",
            },
        )

        image_url = supabase.storage.from_(bucket).get_public_url(name)

        return {"image": image_url}

    except Exception:
        logging.exception("Menu photo upload to Supabase failed")
        raise HTTPException(
            status_code=502,
            detail="Could not upload photo to image storage",
        )

@router.get("/photos/{filename}")
def get_photo(filename: str):
    from fastapi.responses import FileResponse
    if filename != Path(filename).name or not filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        raise HTTPException(404, "Photo not found")
    target = PHOTO_DIR / filename
    if not target.is_file():
        raise HTTPException(404, "Photo not found")
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})
