from rest_framework.response import Response
from rest_framework.views import APIView

from couples.services import get_status_for_user

from .serializers import CoupleWalletSerializer, PersonalWalletSerializer
from .services import get_or_create_couple_wallet, get_or_create_personal_wallet

# No permission_classes set on either view: the project-wide DRF default
# (IsAuthenticated, see config/settings.py) already applies, and neither
# endpoint should be reachable while signed out.


class PersonalWalletView(APIView):
    """GET /api/uchem/personal/ — the caller's own Personal Uchem Wallet.

    Never 404s — lazily creates a 0-balance wallet on first access, same
    contract as companions.views.CompanionProfileView. Always resolves
    "whose wallet" from request.user; there is no id/username parameter
    anywhere on this endpoint, so a client has no way to request anyone
    else's Personal Wallet.
    """

    def get(self, request):
        wallet = get_or_create_personal_wallet(request.user)
        return Response(PersonalWalletSerializer(wallet).data)


class CoupleWalletView(APIView):
    """GET /api/uchem/couple/ — the caller's Couple Uchem Wallet.

    The couple is resolved SERVER-SIDE from the authenticated caller via
    couples.services.get_status_for_user — the same canonical pairing
    lookup presence.services.get_paired_couple_or_none already reuses —
    never from a client-supplied couple id. An unpaired caller gets a 400
    with a detail message (matching watch's existing error shape) rather
    than a fabricated or empty wallet.
    """

    def get(self, request):
        pairing_status, couple, _invite = get_status_for_user(request.user)
        if pairing_status != "paired":
            return Response({"detail": "You need to be paired with a partner first."}, status=400)

        wallet = get_or_create_couple_wallet(couple)
        return Response(CoupleWalletSerializer(wallet).data)
