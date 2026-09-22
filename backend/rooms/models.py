from django.db import models


class RoomType(models.TextChoices):
    """Stable room identifiers — the same value is used as the wire
    identifier in the API, the DB value stored below, and the catalog key
    in catalog.py. Adding a new room is a new choice here plus a new
    catalog.py entry, nothing else structural."""

    COUPLE_HOME = "couple_home", "Couple Home"
    COZY_LOFT = "cozy_loft", "Cozy Loft"
    AFTER_HOURS = "after_hours", "After Hours"


class CoupleRoomOwnership(models.Model):
    """One row per room a couple has UNLOCKED BY PURCHASE.

    Couple Home is deliberately NEVER stored here — it's treated as
    unconditionally owned by every paired couple by construction (see
    services.get_owned_room_types), so there is nothing to backfill for
    couples that existed before this feature shipped, and nothing that
    could accidentally leave a couple "missing" their default room.

    `on_delete=CASCADE` (not PROTECT, unlike CoupleWallet): this row is
    just ownership state, not currency — losing it if a couple were ever
    deleted is unremarkable, the same category as WatchSession.
    """

    couple = models.ForeignKey("couples.Couple", on_delete=models.CASCADE, related_name="owned_rooms")
    room_type = models.CharField(max_length=32, choices=RoomType.choices)
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["couple", "room_type"], name="unique_room_ownership_per_couple")
        ]


class CoupleActiveRoom(models.Model):
    """Which ONE room this couple currently has selected/centered — a
    lazily-created per-couple singleton, same shape as WatchSession
    (one row, `get_or_create`/`update_or_create`, no locking needed since
    it's last-writer-wins — see services.select_active_room)."""

    couple = models.OneToOneField("couples.Couple", on_delete=models.CASCADE, related_name="active_room")
    room_type = models.CharField(max_length=32, choices=RoomType.choices, default=RoomType.COUPLE_HOME)
    updated_at = models.DateTimeField(auto_now=True)
