from django.db import transaction

from uchem.models import TransactionReason
from uchem.services import debit_couple_wallet

from . import catalog
from .models import CoupleActiveRoom, CoupleRoomOwnership, RoomType


class RoomPurchaseError(Exception):
    """Raised for any room-ownership business rule violation.

    Views catch this (and uchem.services.InsufficientUchemError) and
    report it as a normal 400, the same error-shape convention
    couples.PairingError/watch.WatchError already use.
    """


def get_owned_room_types(couple) -> set[str]:
    """Every room this couple can currently select — Couple Home is
    ALWAYS included, by construction, never by a stored row (see
    CoupleRoomOwnership's own doc comment)."""
    purchased = set(CoupleRoomOwnership.objects.filter(couple=couple).values_list("room_type", flat=True))
    return {RoomType.COUPLE_HOME} | purchased


def get_or_create_active_room(couple) -> CoupleActiveRoom:
    active, _ = CoupleActiveRoom.objects.get_or_create(couple=couple)
    return active


def get_room_gallery(couple) -> list[dict]:
    """Backend-authoritative merged view for the future carousel: every
    catalog room plus this couple's own ownership/active state. This is
    the one shape every gallery-related endpoint returns — see views.py."""
    owned = get_owned_room_types(couple)
    active_room_type = get_or_create_active_room(couple).room_type
    return [
        {
            "room_type": entry.room_type,
            "display_name": entry.display_name,
            "order": entry.order,
            "price": entry.price,
            "is_owned": entry.room_type in owned,
            "is_active": entry.room_type == active_room_type,
        }
        for entry in catalog.get_catalog()
    ]


def select_active_room(couple, room_type: str) -> CoupleActiveRoom:
    """Sets the couple's active/centered room. Requires the couple to
    already own `room_type` — a client can never activate a room it
    hasn't unlocked, regardless of what it sends.

    No locking needed: exactly the same last-writer-wins reasoning
    watch.services.set_playback_state already documents for itself — only
    two people can ever write to one couple's row, and there's no
    multi-row invariant here a race could violate.
    """
    if room_type not in get_owned_room_types(couple):
        raise RoomPurchaseError("This couple hasn't unlocked that room yet.")

    active, _ = CoupleActiveRoom.objects.update_or_create(couple=couple, defaults={"room_type": room_type})
    return active


def purchase_room(couple, room_type: str) -> CoupleActiveRoom:
    """Unlocks `room_type` for `couple` if not already owned, spending
    Uchem from the COUPLE wallet only, then makes it the active room
    either way (a repeat purchase of an already-owned room still ends
    active, it just never touches Uchem).

    Duplicate-purchase protection is deliberately two layers:

    1. EXISTING OWNERSHIP (primary guard): checked first, before anything
       Uchem-related runs. A repeat purchase of an already-owned room
       short-circuits here and never reaches the wallet at all.
    2. THE DETERMINISTIC UCHEM IDEMPOTENCY KEY (financial safety net):
       reuses uchem.services' own two-layer guarantee as-is, rather than
       building a second currency-safety mechanism in this app. The key
       is derived from (couple, room_type) — NOT a fresh value per
       request — so it represents "this couple owning this room," a
       durable fact, and stays correct even if two purchase requests for
       the same room race past check (1) at the same instant.
    """
    if room_type == RoomType.COUPLE_HOME:
        raise RoomPurchaseError("Couple Home is already included for every couple.")

    if room_type not in get_owned_room_types(couple):
        price = catalog.price_for(room_type)
        idempotency_key = f"room-purchase:{couple.id}:{room_type}"

        with transaction.atomic():
            debit_couple_wallet(couple, price, TransactionReason.ROOM_PURCHASE, idempotency_key)
            CoupleRoomOwnership.objects.get_or_create(couple=couple, room_type=room_type)

    return select_active_room(couple, room_type)
