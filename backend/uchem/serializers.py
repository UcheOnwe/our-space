from rest_framework import serializers

from .models import CoupleWallet, PersonalWallet


class PersonalWalletSerializer(serializers.ModelSerializer):
    """Read-only representation of a PersonalWallet — only what the
    frontend currently needs (no transaction history exposed yet)."""

    class Meta:
        model = PersonalWallet
        fields = ["balance", "updated_at"]
        read_only_fields = fields


class CoupleWalletSerializer(serializers.ModelSerializer):
    """Read-only representation of a CoupleWallet — identical shape to
    PersonalWalletSerializer; the two are kept as separate serializers
    (not one shared one) since they wrap different models."""

    class Meta:
        model = CoupleWallet
        fields = ["balance", "updated_at"]
        read_only_fields = fields
