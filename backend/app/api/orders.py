from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_optional_user
from app.db.session import get_db
from app.models import RestaurantOrder, User
from app.schemas.orders import RestaurantOrderCreate, RestaurantOrderPublic
from app.services.orders import create_order

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=RestaurantOrderPublic, status_code=status.HTTP_201_CREATED)
def place_order(
    payload: RestaurantOrderCreate,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> RestaurantOrder:
    try:
        order = create_order(db, payload=payload, customer_id=user.id if user else None)
        db.commit()
        db.refresh(order)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise
    return order
