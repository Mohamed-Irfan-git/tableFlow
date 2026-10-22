from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models import OrderFulfillment, OrderPaymentMethod
from app.schemas.orders import OrderItemCreate, RestaurantOrderCreate, RestaurantOrderPublic
from app.services.orders import create_order


class MemorySession:
    def __init__(self) -> None:
        self.added = None

    def add(self, value) -> None:
        self.added = value


def delivery_payload(**overrides) -> RestaurantOrderCreate:
    values = {
        "customer_name": "Asha Silva",
        "customer_email": "asha@example.com",
        "customer_phone": "+94771234567",
        "fulfillment_type": OrderFulfillment.DELIVERY,
        "delivery_address": "12 Lake Road",
        "delivery_city": "Colombo",
        "delivery_postal_code": "00300",
        "payment_method": OrderPaymentMethod.CASH_ON_DELIVERY,
        "items": [OrderItemCreate(product_id="wild-mushroom-pappardelle", quantity=2)],
    }
    values.update(overrides)
    return RestaurantOrderCreate(**values)


def test_order_prices_are_calculated_from_server_catalog() -> None:
    db = MemorySession()
    order = create_order(db, payload=delivery_payload(), customer_id=None)

    assert db.added is order
    assert order.subtotal == Decimal("5700.00")
    assert order.delivery_fee == Decimal("500.00")
    assert order.total == Decimal("6200.00")
    assert order.items[0].unit_price == Decimal("2850.00")
    assert order.order_reference.startswith("TF-")
    response = RestaurantOrderPublic.model_validate(order)
    assert response.subtotal == 5700
    assert response.items[0].name == "Black garlic pappardelle"


def test_unknown_product_is_rejected() -> None:
    db = MemorySession()
    payload = delivery_payload(items=[OrderItemCreate(product_id="made-up-dish", quantity=1)])

    with pytest.raises(ValueError, match="Unknown menu item"):
        create_order(db, payload=payload, customer_id=None)


def test_delivery_requires_address_and_cash_payment() -> None:
    with pytest.raises(ValidationError):
        delivery_payload(delivery_city=None)
    with pytest.raises(ValidationError):
        delivery_payload(payment_method=OrderPaymentMethod.PAY_AT_RESTAURANT)


def test_pickup_has_no_delivery_fee_and_requires_restaurant_payment() -> None:
    db = MemorySession()
    payload = RestaurantOrderCreate(
        customer_name="Asha Silva",
        customer_email="asha@example.com",
        customer_phone="+94771234567",
        fulfillment_type=OrderFulfillment.PICKUP,
        payment_method=OrderPaymentMethod.PAY_AT_RESTAURANT,
        items=[OrderItemCreate(product_id="house-iced-tea", quantity=2)],
    )

    order = create_order(db, payload=payload, customer_id=None)

    assert order.delivery_fee == Decimal("0.00")
    assert order.total == Decimal("1300.00")
