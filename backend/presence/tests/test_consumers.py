from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TransactionTestCase

from couples.services import create_couple_with_invite, join_couple
from presence.consumers import (
    CLOSE_INVALID_FEATURE,
    CLOSE_NOT_PAIRED,
    CLOSE_UNAUTHENTICATED,
    PresenceConsumer,
)

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(creator_name="alice", partner_name="bob"):
    creator = make_user(creator_name)
    _, invite = create_couple_with_invite(creator)
    partner = make_user(partner_name)
    join_couple(invite.code, partner)
    return creator, partner


async def connect_as(user, feature="home"):
    """Connects directly to PresenceConsumer, bypassing AuthMiddlewareStack —
    the same isolation Channels' own docs recommend for testing a consumer's
    own logic rather than re-testing the auth middleware library code."""
    communicator = WebsocketCommunicator(PresenceConsumer.as_asgi(), f"/ws/presence/{feature}/")
    communicator.scope["user"] = user
    communicator.scope["url_route"] = {"kwargs": {"feature": feature}}
    connected, close_code = await communicator.connect()
    return communicator, connected, close_code


async def receive_several(communicator, count):
    return [await communicator.receive_json_from() for _ in range(count)]


async def drain_join_and_location(communicator):
    """A peer of the same couple connecting broadcasts two things to any
    already-connected sibling: presence.join (if they're in the SAME
    feature room) or nothing feature-wise (if a different room), and
    presence.location (always — the one couple-wide exception to room
    isolation). Used where a test just needs to get past a connect it
    isn't actually testing."""
    await receive_several(communicator, 2)


class ConnectionAuthorizationTests(TransactionTestCase):
    async def test_rejects_an_unauthenticated_connection(self):
        communicator, connected, close_code = await connect_as(AnonymousUser())

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_UNAUTHENTICATED)
        await communicator.disconnect()

    async def test_rejects_an_authenticated_but_unpaired_user(self):
        user = await database_sync_to_async(make_user)("solo")

        communicator, connected, close_code = await connect_as(user)

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_NOT_PAIRED)
        await communicator.disconnect()

    async def test_rejects_a_feature_outside_the_allowlist(self):
        creator, _partner = await database_sync_to_async(make_paired_couple)()

        communicator, connected, close_code = await connect_as(creator, feature="games")

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_INVALID_FEATURE)
        await communicator.disconnect()

    async def test_a_paired_user_can_connect_and_receives_initial_state(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        communicator, connected, _ = await connect_as(creator)
        self.assertTrue(connected)

        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "presence.state")
        self.assertEqual(message["self"], {"userId": creator.id, "avatar": "A"})
        # Partner identity/avatar is known even though they're not connected
        # anywhere yet — needed to render their idle Mouse Spirit, and
        # currentFeature is None since they're nowhere in Our Space.
        self.assertEqual(
            message["partner"],
            {
                "userId": partner.id,
                "avatar": "B",
                "online": False,
                "x": 0.5,
                "y": 0.5,
                "visible": True,
                "currentFeature": None,
            },
        )

        await communicator.disconnect()


class CoupleIsolationTests(TransactionTestCase):
    async def test_a_second_couple_never_receives_the_first_couples_events(self):
        creator_a, partner_a = await database_sync_to_async(make_paired_couple)("alice", "bob")
        creator_b, _partner_b = await database_sync_to_async(make_paired_couple)("carol", "dave")

        comm_a1, connected_a1, _ = await connect_as(creator_a)
        self.assertTrue(connected_a1)
        await comm_a1.receive_json_from()  # initial presence.state

        comm_b, connected_b, _ = await connect_as(creator_b)
        self.assertTrue(connected_b)
        await comm_b.receive_json_from()  # its own initial presence.state

        comm_a2, connected_a2, _ = await connect_as(partner_a)
        self.assertTrue(connected_a2)
        await comm_a2.receive_json_from()  # its own initial presence.state
        # presence.join + presence.location from partner_a, to couple A only
        await drain_join_and_location(comm_a1)

        await comm_a2.send_json_to({"type": "presence.move", "x": 0.2, "y": 0.9})
        move_seen_by_a1 = await comm_a1.receive_json_from()
        self.assertEqual(move_seen_by_a1["type"], "presence.move")
        self.assertEqual(move_seen_by_a1["userId"], partner_a.id)

        # Couple B's connection must never see couple A's move.
        self.assertTrue(await comm_b.receive_nothing(timeout=0.2))

        for communicator in (comm_a1, comm_a2, comm_b):
            await communicator.disconnect()


