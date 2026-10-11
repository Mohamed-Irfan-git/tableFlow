from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_optional_user, require_roles
from app.db.session import get_db
from app.models import Reservation, ReservationStatus, Restaurant, RestaurantTable, Role, User
from app.realtime.hub import event_hub
from app.schemas.reservations import (
    ReservationCancellation,
    ReservationCreate,
    ReservationPublic,
)
from app.schemas.restaurants import TablePublic
from app.services.reservations import (
    ReservationConflictError,
    cancel_reservation,
    create_reservation,
    find_available_tables,
)
from app.services.table_status import restaurant_now

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("", response_model=list[ReservationPublic])
def list_for_host(
    restaurant_id: int,
    user: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)),
    db: Session = Depends(get_db),
) -> list[Reservation]:
    """Return current and future reservations for the host desk."""
    del user  # Authorization is enforced by the dependency above.
    restaurant = db.get(Restaurant, restaurant_id)
    if restaurant is None:
        return []
    now = restaurant_now(restaurant.timezone)
    active = list(
        db.scalars(
            select(Reservation)
            .join(Reservation.table)
            .where(
                RestaurantTable.restaurant_id == restaurant_id,
                Reservation.reservation_date >= (now - timedelta(hours=1)).date(),
                Reservation.status.in_(
                    (ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN)
                ),
            )
            .order_by(Reservation.reservation_date.asc(), Reservation.slot_start.asc())
        ).all()
    )
    return [
        reservation
        for reservation in active
        if datetime.combine(reservation.reservation_date, reservation.slot_start)
        .replace(tzinfo=now.tzinfo)
        + timedelta(hours=1)
        > now
    ]


@router.get("/availability", response_model=list[TablePublic])
def availability(
    restaurant_id: int = Query(gt=0),
    reservation_date: date = Query(...),
    slot_start: time = Query(...),
    guest_count: int = Query(ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[RestaurantTable]:
    return find_available_tables(
        db,
        restaurant_id=restaurant_id,
        reservation_date=reservation_date,
        slot_start=slot_start,
        guest_count=guest_count,
    )


@router.get("/mine", response_model=list[ReservationPublic])
def list_mine(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Reservation]:
    return list(
        db.scalars(
            select(Reservation)
            .where(Reservation.customer_id == user.id)
            .order_by(Reservation.reservation_date.desc(), Reservation.slot_start.desc())
        ).all()
    )


@router.post("", response_model=ReservationPublic, status_code=status.HTTP_201_CREATED)
async def reserve(
    payload: ReservationCreate,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Reservation:
    try:
        reservation = create_reservation(db, customer=user, **payload.model_dump())
        db.commit()
        db.refresh(reservation)
    except ReservationConflictError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That arrival time just filled up") from exc

    await event_hub.broadcast(
        reservation.table.restaurant_id,
        {"type": "reservation.created", "reservation_id": reservation.id, "table_id": reservation.table_id},
    )
    return reservation


@router.post("/{reservation_id}/cancel", response_model=ReservationPublic)
async def cancel(
    reservation_id: int,
    _: ReservationCancellation,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Reservation:
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    try:
        cancel_reservation(db, reservation=reservation, customer=user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="You cannot cancel this reservation") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    db.commit()
    db.refresh(reservation)
    await event_hub.broadcast(
        reservation.table.restaurant_id,
        {"type": "reservation.cancelled", "reservation_id": reservation.id, "table_id": reservation.table_id},
    )
    return reservation
