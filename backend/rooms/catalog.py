from dataclasses import dataclass

from .models import RoomType

# Plain Python configuration, not database rows — mirrors
# companions/catalog.py exactly. This catalog is small and code-known
# (adding a room is a code+art change regardless of how the catalog is
# represented, never a pure data change), so there's no product need yet
# for live, no-deploy editability.


@dataclass(frozen=True)
class RoomCatalogEntry:
    room_type: str
    display_name: str
    # Stable, explicit ordering — the future carousel's left/right
    # navigation depends on this being a real, deliberate contract, not an
    # accident of list/dict iteration order.
    order: int
    # 0 for rooms included by default (e.g. Couple Home).
    price: int


ROOM_CATALOG: list[RoomCatalogEntry] = [
    RoomCatalogEntry(room_type=RoomType.COUPLE_HOME, display_name="Couple Home", order=0, price=0),
    RoomCatalogEntry(room_type=RoomType.COZY_LOFT, display_name="Cozy Loft", order=1, price=2500),
]


def get_catalog() -> list[RoomCatalogEntry]:
    return ROOM_CATALOG


def price_for(room_type: str) -> int:
    return next(entry.price for entry in ROOM_CATALOG if entry.room_type == room_type)
