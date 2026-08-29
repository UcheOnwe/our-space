from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from couples.services import create_couple_with_invite, join_couple

User = get_user_model()

STATUS_URL = "/api/watch/watch-session-status/"
LOAD_URL = "/api/watch/load-video/"
PLAYBACK_URL = "/api/watch/set-playback-state/"


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(client, creator_name="alice", partner_name="bob"):
    creator = make_user(creator_name)
    _, invite = create_couple_with_invite(creator)
    partner = make_user(partner_name)
    join_couple(invite.code, partner)
    return creator, partner, invite.code


class WatchSessionStatusViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get(STATUS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejects_an_unpaired_user(self):
        make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reports_no_video_loaded_for_a_fresh_couple(self):
        make_paired_couple(self.client)
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["video_loaded"], False)
        self.assertIsNone(response.data["session"])


class LoadVideoViewTests(APITestCase):
    def setUp(self):
        self.creator, self.partner, _ = make_paired_couple(self.client)

    def test_requires_authentication(self):
        response = self.client.post(LOAD_URL, {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_loads_a_video_visible_to_both_partners(self):
        self.client.login(username="alice", password="a-strong-password-1")
        response = self.client.post(LOAD_URL, {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["session"]["provider_video_id"], "dQw4w9WgXcQ")
        self.client.logout()

        self.client.login(username="bob", password="a-strong-password-1")
        status_response = self.client.get(STATUS_URL)
        self.assertEqual(status_response.data["session"]["provider_video_id"], "dQw4w9WgXcQ")

    def test_rejects_a_malformed_url(self):
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(LOAD_URL, {"url": "not-a-real-link"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_another_couple_does_not_see_this_video(self):
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.post(LOAD_URL, {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        self.client.logout()

        make_paired_couple(self.client, "carol", "dave")
        self.client.login(username="carol", password="a-strong-password-1")

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.data["video_loaded"], False)


class SetPlaybackStateViewTests(APITestCase):
    def setUp(self):
        self.creator, self.partner, _ = make_paired_couple(self.client)
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.post(LOAD_URL, {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        self.client.logout()

    def test_requires_authentication(self):
        response = self.client.post(PLAYBACK_URL, {"status": "playing", "position_seconds": 0})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_partner_can_update_playback_and_creator_sees_it(self):
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(PLAYBACK_URL, {"status": "playing", "position_seconds": 30})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["session"]["playback_status"], "playing")
        self.client.logout()

        self.client.login(username="alice", password="a-strong-password-1")
        status_response = self.client.get(STATUS_URL)
        self.assertEqual(status_response.data["session"]["position_seconds"], 30)

    def test_rejects_a_negative_position(self):
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PLAYBACK_URL, {"status": "paused", "position_seconds": -1})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_setting_state_before_a_video_is_loaded(self):
        make_paired_couple(self.client, "carol", "dave")
        self.client.login(username="carol", password="a-strong-password-1")

        response = self.client.post(PLAYBACK_URL, {"status": "playing", "position_seconds": 0})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
