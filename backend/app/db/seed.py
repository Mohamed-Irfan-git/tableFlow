"""Create the demo restaurant, menu, and host without committing credentials."""

import os

from sqlalchemy import select

from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal
from app.models import MenuItem, Restaurant, RestaurantTable, Role, TableStatus, User

DEMO_MENU = (
    ("Ember-roasted scallop", "Brown butter · sea herbs · smoked leek", "Small plates", "/images/dish-scallop.png", 2800),
    ("Black garlic pappardelle", "Wild mushroom · aged parmesan · pepper leaf", "Mains", "/images/dish-pasta.png", 3200),
    ("Pistachio mille-feuille", "Lemon verbena · salted caramel · late berries", "Dessert", "/images/dish-dessert.png", 1800),
)

DEMO_TABLES = (
    ("T01", 2, TableStatus.AVAILABLE, "Window"),
    ("T02", 4, TableStatus.AVAILABLE, "Main dining"),
    ("T03", 6, TableStatus.AVAILABLE, "Main dining"),
    ("T04", 2, TableStatus.AVAILABLE, "Bar"),
    ("T05", 6, TableStatus.AVAILABLE, "Main dining"),
    ("T06", 4, TableStatus.AVAILABLE, "Kitchen side"),
    ("T07", 6, TableStatus.AVAILABLE, "Private corner"),
    ("T08", 4, TableStatus.AVAILABLE, "Terrace"),
    ("T09", 4, TableStatus.AVAILABLE, "Terrace"),
    ("T10", 8, TableStatus.AVAILABLE, "Private dining"),
)


def seed() -> None:
    password = os.environ.get("TABLEFLOW_DEMO_HOST_PASSWORD")
    if not password:
        raise RuntimeError("Set TABLEFLOW_DEMO_HOST_PASSWORD before running the demo seed")

    email = os.environ.get("TABLEFLOW_DEMO_HOST_EMAIL", "host@tableflowdemo.com").lower()
    with SessionLocal() as db:
        restaurant = db.scalar(select(Restaurant).where(Restaurant.name == "TableFlow — The Meridian"))
        if restaurant is None:
            restaurant = Restaurant(name="TableFlow — The Meridian", timezone="Asia/Colombo")
            db.add(restaurant)
            db.flush()

        existing_tables = set(db.scalars(
            select(RestaurantTable.number).where(RestaurantTable.restaurant_id == restaurant.id)
        ))
        db.add_all(
            RestaurantTable(
                restaurant_id=restaurant.id,
                number=number,
                capacity=capacity,
                status=status,
                location=location,
            )
            for number, capacity, status, location in DEMO_TABLES
            if number not in existing_tables
        )

        existing_dishes = set(db.scalars(
            select(MenuItem.name).where(MenuItem.restaurant_id == restaurant.id)
        ))
        db.add_all(
            MenuItem(
                restaurant_id=restaurant.id,
                name=name,
                detail=detail,
                category=category,
                image=image,
                price_cents=price,
                available=True,
            )
            for name, detail, category, image, price in DEMO_MENU
            if name not in existing_dishes
        )

        host = db.scalar(select(User).where(User.email == email))
        if host is None:
            db.add(
                User(
                    email=email,
                    full_name="Maya Chen",
                    password_hash=hash_password(password),
                    role=Role.HOST,
                )
            )
        elif not verify_password(password, host.password_hash):
            # The deployment environment is the source of truth for the demo host.
            host.password_hash = hash_password(password)
        if host is not None and host.role != Role.HOST:
            host.role = Role.HOST
        db.commit()
        print(
            f"Seed complete. Restaurant ID: {restaurant.id}; "
            f"staff email: {email}; sample menu items: {len(DEMO_MENU)}"
        )


if __name__ == "__main__":
    seed()
