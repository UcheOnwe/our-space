from rest_framework.response import Response
from rest_framework.views import APIView

from couples.services import get_status_for_user
from uchem.services import InsufficientUchemError

from .serializers import RoomActionSerializer, RoomGalleryItemSerializer
from .services import RoomPurchaseError, get_room_gallery, purchase_room, select_active_room

# No permission_classes set on any view here: the project-wide DRF default
# (IsAuthenticated, see config/settings.py) already applies.


def _get_paired_couple_or_error(user):
    """Resolves the caller's couple SERVER-SIDE — never from a
    client-supplied id — reusing the exact same canonical pairing lookup
    uchem.views.CoupleWalletView already reuses. Returns (couple, None)
    on success, or (None, error_response) for an unpaired caller, matching
    that view's own error shape."""
    pairing_status, couple, _invite = get_status_for_user(user)
    if pairing_status != "paired":
        return None, Response({"detail": "You need to be paired with a partner first."}, status=400)
    return couple, None


def _gallery_response(couple) -> Response:
    return Response(RoomGalleryItemSerializer(get_room_gallery(couple), many=True).data)


class RoomGalleryView(APIView):
    """GET /api/rooms/gallery/ — every catalog room (owned and locked
    alike) merged with the caller's couple's own ownership/active state.
    This IS the room collection/discovery surface — there is no separate
    room store."""

    def get(self, request):
        couple, error = _get_paired_couple_or_error(request.user)
        if error is not None:
            return error
        return _gallery_response(couple)


class PurchaseRoomView(APIView):
    """POST /api/rooms/purchase/ — body: {"room_type": "..."}.

    Price is always resolved server-side from rooms.catalog, never
    accepted from the request body. Successfully unlocking a room also
    makes it active; re-purchasing an already-owned room is a safe no-op
    that still activates it, per the approved UX decision.
    """

    def post(self, request):
        couple, error = _get_paired_couple_or_error(request.user)
        if error is not None:
            return error

        serializer = RoomActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            purchase_room(couple, serializer.validated_data["room_type"])
        except (RoomPurchaseError, InsufficientUchemError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return _gallery_response(couple)


class SelectActiveRoomView(APIView):
    """POST /api/rooms/select-active/ — body: {"room_type": "..."}.

    Requires the couple to already own room_type; a client cannot
    activate a room it hasn't unlocked by sending its identifier here.
    """

    def post(self, request):
        couple, error = _get_paired_couple_or_error(request.user)
        if error is not None:
            return error

        serializer = RoomActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            select_active_room(couple, serializer.validated_data["room_type"])
        except RoomPurchaseError as exc:
            return Response({"detail": str(exc)}, status=400)

        return _gallery_response(couple)
