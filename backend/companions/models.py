from django.conf import settings
from django.db import models


class CompanionProfile(models.Model):
    """One user's Space Companion identity/customization — a singleton per
    user, not per couple.

    `user` is a OneToOneField, not a plain ForeignKey — the same
    "database enforces at most one per user" pattern couples.CoupleMembership
    already uses for "at most one couple per user". Deliberately holds NO
    reference to Couple/CoupleMembership anywhere in this app: Companion
    identity belongs to the individual, and requires only being signed in
    (see companions/views.py — no couple lookup exists in this app at all).

    `companion_type`/`color_variant` are the only two things the backend
    persists/validates (which identifiers are RECOGNIZED, and which
    color is valid for which type — see companions/catalog.py). The
    backend does not know or care how either renders — that's the shared
    frontend/extension TypeScript registry's job (frontend/src/companions/),
    not this app's.
    """

    class CompanionType(models.TextChoices):
        COSMIC_BLOB = "cosmic_blob", "Cosmic Blob"
        COSMIC_FLYER = "cosmic_flyer", "Cosmic Flyer"
        MINI_UFO = "mini_ufo", "Mini UFO"
        STAR_WISP = "star_wisp", "Star Wisp"
        NOVA_GUARDIAN = "nova_guardian", "Nova Guardian"

    class ColorVariant(models.TextChoices):
        # The Cosmic Blob's own true default appearance (its original
        # two-tone gradient + sparkle treatment — see
        # frontend/src/companions/companionShapes.ts's buildCosmicBlobSvg)
        # rather than a flat recolor. Not every Companion needs a
        # "default" entry — the other four already have a real curated
        # color as their own default (see catalog.py) — this exists
        # specifically because the Blob's authoritative identity isn't
        # expressible as a single flat hex.
        DEFAULT = "default", "Default"
        OLIVE = "olive", "Olive"
        BLUSH = "blush", "Blush"
        STARLIGHT = "starlight", "Starlight"
        LAVENDER = "lavender", "Lavender"
        SUNSET = "sunset", "Sunset"
        MINT = "mint", "Mint"
        MIDNIGHT = "midnight", "Midnight"
        SILVER = "silver", "Silver"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="companion_profile",
    )
    companion_type = models.CharField(
        max_length=32, choices=CompanionType.choices, default=CompanionType.COSMIC_BLOB
    )
    # Default changed from OLIVE to DEFAULT (see catalog.py's own note on
    # why) — a genuine, deliberate behavior change for brand-new profiles
    # only. Existing rows already have a concrete value in the database
    # and are completely unaffected; `default=` only applies at INSERT
    # time for a row that doesn't specify one.
    color_variant = models.CharField(
        max_length=32, choices=ColorVariant.choices, default=ColorVariant.DEFAULT
    )
    updated_at = models.DateTimeField(auto_now=True)
