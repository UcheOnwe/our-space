from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

PROFILE_URL = "/api/companions/profile/"


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


class CompanionProfileViewTests(APITestCase):
    def test_get_requires_authentication(self):
        response = self.client.get(PROFILE_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_requires_authentication(self):
        response = self.client.patch(PROFILE_URL, {"companion_type": "cosmic_blob", "color_variant": "olive"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_lazily_creates_a_default_profile_for_an_unpaired_user(self):
        # No couple/pairing setup at all — proves GET works for a solo,
        # never-paired user (the approved plan's locked decision #2).
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(PROFILE_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["companion_type"], "cosmic_blob")
        self.assertEqual(response.data["color_variant"], "default")

    def test_get_does_not_create_a_second_row_on_repeated_calls(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        self.client.get(PROFILE_URL)
        self.client.get(PROFILE_URL)

        from companions.models import CompanionProfile

        self.assertEqual(CompanionProfile.objects.count(), 1)

    def test_patch_updates_the_selection_and_get_reflects_it(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        patch_response = self.client.patch(PROFILE_URL, {"companion_type": "mini_ufo", "color_variant": "midnight"})
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["companion_type"], "mini_ufo")
        self.assertEqual(patch_response.data["color_variant"], "midnight")

        get_response = self.client.get(PROFILE_URL)
        self.assertEqual(get_response.data["companion_type"], "mini_ufo")
        self.assertEqual(get_response.data["color_variant"], "midnight")

    def test_patch_rejects_an_unrecognized_companion_type(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(
            PROFILE_URL, {"companion_type": "not-a-real-companion", "color_variant": "olive"}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_rejects_an_unrecognized_color(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(
            PROFILE_URL, {"companion_type": "cosmic_blob", "color_variant": "not-a-real-color"}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_rejects_a_color_not_available_for_that_companion(self):
        # "midnight" is curated for mini_ufo, not cosmic_blob — proves the
        # combination is checked, not just each field independently.
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(PROFILE_URL, {"companion_type": "cosmic_blob", "color_variant": "midnight"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_requires_both_fields(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(PROFILE_URL, {"companion_type": "mini_ufo"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_two_users_have_independent_profiles(self):
        make_user("alice")
        make_user("bob")

        self.client.login(username="alice", password="a-strong-password-1")
        self.client.patch(PROFILE_URL, {"companion_type": "star_wisp", "color_variant": "starlight"})
        self.client.logout()

        self.client.login(username="bob", password="a-strong-password-1")
        response = self.client.get(PROFILE_URL)

        # bob's own default, completely untouched by alice's change.
        self.assertEqual(response.data["companion_type"], "cosmic_blob")
        self.assertEqual(response.data["color_variant"], "default")

    def test_patch_accepts_nova_guardian_with_its_own_curated_color(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(PROFILE_URL, {"companion_type": "nova_guardian", "color_variant": "midnight"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["companion_type"], "nova_guardian")
        self.assertEqual(response.data["color_variant"], "midnight")

    def test_patch_rejects_a_color_not_curated_for_nova_guardian(self):
        # "olive" is curated for cosmic_blob, not nova_guardian.
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(PROFILE_URL, {"companion_type": "nova_guardian", "color_variant": "olive"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_accepts_returning_the_blob_to_its_default_style(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.patch(PROFILE_URL, {"companion_type": "mini_ufo", "color_variant": "silver"})

        response = self.client.patch(PROFILE_URL, {"companion_type": "cosmic_blob", "color_variant": "default"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["color_variant"], "default")

    def test_patch_still_accepts_a_flat_recolor_of_the_blob(self):
        # "olive" was the OLD default and remains a valid, deliberate
        # recolor choice — only the SYSTEM default changed, nothing was
        # removed from the Blob's own palette.
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.patch(PROFILE_URL, {"companion_type": "cosmic_blob", "color_variant": "olive"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["color_variant"], "olive")
