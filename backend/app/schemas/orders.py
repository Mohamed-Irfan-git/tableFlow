from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import OrderFulfillment, OrderPaymentMethod, OrderStatus


class OrderItemCreate(BaseModel):
    product_id: str = Field(min_length=1, max_length=80)
    quantity: int = Field(ge=1, le=99)


class RestaurantOrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=120)
    customer_email: EmailStr
    customer_phone: str = Field(min_length=7, max_length=32)
    fulfillment_type: OrderFulfillment
    delivery_address: str | None = Field(default=None, min_length=3, max_length=255)
    delivery_city: str | None = Field(default=None, min_length=2, max_length=120)
    delivery_postal_code: str | None = Field(default=None, min_length=2, max_length=24)
    delivery_instructions: str | None = Field(default=None, max_length=1000)
    payment_method: OrderPaymentMethod
    items: list[OrderItemCreate] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_fulfillment(self) -> "RestaurantOrderCreate":
        if self.fulfillment_type == OrderFulfillment.DELIVERY:
            if not self.delivery_address or not self.delivery_city or not self.delivery_postal_code:
                raise ValueError("Delivery address, city, and postal code are required")
            if self.payment_method != OrderPaymentMethod.CASH_ON_DELIVERY:
                raise ValueError("Delivery orders must use cash on delivery")
        else:
            if self.payment_method != OrderPaymentMethod.PAY_AT_RESTAURANT:
                raise ValueError("Pickup orders must be paid at the restaurant")
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Each menu item must appear only once")
        return self


class RestaurantOrderItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    name: str
    description: str
    image: str
    unit_price: float
    quantity: int
    line_total: float


class RestaurantOrderPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_reference: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    fulfillment_type: OrderFulfillment
    delivery_address: str | None
    delivery_city: str | None
    delivery_postal_code: str | None
    delivery_instructions: str | None
    payment_method: OrderPaymentMethod
    status: OrderStatus
    subtotal: float
    delivery_fee: float
    total: float
    items: list[RestaurantOrderItemPublic]
