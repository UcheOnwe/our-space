from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import CoupleSerializer, JoinCoupleSerializer, PairingInviteSerializer
from .services import (
    PairingError,
    cancel_pending_pairing,
    create_couple_with_invite,
    get_status_for_user,
    join_couple,
)

# No permission_classes are set on these views: the project-wide DRF default
# (IsAuthenticated, see config/settings.py) already applies, and unlike
# accounts' register/login, none of these endpoints should be reachable
# while signed out.


class CreateCoupleView(APIView):
    """POST /api/couples/ — "Create Our Space".

    Creates the couple, makes the caller its first member, and issues the
    invite for their partner, all in one request.
    """

    def post(self, request):
        try:
            couple, invite = create_couple_with_invite(request.user)
        except PairingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "couple": CoupleSerializer(couple).data,
                "invite": PairingInviteSerializer(invite).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CoupleStatusView(APIView):
    """GET /api/couples/couple-status/.

    The single source of truth for the caller's pairing state — "none",
    "waiting" (with the invite code, for the creator), or "paired" (with
    both members). The frontend bootstraps from this and polls it while
    waiting for a partner to join.
    """

    def get(self, request):
        pairing_status, couple, invite = get_status_for_user(request.user)

        data = {"status": pairing_status}
        if couple is not None:
            data["couple"] = CoupleSerializer(couple).data
        if invite is not None:
            data["invite"] = PairingInviteSerializer(invite).data

        return Response(data)


class JoinCoupleView(APIView):
    """POST /api/couples/join/ — "Join Our Space". Body: {"code": "..."}."""

    def post(self, request):
        serializer = JoinCoupleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            membership = join_couple(serializer.validated_data["code"], request.user)
        except PairingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"couple": CoupleSerializer(membership.couple).data})


class CancelPendingPairingView(APIView):
    """POST /api/couples/cancel-pending-pairing/.

    Lets the creator back out of a pending "Create Our Space" before their
    partner joins, returning them to the Create/Join choice screen. Refuses
    to touch an already-paired couple.
    """

    def post(self, request):
        try:
            cancel_pending_pairing(request.user)
        except PairingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)
