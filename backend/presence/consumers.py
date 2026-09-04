from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from . import registry
from .services import get_paired_couple_or_none, get_seat_assignments

# Custom WebSocket close codes (application-defined range is 4000-4999,
# per RFC 6455). Named here so tests can assert on them without magic
# numbers scattered around.
CLOSE_UNAUTHENTICATED = 4001
CLOSE_NOT_PAIRED = 4003
CLOSE_INVALID_FEATURE = 4004

# The only features Shared Presence supports right now — see presence's
# design notes for why this stays a short, explicit allowlist rather than
# accepting any string the client's URL happens to contain. Adding a third
# feature later (e.g. a future Games screen) is a one-line addition here.
ALLOWED_FEATURES = {"home", "watch"}

# Visibility is about a video temporarily covering the local avatar, not
# about the connection itself — kept as its own small allowlist, distinct
# from online/offline.
ALLOWED_VISIBILITY_STATES = {"visible", "video-hidden"}


def _group_name(couple_id: int, feature: str) -> str:
    """The feature-scoped room: movement, clicks, hugs, and visibility all
    stay inside this group and never cross into another feature's room."""
    return f"presence.couple.{couple_id}.{feature}"


def _location_group_name(couple_id: int) -> str:
    """The one couple-wide group every connection also joins, used only to
    broadcast "which feature is X currently in" — never active-interaction
    data. This is the sole, deliberate crossing of the feature-room
    boundary, and it carries nothing else."""
    return f"presence.couple.{couple_id}.location"


