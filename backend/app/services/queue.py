from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    QueueEntry,
    QueueStatus,
    Restaurant,
    RestaurantTable,
    SeatingRecord,
    TableStatus,
    User,
)


class QueueWorkflowError(Exception):
    """Raised for invalid host-desk transitions."""


def add_to_queue(
    db: Session,
    *,
    restaurant_id: int,
    customer_name: str,
    customer_phone: str | None,
    guest_count: int,
) -> QueueEntry:
    # Serialise allocation by taking the restaurant row lock before numbering the party.
    restaurant = db.scalar(
        select(Restaurant).where(Restaurant.id == restaurant_id).with_for_update()
    )
    if restaurant is None:
        raise LookupError("Restaurant not found")

    count = db.scalar(
        select(func.count(QueueEntry.id)).where(QueueEntry.restaurant_id == restaurant_id)
    )
    entry = QueueEntry(
        restaurant_id=restaurant_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        guest_count=guest_count,
        queue_number=f"Q-{int(count or 0) + 1:03d}",
    )
    db.add(entry)
    db.flush()
    return entry


def call_queue_entry(db: Session, *, entry_id: int) -> QueueEntry:
    entry = db.scalar(select(QueueEntry).where(QueueEntry.id == entry_id).with_for_update())
    if entry is None:
        raise LookupError("Queue entry not found")
    if entry.status not in {QueueStatus.WAITING, QueueStatus.CALLED}:
        raise QueueWorkflowError("Only waiting parties can be called")
    entry.status = QueueStatus.CALLED
    db.flush()
    return entry


def seat_queue_entry(
    db: Session,
    *,
    entry_id: int,
    table_id: int,
    assigned_by: User,
) -> tuple[QueueEntry, RestaurantTable]:
    entry = db.scalar(select(QueueEntry).where(QueueEntry.id == entry_id).with_for_update())
    table = db.scalar(select(RestaurantTable).where(RestaurantTable.id == table_id).with_for_update())
    if entry is None:
        raise LookupError("Queue entry not found")
    if table is None or table.restaurant_id != entry.restaurant_id:
        raise QueueWorkflowError("Choose a table in the same restaurant")
    if entry.status not in {QueueStatus.WAITING, QueueStatus.CALLED}:
        raise QueueWorkflowError("Only active queue entries can be seated")
    if table.status != TableStatus.AVAILABLE:
        raise QueueWorkflowError("Choose an available table")
    if table.capacity < entry.guest_count:
        raise QueueWorkflowError("Table does not fit this party")

    entry.status = QueueStatus.SEATED
    table.status = TableStatus.OCCUPIED
    db.add(SeatingRecord(table_id=table.id, queue_entry_id=entry.id, assigned_by_id=assigned_by.id))
    db.flush()
    return entry, table
