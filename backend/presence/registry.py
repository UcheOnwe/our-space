"""In-memory registry of who's currently connected to Shared Presence.

Deliberately NOT PostgreSQL: this is temporary, per-process live state —
who's connected right now, where their avatar last was, and which feature
they're currently in — not data users expect to survive a session. Kept in
its own small module with a plain-function interface (no Channels/async
involved) so it, like CHANNEL_LAYERS in settings.py, is the one place that
would need to change (e.g. move to a shared store) if this ever ran as
more than one process. Nothing else in the app needs to know that detail.

Two separate structures, matching two separate concerns:
- `_registry` is per ROOM (couple + feature) — active-interaction state
  (position, connection, video visibility) that must stay isolated between
  Couple Home and Watch Together.
- `_current_feature` is per COUPLE only — which single feature each user is
  currently connected to, if any. This is the one piece of state allowed to
  cross feature-room boundaries (it's what powers the partner-location
  label), and it deliberately carries nothing else.
"""

from dataclasses import dataclass

RoomKey = tuple[int, str]  # (couple_id, feature)


@dataclass
class Participant:
    channel_name: str
    seat: str
    x: float = 0.5
    y: float = 0.5
    visible: bool = True


_registry: dict[RoomKey, dict[int, Participant]] = {}

# {couple_id: {user_id: feature}} — only ever holds an entry for a user
# while they have an active connection somewhere.
_current_feature: dict[int, dict[int, str]] = {}


def connect(couple_id: int, feature: str, user_id: int, channel_name: str, seat: str) -> None:
    _registry.setdefault((couple_id, feature), {})[user_id] = Participant(
        channel_name=channel_name, seat=seat
    )


def disconnect(couple_id: int, feature: str, user_id: int) -> None:
    room = _registry.get((couple_id, feature))
    if room is None:
        return
    room.pop(user_id, None)
    if not room:
        _registry.pop((couple_id, feature), None)


def update_position(couple_id: int, feature: str, user_id: int, x: float, y: float) -> None:
    participant = _registry.get((couple_id, feature), {}).get(user_id)
    if participant is not None:
        participant.x = x
        participant.y = y


def update_visibility(couple_id: int, feature: str, user_id: int, visible: bool) -> None:
    participant = _registry.get((couple_id, feature), {}).get(user_id)
    if participant is not None:
        participant.visible = visible


def get_participant(couple_id: int, feature: str, user_id: int) -> Participant | None:
    return _registry.get((couple_id, feature), {}).get(user_id)


def set_current_feature(couple_id: int, user_id: int, feature: str) -> None:
    _current_feature.setdefault(couple_id, {})[user_id] = feature


def clear_current_feature(couple_id: int, user_id: int) -> None:
    users = _current_feature.get(couple_id)
    if users is None:
        return
    users.pop(user_id, None)
    if not users:
        _current_feature.pop(couple_id, None)


def get_current_feature(couple_id: int, user_id: int) -> str | None:
    return _current_feature.get(couple_id, {}).get(user_id)
