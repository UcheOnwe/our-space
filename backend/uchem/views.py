from django.conf import settings
from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from couples.services import get_status_for_user

from .serializers import CoupleWalletSerializer, PersonalWalletSerializer
from .services import (
    get_or_create_couple_wallet,
    get_or_create_personal_wallet,
    restore_couple_wallet_for_development,
)

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


class DevRestoreCoupleWalletView(APIView):
    """POST /api/uchem/dev/restore/ — DEVELOPMENT ONLY.

    Restores the caller's Couple Wallet toward a fixed 10,000-Uchem
    testing target — never accepts an amount, couple id, or username from
    the client; the only input is a testing code, checked against
    settings.DEV_UCHEM_TEST_CODE (development-configuration-only, never
    returned by this or any other endpoint).

    This is registered in urls.py ONLY when settings.DEBUG is True — in a
    real deployment (DEBUG=False) this URL is never added to urlpatterns
    at all, so the route doesn't exist, not merely reject. The `if not
    settings.DEBUG` check below is a second, defensive layer for the rare
    case this view is ever reached some other way (e.g. a future urls.py
    refactor) — it is not the primary guard.
    """

    def post(self, request):
        if not settings.DEBUG:
            raise Http404

        submitted_code = request.data.get("code")
        if not settings.DEV_UCHEM_TEST_CODE or submitted_code != settings.DEV_UCHEM_TEST_CODE:
            return Response({"detail": "Invalid test code."}, status=400)

        pairing_status, couple, _invite = get_status_for_user(request.user)
        if pairing_status != "paired":
            return Response({"detail": "You need to be paired with a partner first."}, status=400)

        wallet = restore_couple_wallet_for_development(couple)
        return Response(CoupleWalletSerializer(wallet).data)
