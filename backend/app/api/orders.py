import json
import secrets
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.session import get_db
from app.models import FoodOrder, MenuItem, Restaurant, RestaurantTable, Role, User

router = APIRouter(prefix="/orders", tags=["orders"])

# Prices and identity are authoritative on the server, not supplied by customers.
CATALOG = {
    "scallop": ("Ember-roasted scallop", 2800),
    "pasta": ("Black garlic pappardelle", 3200),
    "dessert": ("Pistachio mille-feuille", 1800),
}


class OrderLine(BaseModel):
    item_id: int
    quantity: int = Field(ge=1, le=30)


class CreateOrder(BaseModel):
    restaurant_id: int
    customer_name: str = Field(min_length=2, max_length=120)
    order_type: Literal["DINE_IN", "TAKEAWAY", "DELIVERY"]
    table_number: str | None = None
    delivery_address: str | None = None
    payment_method: Literal["CASH", "CARD_ON_ARRIVAL", "CARD_ONLINE"]
    items: list[OrderLine] = Field(min_length=1, max_length=30)


class StatusUpdate(BaseModel):
    status: Literal["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"]


def serialize(order: FoodOrder):
    return {
        "id": order.id,
        "tracking_token": order.tracking_token,
        "customer_name": order.customer_name,
        "order_type": order.order_type,
        "table_number": order.table_number,
        "delivery_address": order.delivery_address,
        "payment_method": order.payment_method,
        "status": order.status,
        "payment_status": order.payment_status,
        "items": json.loads(order.items),
        "total_cents": order.total_cents,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.post("", status_code=201)
def create_order(payload: CreateOrder, db: Session = Depends(get_db)):
    restaurant = db.get(Restaurant, payload.restaurant_id)
    if restaurant is None:
        raise HTTPException(404, "Restaurant not found")
    if payload.payment_method == "CARD_ONLINE" and not os.getenv("STRIPE_SECRET_KEY"):
        raise HTTPException(503, "Online card payments are not configured yet; choose cash or card on arrival")
    if payload.order_type == "DINE_IN":
        if not payload.table_number:
            raise HTTPException(422, "Select a table")
        table = db.scalar(select(RestaurantTable).where(
            RestaurantTable.restaurant_id == payload.restaurant_id,
            RestaurantTable.number == payload.table_number,
        ).with_for_update())
        if table is None or table.status.value != "AVAILABLE":
            raise HTTPException(409, "The selected table is not currently available")
        # Lock the physical table row for this transaction so simultaneous checkouts
        # cannot both claim it. This also covers unpaid/pending food orders.
        occupied = db.scalar(select(FoodOrder.id).where(
            FoodOrder.restaurant_id == payload.restaurant_id,
            FoodOrder.order_type == "DINE_IN",
            FoodOrder.table_number == payload.table_number,
            FoodOrder.status.notin_(["CANCELLED", "COMPLETED"]),
        ).limit(1))
        if occupied is not None:
            raise HTTPException(409, "This table already has an active order. Please choose another table or ask the host to close it.")
    if payload.order_type == "DELIVERY" and not (payload.delivery_address or "").strip():
        raise HTTPException(422, "Delivery address is required")
    ids = {line.item_id for line in payload.items}
    menu = {item.id: item for item in db.scalars(select(MenuItem).where(
        MenuItem.restaurant_id == payload.restaurant_id, MenuItem.id.in_(ids), MenuItem.available.is_(True))).all()}
    if len(menu) != len(ids):
        raise HTTPException(422, "A selected menu item is unavailable")
    lines = [{"item_id": line.item_id, "name": menu[line.item_id].name, "quantity": line.quantity,
              "unit_cents": menu[line.item_id].price_cents} for line in payload.items]
    total = sum(line["unit_cents"] * line["quantity"] for line in lines)
    order = FoodOrder(restaurant_id=payload.restaurant_id, tracking_token=secrets.token_urlsafe(24),
        customer_name=payload.customer_name.strip(), order_type=payload.order_type,
        table_number=payload.table_number if payload.order_type == "DINE_IN" else None,
        delivery_address=payload.delivery_address.strip() if payload.order_type == "DELIVERY" else None,
        payment_method=payload.payment_method, items=json.dumps(lines), total_cents=total, status="PLACED")
    db.add(order)
    db.commit()
    db.refresh(order)
    return serialize(order)


@router.get("/occupied-tables")
def occupied_tables(restaurant_id: int, db: Session = Depends(get_db)):
    """Public table numbers only; no guest/order details are exposed."""
    numbers = db.scalars(select(FoodOrder.table_number).where(
        FoodOrder.restaurant_id == restaurant_id,
        FoodOrder.order_type == "DINE_IN",
        FoodOrder.status.notin_(["CANCELLED", "COMPLETED"]),
    ).distinct()).all()
    return {"table_numbers": [number for number in numbers if number]}


@router.get("/track/{tracking_token}")
def track_order(tracking_token: str, db: Session = Depends(get_db)):
    order = db.scalar(select(FoodOrder).where(FoodOrder.tracking_token == tracking_token))
    if order is None:
        raise HTTPException(404, "Order not found")
    return serialize(order)


@router.post("/track/{tracking_token}/cancel")
def cancel_order(tracking_token: str, db: Session = Depends(get_db)):
    order = db.scalar(select(FoodOrder).where(FoodOrder.tracking_token == tracking_token))
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.payment_method == "CARD_ONLINE" and order.stripe_session_id:
        raise HTTPException(409, "Please contact the restaurant to cancel an online card checkout")
    if order.payment_status == "PAID":
        raise HTTPException(409, "Please contact the restaurant about a refund before cancelling a paid order")
    if order.status not in ("PLACED", "CONFIRMED"):
        raise HTTPException(409, "Please contact the restaurant to cancel an order already being prepared")
    order.status = "CANCELLED"
    db.commit()
    return serialize(order)


@router.get("")
def list_orders(restaurant_id: int, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    orders = db.scalars(select(FoodOrder).where(FoodOrder.restaurant_id == restaurant_id).order_by(FoodOrder.id.desc()).limit(150)).all()
    return [serialize(order) for order in orders]


@router.patch("/{order_id}")
def update_order(order_id: int, payload: StatusUpdate, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    order = db.get(FoodOrder, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(409, "This order is closed")
    allowed = {"PLACED": {"CONFIRMED", "CANCELLED"}, "CONFIRMED": {"PREPARING", "CANCELLED"},
               "PREPARING": {"READY"}, "READY": {"OUT_FOR_DELIVERY", "COMPLETED"},
               "OUT_FOR_DELIVERY": {"COMPLETED"}}
    if order.payment_method == "CARD_ONLINE" and order.payment_status != "PAID" and payload.status != "CANCELLED":
        raise HTTPException(409, "Awaiting verified online payment")
    if payload.status not in allowed.get(order.status, set()):
        raise HTTPException(409, "Invalid status transition")
    if payload.status == "OUT_FOR_DELIVERY" and order.order_type != "DELIVERY":
        raise HTTPException(409, "Only delivery orders can be dispatched")
    order.status = payload.status
    db.commit()
    return serialize(order)


@router.patch("/{order_id}/payment")
def mark_order_paid(order_id: int, _: User = Depends(require_roles(Role.HOST, Role.MANAGER, Role.ADMIN)), db: Session = Depends(get_db)):
    """Record verified in-person payment. Stripe payment can only be marked by webhook."""
    order = db.get(FoodOrder, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.payment_method == "CARD_ONLINE":
        raise HTTPException(409, "Online card payments must be verified by Stripe")
    if order.status == "CANCELLED":
        raise HTTPException(409, "Cannot record payment for a cancelled order")
    if order.payment_status == "PAID":
        return serialize(order)
    order.payment_status = "PAID"
    db.commit()
    db.refresh(order)
    return serialize(order)


class CheckoutRequest(BaseModel):
    tracking_token: str


@router.post("/{order_id}/checkout")
def stripe_checkout(order_id: int, payload: CheckoutRequest, db: Session = Depends(get_db)):
    """Create Stripe hosted checkout; card details never touch TableFlow."""
    import os
    from urllib import error, parse, request

    order = db.get(FoodOrder, order_id)
    if not order or not secrets.compare_digest(order.tracking_token, payload.tracking_token):
        raise HTTPException(404, "Order not found")
    if order.payment_method != "CARD_ONLINE" or order.status == "CANCELLED":
        raise HTTPException(409, "Online card checkout not available for this order")
    if order.payment_status == "PAID":
        raise HTTPException(409, "Already paid")
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise HTTPException(503, "Online card payments are not configured yet. Ask your host to connect Stripe.")
    origin = os.getenv("PUBLIC_CUSTOMER_URL", "http://localhost:3000").rstrip("/")
    currency = os.getenv("STRIPE_CURRENCY", "usd").lower()
    data = {
        "mode": "payment", "success_url": origin + "/?order=1&payment=success",
        "cancel_url": origin + "/?order=1&payment=cancelled",
        "client_reference_id": str(order.id),
        "metadata[order_id]": str(order.id),
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][product_data][name]": "TableFlow order #" + str(order.id),
        "line_items[0][price_data][unit_amount]": str(order.total_cents),
        "line_items[0][quantity]": "1",
    }
    req = request.Request("https://api.stripe.com/v1/checkout/sessions", data=parse.urlencode(data).encode(),
                          headers={"Authorization": "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with request.urlopen(req, timeout=15) as result:
            session = json.load(result)
    except (error.HTTPError, error.URLError, TimeoutError) as exc:
        raise HTTPException(502, "Payment provider unavailable; your order is saved but unpaid") from exc
    order.stripe_session_id = session["id"]
    db.commit()
    return {"checkout_url": session["url"]}


@router.post("/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Verify Stripe's signed webhook before marking payment successful."""
    import hashlib
    import hmac
    import os
    import time

    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Stripe webhook not configured")
    body = await request.body()
    fields = dict(chunk.split("=", 1) for chunk in request.headers.get("stripe-signature", "").split(",") if "=" in chunk)
    stamp, signature = fields.get("t", ""), fields.get("v1", "")
    if not stamp.isdigit() or abs(time.time() - int(stamp)) > 300:
        raise HTTPException(400, "Invalid webhook timestamp")
    expected = hmac.new(secret.encode(), stamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid webhook signature")
    event = json.loads(body)
    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("payment_status") == "paid":
            order_id = session.get("metadata", {}).get("order_id")
            if str(order_id).isdigit():
                order = db.get(FoodOrder, int(order_id))
                if order and order.stripe_session_id == session.get("id") and session.get("amount_total") == order.total_cents:
                    order.payment_status = "PAID"
                    db.commit()
    return {"received": True}
