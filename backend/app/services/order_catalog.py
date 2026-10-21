from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class MenuProduct:
    name: str
    description: str
    image: str
    unit_price: Decimal


MENU_PRODUCTS: dict[str, MenuProduct] = {
    "ember-scallop": MenuProduct(
        "Ember-roasted scallop", "Brown butter, sea herbs and smoked leek.",
        "/images/dish-scallop.png", Decimal("3450.00"),
    ),
    "wild-mushroom-pappardelle": MenuProduct(
        "Black garlic pappardelle", "Wild mushroom, aged parmesan and pepper leaf.",
        "/images/dish-pasta.png", Decimal("2850.00"),
    ),
    "pistachio-mille-feuille": MenuProduct(
        "Pistachio mille-feuille", "Lemon verbena, salted caramel and late berries.",
        "/images/dish-dessert.png", Decimal("1650.00"),
    ),
    "roasted-pumpkin": MenuProduct(
        "Charred pumpkin tartine", "Whipped ricotta, pumpkin seed and garden mint.",
        "/images/dish-dessert.png", Decimal("1850.00"),
    ),
    "slow-braised-short-rib": MenuProduct(
        "Slow-braised short rib", "Olive mash, glazed shallot and red wine jus.",
        "/images/dish-pasta.png", Decimal("3950.00"),
    ),
    "seared-local-tuna": MenuProduct(
        "Seared local tuna", "Citrus kosho, crisp rice and fennel.",
        "/images/dish-scallop.png", Decimal("3650.00"),
    ),
    "dark-chocolate-torte": MenuProduct(
        "Dark chocolate torte", "Cacao nib, cardamom cream and orange.",
        "/images/dish-dessert.png", Decimal("1450.00"),
    ),
    "house-iced-tea": MenuProduct(
        "House iced tea", "Ceylon tea, lime and a little wild honey.",
        "/images/dish-scallop.png", Decimal("650.00"),
    ),
}

DELIVERY_FEE = Decimal("500.00")
