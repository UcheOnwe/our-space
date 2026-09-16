from .models import CompanionProfile

CompanionType = CompanionProfile.CompanionType
ColorVariant = CompanionProfile.ColorVariant

# Which colors are curated for which Companion — product data (V1 palette
# choices), not an economy/store system. Each Companion supports a small,
# DIFFERENT set of colors rather than one universal palette every type must
# support — see CompanionSelectionSerializer.validate, which is what
# actually enforces this against a PATCH, and
# frontend/src/companions/registry.ts, which mirrors this exact mapping
# (with hex values, which the backend has no reason to know) for
# rendering. Keeping both hand-authored rather than generated from one
# shared source is unavoidable across the Python/TypeScript boundary — the
# frontend/extension side is what decision #5 asks not to duplicate, and
# it doesn't (see registry.ts's own doc comment).
#
# DEFAULT is listed first for cosmic_blob specifically — it's that
# Companion's own true default appearance (see ColorVariant.DEFAULT's own
# comment in models.py), not an equal alternative among the rest.
COMPANION_COLOR_VARIANTS: dict[str, list[str]] = {
    CompanionType.COSMIC_BLOB: [
        ColorVariant.DEFAULT,
        ColorVariant.OLIVE,
        ColorVariant.BLUSH,
        ColorVariant.LAVENDER,
    ],
    CompanionType.COSMIC_FLYER: [
        ColorVariant.SUNSET,
        ColorVariant.MINT,
        ColorVariant.SILVER,
        ColorVariant.STARLIGHT,
    ],
    CompanionType.MINI_UFO: [
        ColorVariant.SILVER,
        ColorVariant.MIDNIGHT,
        ColorVariant.MINT,
        ColorVariant.LAVENDER,
    ],
    CompanionType.STAR_WISP: [
        ColorVariant.STARLIGHT,
        ColorVariant.BLUSH,
        ColorVariant.LAVENDER,
        ColorVariant.SUNSET,
    ],
    CompanionType.NOVA_GUARDIAN: [
        ColorVariant.MIDNIGHT,
        ColorVariant.STARLIGHT,
        ColorVariant.SILVER,
        ColorVariant.SUNSET,
    ],
}


def allowed_colors_for(companion_type: str) -> list[str]:
    """The colors valid for `companion_type` — empty for an unrecognized
    type rather than raising, so callers that already validated
    `companion_type` via ChoiceField (see serializers.py) can call this
    unconditionally."""
    return COMPANION_COLOR_VARIANTS.get(companion_type, [])