class PresenceConsumer(AsyncJsonWebsocketConsumer):
    """Realtime Shared Presence for one couple, scoped to one feature room.

    Connection identity always comes from `self.scope["user"]`, populated
    by Channels' AuthMiddlewareStack (see config/asgi.py) from the same
    Django session cookie REST endpoints already use — never from
    anything the client sends. The couple/seat are resolved from that
    identity alone, and the feature comes from the validated URL route
    (see routing.py), so a client can't join another couple's room, or
    fake which feature it's connecting from, by editing frontend
    JavaScript or WebSocket messages.
    """

    async def connect(self):
        user = self.scope["user"]
        if not user.is_authenticated:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        couple = await database_sync_to_async(get_paired_couple_or_none)(user)
        if couple is None:
            await self.close(code=CLOSE_NOT_PAIRED)
            return

        feature = self.scope["url_route"]["kwargs"]["feature"]
        if feature not in ALLOWED_FEATURES:
            await self.close(code=CLOSE_INVALID_FEATURE)
            return

        seats = await database_sync_to_async(get_seat_assignments)(couple)

        self.couple_id = couple.id
        self.user_id = user.id
        self.feature = feature
        self.seat = seats.get(user.id)
        self.group_name = _group_name(couple.id, feature)
        self.location_group_name = _location_group_name(couple.id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.location_group_name, self.channel_name)
        await self.accept()

        registry.connect(self.couple_id, self.feature, self.user_id, self.channel_name, self.seat)
        registry.set_current_feature(self.couple_id, self.user_id, self.feature)
        await self._send_initial_state(seats)

        # Lets an already-connected partner's client mark this user online
        # immediately, without waiting for a move event.
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "presence.join",
                "sender_channel": self.channel_name,
                "userId": self.user_id,
                "avatar": self.seat,
            },
        )
        await self._broadcast_location(self.feature)

    async def disconnect(self, close_code):
        # Only clean up if connect() actually got as far as joining the
        # group — a rejected connection (bad auth/not paired/bad feature)
        # never did.
        if getattr(self, "group_name", None) is None:
            return

        registry.disconnect(self.couple_id, self.feature, self.user_id)
        registry.clear_current_feature(self.couple_id, self.user_id)
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "presence.leave", "sender_channel": self.channel_name, "userId": self.user_id},
        )
        await self._broadcast_location(None)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_discard(self.location_group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")
        if message_type == "presence.move":
            await self._handle_move(content)
        elif message_type == "presence.click":
            await self._handle_click(content)
        elif message_type == "interaction.hug":
            await self._handle_hug()
        elif message_type == "presence.visibility":
            await self._handle_visibility(content)
        # Anything else (unknown type, malformed payload) is silently
        # ignored rather than raising — a stray or outdated client
        # shouldn't be able to kill its own connection by sending
        # something unexpected.

    async def _send_initial_state(self, seats):
        partner_id = next((uid for uid in seats if uid != self.user_id), None)
        partner = None
        if partner_id is not None:
            participant = registry.get_participant(self.couple_id, self.feature, partner_id)
            partner = {
                "userId": partner_id,
                "avatar": seats.get(partner_id),
                "online": participant is not None,
                "x": participant.x if participant else 0.5,
                "y": participant.y if participant else 0.5,
                "visible": participant.visible if participant else True,
                # Lets a freshly-connected client render the sleeping
                # partner's location label immediately, rather than
                # waiting for the next presence.location broadcast (which
                # only fires on the OTHER user's own connect/disconnect).
                "currentFeature": registry.get_current_feature(self.couple_id, partner_id),
            }

        await self.send_json(
            {
                "type": "presence.state",
                "self": {"userId": self.user_id, "avatar": self.seat},
                "partner": partner,
            }
        )

    async def _handle_move(self, content):
        try:
            x = float(content["x"])
            y = float(content["y"])
        except (KeyError, TypeError, ValueError):
            return
        # Untrusted client input — always clamp to the normalized range
        # regardless of what the client claims.
        x = max(0.0, min(1.0, x))
        y = max(0.0, min(1.0, y))

        registry.update_position(self.couple_id, self.feature, self.user_id, x, y)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "presence.move",
                "sender_channel": self.channel_name,
                "userId": self.user_id,
                "avatar": self.seat,
                "x": x,
                "y": y,
            },
        )

    async def _handle_click(self, content):
        # A click/tap ripple — deliberately not written to the registry
        # (unlike position): it's a one-off visual moment, not part of
        # anyone's ongoing presence state, so there's nothing to remember
        # for a client that connects later.
        try:
            x = float(content["x"])
            y = float(content["y"])
        except (KeyError, TypeError, ValueError):
            return
        x = max(0.0, min(1.0, x))
        y = max(0.0, min(1.0, y))

        await self.channel_layer.group_send(
            self.group_name,
            {"type": "presence.click", "sender_channel": self.channel_name, "x": x, "y": y},
        )

    async def _handle_hug(self):
        # Unlike move/join/leave, both partners must see the hug —
        # including whoever triggered it — so this is broadcast without
        # excluding the sender.
        await self.channel_layer.group_send(
            self.group_name, {"type": "interaction.hug", "userId": self.user_id}
        )

    async def _handle_visibility(self, content):
        # Purely a "is my avatar temporarily covering the video" signal —
        # not offline, not a different feature. Stays inside this feature's
        # room only; never touches the location group.
        state = content.get("state")
        if state not in ALLOWED_VISIBILITY_STATES:
            return

        registry.update_visibility(self.couple_id, self.feature, self.user_id, state == "visible")
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "presence.visibility",
                "sender_channel": self.channel_name,
                "userId": self.user_id,
                "state": state,
            },
        )

    async def _broadcast_location(self, feature):
        await self.channel_layer.group_send(
            self.location_group_name,
            {
                "type": "presence.location",
                "sender_channel": self.channel_name,
                "userId": self.user_id,
                "feature": feature,
            },
        )

    # --- Group event handlers ---
    # Channels dispatches a group_send by its "type" field (dots become
    # underscores: "presence.move" -> presence_move) to the same-named
    # method below on every consumer currently in the group. Each handler
    # relays the event down that one connection's own WebSocket — skipping
    # the original sender for events where the sender already knows its own
    # state (join/move/leave/click/visibility/location — each side applies
    # its own change optimistically, see PresenceContext.tsx), but not for
    # hug, which both partners must see as one shared, synchronized moment.

    async def presence_join(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json({"type": "presence.join", "userId": event["userId"], "avatar": event["avatar"]})

    async def presence_move(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json(
            {
                "type": "presence.move",
                "userId": event["userId"],
                "avatar": event["avatar"],
                "x": event["x"],
                "y": event["y"],
            }
        )

    async def presence_leave(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json({"type": "presence.leave", "userId": event["userId"]})

    async def interaction_hug(self, event):
        await self.send_json({"type": "interaction.hug", "fromUserId": event["userId"]})

    async def presence_click(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json({"type": "presence.click", "x": event["x"], "y": event["y"]})

    async def presence_visibility(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json({"type": "presence.visibility", "userId": event["userId"], "state": event["state"]})

    async def presence_location(self, event):
        if event["sender_channel"] == self.channel_name:
            return
        await self.send_json({"type": "presence.location", "userId": event["userId"], "feature": event["feature"]})
