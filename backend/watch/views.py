from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoadVideoSerializer, PlaybackStateSerializer, WatchSessionSerializer
from .services import WatchError, get_status_for_user, load_video, set_playback_state

# No permission_classes set on these views: the project-wide DRF default
# (IsAuthenticated) already applies, and none of these endpoints should be
# reachable while signed out. None take a couple/session ID in the URL —
# "your couple's session" is always derived from request.user's own
# CoupleMembership, the same structural authorization already used by the
# couples app.


def _session_response(session):
    if session is None:
        return {"video_loaded": False, "session": None}
    return {"video_loaded": True, "session": WatchSessionSerializer(session).data}


class WatchSessionStatusView(APIView):
    """GET /api/watch/watch-session-status/.

    The single source of truth for the caller's couple's Shared Watch
    state. Returns {"video_loaded": false, "session": null} if no video
    has ever been loaded — a GET never creates a WatchSession row.
    """

    def get(self, request):
        try:
            session = get_status_for_user(request.user)
        except WatchError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_session_response(session))


class LoadVideoView(APIView):
    """POST /api/watch/load-video/ — sets/replaces the couple's active video."""

    def post(self, request):
        serializer = LoadVideoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = load_video(request.user, serializer.validated_data["url"])
        except WatchError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_session_response(session), status=status.HTTP_201_CREATED)


class SetPlaybackStateView(APIView):
    """POST /api/watch/set-playback-state/ — covers play, pause, and seek alike."""

    def post(self, request):
        serializer = PlaybackStateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = set_playback_state(
                request.user,
                serializer.validated_data["status"],
                serializer.validated_data["position_seconds"],
            )
        except WatchError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_session_response(session))