class FeatureIsolationTests(TransactionTestCase):
    """Covers the whole point of feature-scoped rooms: being in Watch
    Together must not make a couple's Home room think that user is active
    there, and vice versa — this is what keeps the sleeping/grayed-out
    "partner left this feature" behavior correct. Note: presence.location
    IS expected to cross Home/Watch (that's the one deliberate exception —
    see LocationMetadataTests) — these tests drain it explicitly so they
    can assert that nothing ELSE crosses."""

    async def test_movement_does_not_cross_home_and_watch(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()
        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()
        await comm_creator_home.receive_json_from()  # presence.location: watch

        await comm_partner_watch.send_json_to({"type": "presence.move", "x": 0.3, "y": 0.3})

        # creator is in "home", partner's move happened in "watch" — must
        # never arrive here.
        self.assertTrue(await comm_creator_home.receive_nothing(timeout=0.2))

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()

    async def test_click_does_not_cross_home_and_watch(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()
        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()
        await comm_creator_home.receive_json_from()  # presence.location: watch

        await comm_partner_watch.send_json_to({"type": "presence.click", "x": 0.3, "y": 0.3})

        self.assertTrue(await comm_creator_home.receive_nothing(timeout=0.2))

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()

    async def test_hug_does_not_cross_home_and_watch(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()
        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()
        await comm_creator_home.receive_json_from()  # presence.location: watch

        await comm_partner_watch.send_json_to({"type": "interaction.hug"})

        # The hug is visible in "watch" (to the sender itself)...
        hug = await comm_partner_watch.receive_json_from()
        self.assertEqual(hug["type"], "interaction.hug")
        # ...but never reaches "home".
        self.assertTrue(await comm_creator_home.receive_nothing(timeout=0.2))

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()

    async def test_users_in_the_same_feature_see_each_others_activity(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator, feature="watch")
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner, feature="watch")
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_partner.send_json_to({"type": "presence.move", "x": 0.4, "y": 0.6})
        move = await comm_creator.receive_json_from()
        self.assertEqual(move["userId"], partner.id)

        await comm_creator.disconnect()
        await comm_partner.disconnect()

    async def test_joining_watch_does_not_wake_the_partners_home_view(self):
        """The exact scenario the feature-scoping fix exists for: creator
        stays on Home; partner moves from nowhere straight into Watch. The
        creator's Home connection must see the location update (that's
        expected and correct) but never a presence.join for its own room."""
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()

        comm_partner_watch, connected, _ = await connect_as(partner, feature="watch")
        self.assertTrue(connected)
        await comm_partner_watch.receive_json_from()  # its own initial state

        location = await comm_creator_home.receive_json_from()
        self.assertEqual(location, {"type": "presence.location", "userId": partner.id, "feature": "watch"})
        # Nothing else — specifically no presence.join for the Home room,
        # which is what "waking up" would look like.
        self.assertTrue(await comm_creator_home.receive_nothing(timeout=0.2))

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()


class LocationMetadataTests(TransactionTestCase):
    """The one deliberate exception to feature-room isolation: a small,
    couple-wide broadcast of "which feature is X in", used only for the
    sleeping partner's location label — never active-interaction data."""

    async def test_connecting_to_a_different_feature_notifies_the_partner(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()

        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()

        location = await comm_creator_home.receive_json_from()
        self.assertEqual(location, {"type": "presence.location", "userId": partner.id, "feature": "watch"})

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()

    async def test_disconnecting_clears_the_location_and_does_not_linger(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()
        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()
        await comm_creator_home.receive_json_from()  # presence.location: watch

        await comm_partner_watch.disconnect()

        location = await comm_creator_home.receive_json_from()
        self.assertEqual(location, {"type": "presence.location", "userId": partner.id, "feature": None})

        await comm_creator_home.disconnect()

    async def test_initial_state_reports_the_partners_current_feature(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        state = await comm_creator_home.receive_json_from()

        self.assertEqual(state["partner"]["online"], False)
        self.assertEqual(state["partner"]["currentFeature"], "watch")

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()


class VisibilityTests(TransactionTestCase):
    async def test_visibility_reaches_the_partner_in_the_same_feature(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator, feature="watch")
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner, feature="watch")
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_partner.send_json_to({"type": "presence.visibility", "state": "video-hidden"})

        visibility = await comm_creator.receive_json_from()
        self.assertEqual(
            visibility, {"type": "presence.visibility", "userId": partner.id, "state": "video-hidden"}
        )

        await comm_creator.disconnect()
        await comm_partner.disconnect()

    async def test_visibility_does_not_cross_feature_rooms(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator_home, _, _ = await connect_as(creator, feature="home")
        await comm_creator_home.receive_json_from()
        comm_partner_watch, _, _ = await connect_as(partner, feature="watch")
        await comm_partner_watch.receive_json_from()
        await comm_creator_home.receive_json_from()  # presence.location broadcast

        await comm_partner_watch.send_json_to({"type": "presence.visibility", "state": "video-hidden"})

        self.assertTrue(await comm_creator_home.receive_nothing(timeout=0.2))

        await comm_creator_home.disconnect()
        await comm_partner_watch.disconnect()

    async def test_an_invalid_visibility_state_is_ignored(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator, feature="watch")
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner, feature="watch")
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_partner.send_json_to({"type": "presence.visibility", "state": "not-a-real-state"})

        self.assertTrue(await comm_creator.receive_nothing(timeout=0.2))

        await comm_creator.disconnect()
        await comm_partner.disconnect()

    async def test_video_hidden_does_not_affect_online_status(self):
        """Video-hidden must never look like sleeping/offline — confirmed
        by checking a freshly-connecting third view of the same state."""
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator, feature="watch")
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner, feature="watch")
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_partner.send_json_to({"type": "presence.visibility", "state": "video-hidden"})
        await comm_creator.receive_json_from()  # the visibility broadcast itself

        await comm_creator.disconnect()
        # A fresh connection re-reads the registry's stored visibility.
        comm_creator2, _, _ = await connect_as(creator, feature="watch")
        state = await comm_creator2.receive_json_from()

        self.assertEqual(state["partner"]["online"], True)
        self.assertEqual(state["partner"]["visible"], False)

        await comm_creator2.disconnect()
        await comm_partner.disconnect()


class MovementBroadcastTests(TransactionTestCase):
    async def test_move_reaches_the_partner_with_clamped_coordinates(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()  # initial state
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()  # its own initial state
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        # Out-of-range values must be clamped server-side, not trusted as-is.
        await comm_partner.send_json_to({"type": "presence.move", "x": 1.4, "y": -0.3})

        move = await comm_creator.receive_json_from()
        self.assertEqual(move, {"type": "presence.move", "userId": partner.id, "avatar": "B", "x": 1.0, "y": 0.0})

        await comm_creator.disconnect()
        await comm_partner.disconnect()

    async def test_a_spoofed_identity_in_the_payload_is_ignored(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        # partner tries to claim to be the creator / seat A — must be ignored.
        await comm_partner.send_json_to(
            {"type": "presence.move", "x": 0.5, "y": 0.5, "userId": creator.id, "avatar": "A"}
        )

        move = await comm_creator.receive_json_from()
        self.assertEqual(move["userId"], partner.id)
        self.assertEqual(move["avatar"], "B")

        await comm_creator.disconnect()
        await comm_partner.disconnect()


class ClickBroadcastTests(TransactionTestCase):
    async def test_click_reaches_the_partner_with_clamped_coordinates(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        # Out-of-range values must be clamped server-side, not trusted as-is.
        await comm_partner.send_json_to({"type": "presence.click", "x": 1.4, "y": -0.3})

        click = await comm_creator.receive_json_from()
        self.assertEqual(click, {"type": "presence.click", "x": 1.0, "y": 0.0})

        await comm_creator.disconnect()
        await comm_partner.disconnect()

    async def test_a_click_is_not_echoed_back_to_its_own_sender(self):
        # The frontend shows its own click ripple optimistically rather
        # than waiting on a round-trip — see PresenceContext.tsx — so the
        # server must not echo it back.
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_creator.send_json_to({"type": "presence.click", "x": 0.5, "y": 0.5})

        # The partner receives it...
        click = await comm_partner.receive_json_from()
        self.assertEqual(click, {"type": "presence.click", "x": 0.5, "y": 0.5})
        # ...but the sender receives nothing further.
        self.assertTrue(await comm_creator.receive_nothing(timeout=0.2))

        await comm_creator.disconnect()
        await comm_partner.disconnect()


class HugInteractionTests(TransactionTestCase):
    async def test_hug_broadcasts_to_both_partners_including_the_sender(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_creator.send_json_to({"type": "interaction.hug"})

        seen_by_sender = await comm_creator.receive_json_from()
        seen_by_partner = await comm_partner.receive_json_from()
        self.assertEqual(seen_by_sender, {"type": "interaction.hug", "fromUserId": creator.id})
        self.assertEqual(seen_by_partner, {"type": "interaction.hug", "fromUserId": creator.id})

        await comm_creator.disconnect()
        await comm_partner.disconnect()


class DisconnectTests(TransactionTestCase):
    async def test_leaving_notifies_the_still_connected_partner(self):
        creator, partner = await database_sync_to_async(make_paired_couple)()

        comm_creator, _, _ = await connect_as(creator)
        await comm_creator.receive_json_from()
        comm_partner, _, _ = await connect_as(partner)
        await comm_partner.receive_json_from()
        await drain_join_and_location(comm_creator)  # presence.join + presence.location

        await comm_partner.disconnect()

        leave_event, location_event = await receive_several(comm_creator, 2)
        self.assertEqual(leave_event, {"type": "presence.leave", "userId": partner.id})
        self.assertEqual(location_event, {"type": "presence.location", "userId": partner.id, "feature": None})

        await comm_creator.disconnect()
