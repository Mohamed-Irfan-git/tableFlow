from pydantic import BaseModel, ConfigDict, Field

from app.models import TableStatus


class TablePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    restaurant_id: int
    number: str
    capacity: int = Field(ge=1)
    status: TableStatus
    location: str | None


class TableStatusUpdate(BaseModel):
    status: TableStatus
