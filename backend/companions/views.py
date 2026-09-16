from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import CompanionProfileSerializer, CompanionSelectionSerializer
from .services import get_or_create_profile, update_selection

# No permission_classes set here: the project-wide DRF default
# (IsAuthenticated, see config/settings.py) already applies, and this
# endpoint should not be reachable while signed out. Unlike watch/couples,
# there is deliberately NO couple/CoupleMembership lookup anywhere in this
# file — Companion Profile requires only authentication (see the approved
# plan's locked decision #2), so a solo/unpaired user can create and
# customize a Companion the same as a paired one.


class CompanionProfileView(APIView):
    """GET/PATCH /api/companions/profile/ — the caller's own Companion
    Profile, a singleton per user (CompanionProfile.user is a
    OneToOneField).
    """

    def get(self, request):
        """Never 404s — lazily creates a default profile on first access."""
        profile = get_or_create_profile(request.user)
        return Response(CompanionProfileSerializer(profile).data)

    def patch(self, request):
        """Updates the caller's equipped companion_type AND color_variant together."""
        serializer = CompanionSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile = update_selection(
            request.user,
            serializer.validated_data["companion_type"],
            serializer.validated_data["color_variant"],
        )
        return Response(CompanionProfileSerializer(profile).data)
