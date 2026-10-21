"""Add guest restaurant orders and immutable item snapshots.

Revision ID: 0004_ecommerce_orders
Revises: 0003_time_aware_seating
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_ecommerce_orders"
down_revision = "0003_time_aware_seating"
branch_labels = None
depends_on = None

order_fulfillment = postgresql.ENUM(
    "DELIVERY", "PICKUP", name="order_fulfillment", create_type=False
)
order_payment_method = postgresql.ENUM(
    "CASH_ON_DELIVERY", "PAY_AT_RESTAURANT", name="order_payment_method", create_type=False
)
order_status = postgresql.ENUM("RECEIVED", name="order_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    order_fulfillment.create(bind, checkfirst=True)
    order_payment_method.create(bind, checkfirst=True)
    order_status.create(bind, checkfirst=True)

    op.create_table(
        "restaurant_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_reference", sa.String(length=32), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("customer_name", sa.String(length=120), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=False),
        sa.Column("customer_phone", sa.String(length=32), nullable=False),
        sa.Column("fulfillment_type", order_fulfillment, nullable=False),
        sa.Column("delivery_address", sa.String(length=255), nullable=True),
        sa.Column("delivery_city", sa.String(length=120), nullable=True),
        sa.Column("delivery_postal_code", sa.String(length=24), nullable=True),
        sa.Column("delivery_instructions", sa.Text(), nullable=True),
        sa.Column("payment_method", order_payment_method, nullable=False),
        sa.Column("status", order_status, nullable=False, server_default="RECEIVED"),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column("delivery_fee", sa.Numeric(10, 2), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_restaurant_orders_order_reference",
        "restaurant_orders",
        ["order_reference"],
        unique=True,
    )
    op.create_index("ix_restaurant_orders_customer_id", "restaurant_orders", ["customer_id"])
    op.create_index("ix_restaurant_orders_customer_email", "restaurant_orders", ["customer_email"])

    op.create_table(
        "restaurant_order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("image", sa.String(length=255), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["restaurant_orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_restaurant_order_items_order_id", "restaurant_order_items", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_restaurant_order_items_order_id", table_name="restaurant_order_items")
    op.drop_table("restaurant_order_items")
    op.drop_index("ix_restaurant_orders_customer_email", table_name="restaurant_orders")
    op.drop_index("ix_restaurant_orders_customer_id", table_name="restaurant_orders")
    op.drop_index("ix_restaurant_orders_order_reference", table_name="restaurant_orders")
    op.drop_table("restaurant_orders")
    order_status.drop(op.get_bind(), checkfirst=True)
    order_payment_method.drop(op.get_bind(), checkfirst=True)
    order_fulfillment.drop(op.get_bind(), checkfirst=True)
