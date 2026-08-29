import re

from django.db import transaction

from couples.models import CoupleMembership

from .models import WatchSession

# Matches the common YouTube URL shapes (watch?v=, youtu.be/, embed/,
# shorts/) plus a bare 11-character video ID typed/pasted directly.
_YOUTUBE_ID_PATTERN = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$"
)


class WatchError(Exception):
    """Raised for any Shared Watch business rule violation.

    Views catch this and return its message as a 400 response with
    `detail`, matching the accounts/couples error shape.
    """


def _extract_youtube_id(raw_value: str) -> str:
    match = _YOUTUBE_ID_PATTERN.search(raw_value.strip())
    if not match:
        raise WatchError("That doesn't look like a valid YouTube link.")
    return match.group(1) or match.group(2)


def _get_couple_for_user(user):
    membership = CoupleMembership.objects.filter(user=user).select_related("couple").first()
    if membership is None:
        raise WatchError("You need to be paired with a partner first.")
    return membership.couple


def get_status_for_user(user):
    """Returns the caller's couple's WatchSession, or None if no video has ever been loaded."""
    couple = _get_couple_for_user(user)
    return WatchSession.objects.filter(couple=couple).select_related("updated_by").first()


def load_video(user, raw_url_or_id):
    """Sets the couple's active video, always starting paused at 0.

    Starting paused (rather than trying to preserve some prior "playing"
    intent) sidesteps browser autoplay restrictions entirely and gives
    both partners a clean, shared starting point. Either partner may call
    this at any time — couples are symmetric peers, there's no "host".
    """
    couple = _get_couple_for_user(user)
    video_id = _extract_youtube_id(raw_url_or_id)

    with transaction.atomic():
        session, _ = WatchSession.objects.get_or_create(couple=couple)
        session.provider = WatchSession.Provider.YOUTUBE
        session.provider_video_id = video_id
        session.playback_status = WatchSession.PlaybackStatus.PAUSED
        session.position_seconds = 0
        session.updated_by = user
        session.save()

    return session


def set_playback_state(user, status, position_seconds):
    """Overwrites the couple's playback intent — covers play, pause, and seek alike.

    Last-writer-wins: only two people can ever write to one WatchSession,
    and unlike couple pairing's two-member cap, there's no invariant a
    race here could violate, so no locking is needed. Whichever update
    lands second wins; the other partner's next poll converges to it.
    """
    couple = _get_couple_for_user(user)
    session = WatchSession.objects.filter(couple=couple).first()
    if session is None:
        raise WatchError("Load a video before setting playback state.")

    if position_seconds < 0:
        raise WatchError("Playback position cannot be negative.")

    session.playback_status = status
    session.position_seconds = position_seconds
    session.updated_by = user
    session.save(update_fields=["playback_status", "position_seconds", "updated_by", "updated_at"])

    return session
