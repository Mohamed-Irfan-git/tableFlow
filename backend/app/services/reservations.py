from datetime import date, datetime, time, timedelta

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Reservation, ReservationStatus, RestaurantTable, TableStatus, User


class ReservationConflictError(Exception):
    """Raised when no compatible table can be secured for an arrival slot."""


def _slot_overlap_filters(reservation_date: date, slot_start: time):
    requested_start = datetime.combine(reservation_date, slot_start)
    window_start = requested_start - timedelta(hours=1)
    window_end = requested_start + timedelta(hours=1)
    return (
        Reservation.reservation_date >= window_start.date(),
        Reservation.reservation_date <= window_end.date(),
        or_(
            Reservation.reservation_date > window_start.date(),
            and_(
                Reservation.reservation_date == window_start.date(),
                Reservation.slot_start > window_start.time(),
            ),
        ),
        or_(
            Reservation.reservation_date < window_end.date(),
            and_(
                Reservation.reservation_date == window_end.date(),
                Reservation.slot_start < window_end.time(),
            ),
        ),
        Reservation.status.in_(
            (ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN)
        ),
    )


def find_reserved_table_ids(
    db: Session,
    *,
    reservation_date: date,
    slot_start: time,
    table_ids: list[int],
) -> set[int]:
    if not table_ids:
        return set()
    return set(
        db.scalars(
            select(Reservation.table_id).where(
                Reservation.table_id.in_(table_ids),
                *_slot_overlap_filters(reservation_date, slot_start),
            )
        ).all()
    )


def _candidate_tables(
    restaurant_id: int,
    reservation_date: date,
    slot_start: time,
    guest_count: int,
) -> Select[tuple[RestaurantTable]]:
    overlapping_reservation = select(Reservation.id).where(
        Reservation.table_id == RestaurantTable.id,
        *_slot_overlap_filters(reservation_date, slot_start),
    )
    return (
        select(RestaurantTable)
        .where(
            RestaurantTable.restaurant_id == restaurant_id,
            RestaurantTable.capacity >= guest_count,
            RestaurantTable.status != TableStatus.UNAVAILABLE,
            ~overlapping_reservation.exists(),
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
    preferred_table_id: int | None,
    notes: str | None,
) -> Reservation:
    """Lock and claim a requested compatible table, or the smallest compatible table."""
    candidate_query = _candidate_tables(
        restaurant_id, reservation_date, slot_start, guest_count
    )
    if preferred_table_id is not None:
        candidate_query = candidate_query.where(RestaurantTable.id == preferred_table_id)

    candidates = db.scalars(
        candidate_query.with_for_update(skip_locked=True)
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
