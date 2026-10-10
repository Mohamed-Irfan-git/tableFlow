from datetime import date, time

from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Reservation, ReservationStatus, RestaurantTable, TableStatus, User


class ReservationConflictError(Exception):
    """Raised when no compatible table can be secured for an arrival slot."""


def _candidate_tables(
    restaurant_id: int,
    reservation_date: date,
    slot_start: time,
    guest_count: int,
) -> Select[tuple[RestaurantTable]]:
    occupied_slot = select(Reservation.id).where(
        Reservation.table_id == RestaurantTable.id,
        Reservation.reservation_date == reservation_date,
        Reservation.slot_start == slot_start,
        Reservation.status.in_((ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN)),
    )
    return (
        select(RestaurantTable)
        .where(
            RestaurantTable.restaurant_id == restaurant_id,
            RestaurantTable.capacity >= guest_count,
            RestaurantTable.status != TableStatus.UNAVAILABLE,
            ~occupied_slot.exists(),
        )
        .order_by(RestaurantTable.capacity.asc(), RestaurantTable.number.asc())
    )


def find_available_tables(
    db: Session,
    *,
    restaurant_id: int,
    reservation_date: date,
    slot_start: time,
    guest_count: int,
) -> list[RestaurantTable]:
    return list(
        db.scalars(
            _candidate_tables(restaurant_id, reservation_date, slot_start, guest_count)
        ).all()
    )


def create_reservation(
    db: Session,
    *,
    customer: User | None,
    restaurant_id: int,
    reservation_date: date,
    slot_start: time,
    guest_count: int,
    guest_name: str,
    guest_email: str,
    notes: str | None,
) -> Reservation:
    """Claim the smallest suitable table while holding a row lock until commit."""
    candidates = db.scalars(
        _candidate_tables(restaurant_id, reservation_date, slot_start, guest_count).with_for_update(
            skip_locked=True
        )
    ).all()

    for table in candidates:
        reservation = Reservation(
            customer_id=customer.id if customer is not None else None,
            table_id=table.id,
            guest_name=guest_name.strip(),
            guest_email=guest_email.lower(),
            reservation_date=reservation_date,
            slot_start=slot_start,
            guest_count=guest_count,
            notes=notes,
        )
        try:
            with db.begin_nested():
                db.add(reservation)
                db.flush()
            return reservation
        except IntegrityError:
            # A second writer claimed this table after availability was evaluated.
            continue

    raise ReservationConflictError


def cancel_reservation(db: Session, *, reservation: Reservation, customer: User) -> Reservation:
    if reservation.customer_id != customer.id and customer.role.value not in {"HOST", "MANAGER", "ADMIN"}:
        raise PermissionError
    if reservation.status == ReservationStatus.CANCELLED:
        return reservation
    if reservation.status == ReservationStatus.CHECKED_IN:
        raise ValueError("Checked-in reservations cannot be cancelled")
    reservation.status = ReservationStatus.CANCELLED
    db.flush()
    return reservation
