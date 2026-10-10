from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.session import get_db
from app.models import RestaurantTable, Role, TableStatus, User
from app.realtime.hub import event_hub
from app.schemas.restaurants import TablePublic, TableStatusUpdate

router = APIRouter(prefix="/tables", tags=["tables"])
staff_roles = (Role.HOST, Role.WAITER, Role.MANAGER, Role.ADMIN)


@router.get("", response_model=list[TablePublic])
def list_tables(
    restaurant_id: int,
    _: User = Depends(require_roles(*staff_roles)),
    db: Session = Depends(get_db),
) -> list[RestaurantTable]:
    return list(
        db.scalars(
            select(RestaurantTable)
            .where(RestaurantTable.restaurant_id == restaurant_id)
            .order_by(RestaurantTable.number)
        ).all()
    )


@router.patch("/{table_id}/status", response_model=TablePublic)
async def update_table_status(
    table_id: int,
    payload: TableStatusUpdate,
    _: User = Depends(require_roles(*staff_roles)),
    db: Session = Depends(get_db),
) -> RestaurantTable:
    table = db.get(RestaurantTable, table_id)
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.status == TableStatus.OCCUPIED and payload.status == TableStatus.RESERVED:
        raise HTTPException(status_code=409, detail="Seat must be cleared before reserving")

    table.status = payload.status
    db.commit()
    db.refresh(table)
    await event_hub.broadcast(
        table.restaurant_id,
        {"type": "table.updated", "table_id": table.id, "status": table.status.value},
    )
    return table
