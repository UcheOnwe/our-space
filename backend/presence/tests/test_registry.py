from django.test import SimpleTestCase

from presence import registry


class RegistryTests(SimpleTestCase):
    def setUp(self):
        # The registry is module-level state — clear it between tests so
        # they don't leak into each other.
        registry._registry.clear()
        registry._current_feature.clear()

    def test_connect_then_get_participant(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")

        participant = registry.get_participant(1, "home", 10)

        self.assertEqual(participant.channel_name, "chan-1")
        self.assertEqual(participant.seat, "A")
        self.assertEqual((participant.x, participant.y), (0.5, 0.5))
        self.assertTrue(participant.visible)

    def test_update_position(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")

        registry.update_position(1, "home", 10, 0.2, 0.9)

        participant = registry.get_participant(1, "home", 10)
        self.assertEqual((participant.x, participant.y), (0.2, 0.9))

    def test_update_visibility(self):
        registry.connect(couple_id=1, feature="watch", user_id=10, channel_name="chan-1", seat="A")

        registry.update_visibility(1, "watch", 10, False)

        self.assertFalse(registry.get_participant(1, "watch", 10).visible)

    def test_disconnect_removes_the_participant(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")

        registry.disconnect(1, "home", 10)

        self.assertIsNone(registry.get_participant(1, "home", 10))

    def test_unknown_participant_returns_none(self):
        self.assertIsNone(registry.get_participant(999, "home", 999))

    def test_couples_do_not_share_state(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")
        registry.connect(couple_id=2, feature="home", user_id=10, channel_name="chan-2", seat="A")

        registry.update_position(1, "home", 10, 0.1, 0.1)

        self.assertEqual(
            (registry.get_participant(1, "home", 10).x, registry.get_participant(1, "home", 10).y), (0.1, 0.1)
        )
        self.assertEqual(
            (registry.get_participant(2, "home", 10).x, registry.get_participant(2, "home", 10).y), (0.5, 0.5)
        )

    def test_features_do_not_share_state_for_the_same_couple(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")
        registry.connect(couple_id=1, feature="watch", user_id=10, channel_name="chan-2", seat="A")

        registry.update_position(1, "home", 10, 0.1, 0.1)

        self.assertEqual(
            (registry.get_participant(1, "home", 10).x, registry.get_participant(1, "home", 10).y), (0.1, 0.1)
        )
        self.assertEqual(
            (registry.get_participant(1, "watch", 10).x, registry.get_participant(1, "watch", 10).y), (0.5, 0.5)
        )

    def test_disconnecting_one_feature_leaves_the_other_untouched(self):
        registry.connect(couple_id=1, feature="home", user_id=10, channel_name="chan-1", seat="A")
        registry.connect(couple_id=1, feature="watch", user_id=10, channel_name="chan-2", seat="A")

        registry.disconnect(1, "home", 10)

        self.assertIsNone(registry.get_participant(1, "home", 10))
        self.assertIsNotNone(registry.get_participant(1, "watch", 10))


class CurrentFeatureTests(SimpleTestCase):
    def setUp(self):
        registry._registry.clear()
        registry._current_feature.clear()

    def test_set_then_get_current_feature(self):
        registry.set_current_feature(1, 10, "watch")

        self.assertEqual(registry.get_current_feature(1, 10), "watch")

    def test_unknown_user_has_no_current_feature(self):
        self.assertIsNone(registry.get_current_feature(1, 999))

    def test_clear_current_feature(self):
        registry.set_current_feature(1, 10, "watch")

        registry.clear_current_feature(1, 10)

        self.assertIsNone(registry.get_current_feature(1, 10))

    def test_moving_features_overwrites_rather_than_accumulates(self):
        registry.set_current_feature(1, 10, "home")
        registry.set_current_feature(1, 10, "watch")

        self.assertEqual(registry.get_current_feature(1, 10), "watch")

    def test_couples_do_not_share_current_feature_state(self):
        registry.set_current_feature(1, 10, "watch")
        registry.set_current_feature(2, 10, "home")

        self.assertEqual(registry.get_current_feature(1, 10), "watch")
        self.assertEqual(registry.get_current_feature(2, 10), "home")
