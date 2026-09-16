from rest_framework import serializers

from .catalog import allowed_colors_for
from .models import CompanionProfile


class CompanionProfileSerializer(serializers.ModelSerializer):
    """Read-only representation of a CompanionProfile — the shape returned
    by both GET and PATCH /api/companions/profile/."""

    class Meta:
        model = CompanionProfile
        fields = ["companion_type", "color_variant", "updated_at"]
        read_only_fields = fields


class CompanionSelectionSerializer(serializers.Serializer):
    """Validates a PATCH body for /api/companions/profile/.

    Both fields are required together, not a field-by-field partial
    update — the product action this backs ("Save/Equip", see
    CompanionProfilePage) always commits one complete companion+color
    selection at once, and the approved plan's own PATCH contract is
    "updates the selected/equipped companion_type and color_variant"
    (both), not either independently.

    Two separate ChoiceFields alone would let an invalid COMBINATION
    through (e.g. a color only curated for a different Companion) even
    though each field is individually "recognized" — the `validate`
    override below is what catches that, checking the pair against
    catalog.allowed_colors_for rather than a single flat color list.
    """

    companion_type = serializers.ChoiceField(choices=CompanionProfile.CompanionType.choices)
    color_variant = serializers.ChoiceField(choices=CompanionProfile.ColorVariant.choices)

    def validate(self, attrs):
        companion_type = attrs["companion_type"]
        color_variant = attrs["color_variant"]
        if color_variant not in allowed_colors_for(companion_type):
            raise serializers.ValidationError(
                {"color_variant": f'"{color_variant}" is not an available color for this Companion.'}
            )
        return attrs
