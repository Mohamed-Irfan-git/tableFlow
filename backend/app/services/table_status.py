from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Reservation, ReservationStatus, RestaurantTable, TableStatus
from app.services.reservations import _slot_overlap_filters


def restaurant_now(timezone: str, *, at: datetime | None = None) -> datetime:
    """Return an aware local time for a restaurant's operational timezone."""
    zone = ZoneInfo(timezone)
    if at is None:
        return datetime.now(zone)
    return at.replace(tzinfo=zone) if at.tzinfo is None else at.astimezone(zone)


def current_table_statuses(
    db: Session,
    *,
    tables: list[RestaurantTable],
    now: datetime,
) -> dict[int, TableStatus]:
    """Overlay live reservation state on persistent physical table conditions."""
    if not tables:
        return {}

    live_reservations = db.execute(
        select(Reservation.table_id, Reservation.status).where(
            Reservation.table_id.in_([table.id for table in tables]),
            *_slot_overlap_filters(
                now.date(), now.time().replace(tzinfo=None)
            ),
        )
    ).all()
    status_by_table: dict[int, TableStatus] = {}
    for table_id, reservation_status in live_reservations:
        next_status = (
            TableStatus.OCCUPIED
            if reservation_status == ReservationStatus.CHECKED_IN
            else TableStatus.RESERVED
        )
        if next_status == TableStatus.OCCUPIED or table_id not in status_by_table:
            status_by_table[table_id] = next_status

    effective: dict[int, TableStatus] = {}
    for table in tables:
        if table.status in {TableStatus.OCCUPIED, TableStatus.UNAVAILABLE}:
            effective[table.id] = table.status
        else:
            effective[table.id] = status_by_table.get(table.id, TableStatus.AVAILABLE)
    return effective


def has_current_or_future_reservation(
    db: Session,
    *,
    table_id: int,
    now: datetime,
) -> bool:
    """A reservation only protects a table until its one-hour slot has ended."""
    lower_bound = now.replace(tzinfo=None) - timedelta(hours=1)
    live_or_future = [
        Reservation.reservation_date > now.date(),
        and_(
            Reservation.reservation_date == now.date(),
            Reservation.slot_start > lower_bound.time(),
        ),
    ]
    if lower_bound.date() < now.date():
        live_or_future.append(
            and_(
                Reservation.reservation_date == lower_bound.date(),
                Reservation.slot_start > lower_bound.time(),
            )
        )

    return (
        db.scalar(
            select(Reservation.id)
            .where(
                Reservation.table_id == table_id,
                Reservation.status.in_(
                    (ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN)
                ),
                or_(*live_or_future),
            )
            .limit(1)
        )
        is not None
    )
