from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import Couple, PairingInvite


class CoupleSerializer(serializers.ModelSerializer):
    """Read-only representation of a couple and its current members.

    Reuses accounts.UserSerializer for each member rather than duplicating
    the {id, username, email} shape — a normal cross-app import within a
    single Django project (not a network call), consistent with the
    modular-monolith architecture.
    """

    members = serializers.SerializerMethodField()

    class Meta:
        model = Couple
        fields = ["id", "members"]

    def get_members(self, couple):
        users = [membership.user for membership in couple.memberships.all()]
        return UserSerializer(users, many=True).data


class PairingInviteSerializer(serializers.ModelSerializer):
    """Read-only representation of an invite — only the code is ever exposed."""

    class Meta:
        model = PairingInvite
        fields = ["code"]


class JoinCoupleSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)
