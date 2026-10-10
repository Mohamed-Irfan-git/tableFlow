from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field

from app.models import ReservationStatus


class AvailabilityQuery(BaseModel):
    restaurant_id: int = Field(gt=0)
    reservation_date: date
    slot_start: time
    guest_count: int = Field(ge=1, le=20)


class ReservationCreate(AvailabilityQuery):
    notes: str | None = Field(default=None, max_length=1000)


class ReservationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    table_id: int
    reservation_date: date
    slot_start: time
    guest_count: int
    status: ReservationStatus
    notes: str | None


class ReservationCancellation(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)
