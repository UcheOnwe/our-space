from django.conf import settings
from django.db import models

from couples.models import Couple


class WatchSession(models.Model):
    """The couple's current Shared Watch state: one video, one playback intent.

    OneToOne with Couple — a couple has at most one active watch session,
    the same way CoupleMembership.user makes "one couple per user" a
    database fact rather than an app-level assumption.

    `provider` is the smallest reasonable hook for future embedded
    providers: adding a second one later means adding a choice and
    provider-specific handling in the service layer, not restructuring
    this model or inventing a "YouTubeSession" subclass.

    `position_seconds` is an ANCHOR, not a continuously-updated value — it
    only changes at real events (load/play/pause/seek), never on a timer.
    Each browser estimates its own smooth position between polls; this
    table never sees per-second writes.
    """

    class Provider(models.TextChoices):
        YOUTUBE = "youtube", "YouTube"

    class PlaybackStatus(models.TextChoices):
        PAUSED = "paused", "Paused"
        PLAYING = "playing", "Playing"

    couple = models.OneToOneField(Couple, on_delete=models.CASCADE, related_name="watch_session")
    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.YOUTUBE)
    provider_video_id = models.CharField(max_length=32, blank=True)
    playback_status = models.CharField(
        max_length=10, choices=PlaybackStatus.choices, default=PlaybackStatus.PAUSED
    )
    position_seconds = models.FloatField(default=0)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)
