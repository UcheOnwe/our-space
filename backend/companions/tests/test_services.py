from django.contrib.auth import get_user_model
from django.test import TestCase

from companions.models import CompanionProfile
from companions.services import get_or_create_profile, update_selection

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


class GetOrCreateProfileTests(TestCase):
    def test_creates_a_default_profile_on_first_access(self):
        user = make_user()

        profile = get_or_create_profile(user)

        # The true default: Cosmic Blob in its own original "Default"
        # appearance, not a flat recolor — see ColorVariant.DEFAULT's own
        # comment in models.py.
        self.assertEqual(profile.companion_type, CompanionProfile.CompanionType.COSMIC_BLOB)
        self.assertEqual(profile.color_variant, CompanionProfile.ColorVariant.DEFAULT)

    def test_returns_the_same_row_on_subsequent_access(self):
        user = make_user()
        first = get_or_create_profile(user)
        update_selection(user, CompanionProfile.CompanionType.MINI_UFO, CompanionProfile.ColorVariant.SILVER)

        second = get_or_create_profile(user)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(second.companion_type, CompanionProfile.CompanionType.MINI_UFO)
        self.assertEqual(CompanionProfile.objects.filter(user=user).count(), 1)

    def test_lazy_creation_does_not_require_a_couple(self):
        # No CoupleMembership row is ever created for this user — proves
        # Companion Profile has no couple-pairing dependency at all (the
        # approved plan's locked decision #2).
        lone_user = make_user("solo")

        profile = get_or_create_profile(lone_user)

        self.assertIsNotNone(profile.pk)


class UpdateSelectionTests(TestCase):
    def test_updates_both_fields(self):
        user = make_user()

        profile = update_selection(
            user, CompanionProfile.CompanionType.STAR_WISP, CompanionProfile.ColorVariant.STARLIGHT
        )

        self.assertEqual(profile.companion_type, CompanionProfile.CompanionType.STAR_WISP)
        self.assertEqual(profile.color_variant, CompanionProfile.ColorVariant.STARLIGHT)

    def test_persists_across_calls(self):
        user = make_user()
        update_selection(user, CompanionProfile.CompanionType.COSMIC_FLYER, CompanionProfile.ColorVariant.SUNSET)

        profile = CompanionProfile.objects.get(user=user)

        self.assertEqual(profile.companion_type, CompanionProfile.CompanionType.COSMIC_FLYER)
        self.assertEqual(profile.color_variant, CompanionProfile.ColorVariant.SUNSET)

    def test_can_equip_nova_guardian(self):
        user = make_user()

        profile = update_selection(
            user, CompanionProfile.CompanionType.NOVA_GUARDIAN, CompanionProfile.ColorVariant.MIDNIGHT
        )

        self.assertEqual(profile.companion_type, CompanionProfile.CompanionType.NOVA_GUARDIAN)
        self.assertEqual(profile.color_variant, CompanionProfile.ColorVariant.MIDNIGHT)

    def test_can_return_to_default_blob_after_equipping_something_else(self):
        user = make_user()
        update_selection(user, CompanionProfile.CompanionType.MINI_UFO, CompanionProfile.ColorVariant.SILVER)

        profile = update_selection(
            user, CompanionProfile.CompanionType.COSMIC_BLOB, CompanionProfile.ColorVariant.DEFAULT
        )

        self.assertEqual(profile.companion_type, CompanionProfile.CompanionType.COSMIC_BLOB)
        self.assertEqual(profile.color_variant, CompanionProfile.ColorVariant.DEFAULT)
