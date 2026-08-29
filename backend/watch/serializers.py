from rest_framework import serializers

from .models import WatchSession


class WatchSessionSerializer(serializers.ModelSerializer):
    """Read-only representation of a couple's Shared Watch state."""

    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = WatchSession
        fields = [
            "provider",
            "provider_video_id",
            "playback_status",
            "position_seconds",
            "updated_by",
            "updated_at",
        ]

    def get_updated_by(self, session):
        return session.updated_by.username if session.updated_by_id else None


class LoadVideoSerializer(serializers.Serializer):
    """Accepts a pasted URL or bare ID; the service does the real validation."""

    url = serializers.CharField(max_length=500)


class PlaybackStateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=WatchSession.PlaybackStatus.choices)
    position_seconds = serializers.FloatField(min_value=0)
