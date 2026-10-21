import secrets
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    OrderFulfillment,
    OrderStatus,
    RestaurantOrder,
    RestaurantOrderItem,
)
from app.schemas.orders import RestaurantOrderCreate
from app.services.order_catalog import DELIVERY_FEE, MENU_PRODUCTS


def create_order(
    db: Session,
    *,
    payload: RestaurantOrderCreate,
    customer_id: int | None,
) -> RestaurantOrder:
    lines: list[RestaurantOrderItem] = []
    subtotal = Decimal("0.00")

    for selection in payload.items:
        product = MENU_PRODUCTS.get(selection.product_id)
        if product is None:
            raise ValueError(f"Unknown menu item: {selection.product_id}")
        line_total = product.unit_price * selection.quantity
        subtotal += line_total
        lines.append(
            RestaurantOrderItem(
                product_id=selection.product_id,
                name=product.name,
                description=product.description,
                image=product.image,
                unit_price=product.unit_price,
                quantity=selection.quantity,
                line_total=line_total,
            )
        )

    delivery_fee = (
        DELIVERY_FEE
        if payload.fulfillment_type == OrderFulfillment.DELIVERY
        else Decimal("0.00")
    )
    reference_date = datetime.now(UTC).strftime("%Y%m%d")
    order = RestaurantOrder(
        order_reference=f"TF-{reference_date}-{secrets.token_hex(6).upper()}",
        customer_id=customer_id,
        customer_name=payload.customer_name.strip(),
        customer_email=str(payload.customer_email).lower(),
        customer_phone=payload.customer_phone.strip(),
        fulfillment_type=payload.fulfillment_type,
        delivery_address=payload.delivery_address,
        delivery_city=payload.delivery_city,
        delivery_postal_code=payload.delivery_postal_code,
        delivery_instructions=payload.delivery_instructions,
        payment_method=payload.payment_method,
        status=OrderStatus.RECEIVED,
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        total=subtotal + delivery_fee,
        items=lines,
    )
    db.add(order)
    return order
