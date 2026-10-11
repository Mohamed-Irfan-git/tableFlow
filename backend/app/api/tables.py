from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.session import get_db
from app.models import Restaurant, RestaurantTable, Role, TableStatus, User
from app.realtime.hub import event_hub
from app.schemas.restaurants import TableFloorInfo, TablePublic, TableStatusUpdate
from app.services.reservations import find_available_tables, find_reserved_table_ids
from app.services.table_status import (
    current_table_statuses,
    has_current_or_future_reservation,
    restaurant_now,
)

router = APIRouter(prefix="/tables", tags=["tables"])
staff_roles = (Role.HOST, Role.WAITER, Role.MANAGER, Role.ADMIN)


@router.get("/floor", response_model=list[TableFloorInfo])
def floor_availability(
    restaurant_id: int = Query(gt=0),
    reservation_date: date = Query(...),
    slot_start: time = Query(...),
    guest_count: int = Query(ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Public floor plan data: every non-UNAVAILABLE table with a slot-specific status."""
    # Get all non-unavailable tables for this restaurant
    all_tables = list(
        db.scalars(
            select(RestaurantTable)
            .where(
                RestaurantTable.restaurant_id == restaurant_id,
                RestaurantTable.status != TableStatus.UNAVAILABLE,
            )
            .order_by(RestaurantTable.number)
        ).all()
    )

    # Find table IDs that have an active reservation for the selected date+slot
    reserved_for_slot = find_reserved_table_ids(
        db,
        reservation_date=reservation_date,
        slot_start=slot_start,
        table_ids=[table.id for table in all_tables],
    )

    # Get bookable table IDs (available for the slot AND fits guest count)
    available_ids = {
        t.id
        for t in find_available_tables(
            db,
            restaurant_id=restaurant_id,
            reservation_date=reservation_date,
            slot_start=slot_start,
            guest_count=guest_count,
        )
    }

    def table_shape(capacity: int) -> str:
        return "round" if capacity <= 2 or capacity == 4 else "wide"

    def slot_status(table: RestaurantTable) -> str:
        if table.id in reserved_for_slot:
            return "RESERVED"
        return "AVAILABLE"

    return [
        {
            "id": t.id,
            "number": t.number,
            "capacity": t.capacity,
            "location": t.location,
            "shape": table_shape(t.capacity),
            "status": slot_status(t),
            "available": t.id in available_ids,
            "fits_party": t.capacity >= guest_count,
        }
        for t in all_tables
    ]


@router.get("", response_model=list[TablePublic])
def list_tables(
    restaurant_id: int,
    _: User = Depends(require_roles(*staff_roles)),
    db: Session = Depends(get_db),
) -> list[dict]:
    restaurant = db.get(Restaurant, restaurant_id)
    tables = list(
        db.scalars(
            select(RestaurantTable)
            .where(RestaurantTable.restaurant_id == restaurant_id)
            .order_by(RestaurantTable.number)
        ).all()
    )
    if restaurant is None:
        return []

    now = restaurant_now(restaurant.timezone)
    effective_statuses = current_table_statuses(db, tables=tables, now=now)
    result = []
    for table in tables:
        payload = TablePublic.model_validate(table).model_dump()
        payload["status"] = effective_statuses[table.id]
        result.append(payload)
    return result


@router.patch("/{table_id}/status", response_model=TablePublic)
async def update_table_status(
    table_id: int,
    payload: TableStatusUpdate,
    _: User = Depends(require_roles(*staff_roles)),
    db: Session = Depends(get_db),
) -> RestaurantTable:
    table = db.scalar(
        select(RestaurantTable)
        .where(RestaurantTable.id == table_id)
        .with_for_update()
    )
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")
    if payload.status == TableStatus.RESERVED:
        raise HTTPException(
            status_code=422,
            detail="Reserved status is managed by confirmed reservations",
        )
    if payload.status == TableStatus.UNAVAILABLE:
        restaurant = db.get(Restaurant, table.restaurant_id)
        now = restaurant_now(restaurant.timezone if restaurant else "Asia/Colombo")
        if has_current_or_future_reservation(db, table_id=table.id, now=now):
            raise HTTPException(
                status_code=409,
                detail="This table has an active reservation. Move or cancel it before marking the table unavailable.",
            )

    table.status = payload.status
    db.commit()
    db.refresh(table)
    restaurant = db.get(Restaurant, table.restaurant_id)
    now = restaurant_now(restaurant.timezone if restaurant else "Asia/Colombo")
    effective_status = current_table_statuses(db, tables=[table], now=now)[table.id]
    response = TablePublic.model_validate(table).model_dump()
    response["status"] = effective_status
    await event_hub.broadcast(
        table.restaurant_id,
        {"type": "table.updated", "table_id": table.id, "status": effective_status.value},
    )
    return response
