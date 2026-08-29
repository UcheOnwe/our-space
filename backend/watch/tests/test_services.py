from django.contrib.auth import get_user_model
from django.test import TestCase

from couples.services import create_couple_with_invite, join_couple
from watch.models import WatchSession
from watch.services import WatchError, get_status_for_user, load_video, set_playback_state

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(creator_name="alice", partner_name="bob"):
    creator = make_user(creator_name)
    _, invite = create_couple_with_invite(creator)
    partner = make_user(partner_name)
    join_couple(invite.code, partner)
    return creator, partner


class LoadVideoTests(TestCase):
    def test_paired_user_can_load_a_video(self):
        creator, _ = make_paired_couple()

        session = load_video(creator, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        self.assertEqual(session.provider_video_id, "dQw4w9WgXcQ")
        self.assertEqual(session.playback_status, WatchSession.PlaybackStatus.PAUSED)
        self.assertEqual(session.position_seconds, 0)

    def test_accepts_short_youtu_be_links(self):
        creator, _ = make_paired_couple()

        session = load_video(creator, "https://youtu.be/dQw4w9WgXcQ")

        self.assertEqual(session.provider_video_id, "dQw4w9WgXcQ")

    def test_rejects_an_unpaired_user(self):
        lone_user = make_user("solo")

        with self.assertRaises(WatchError):
            load_video(lone_user, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    def test_rejects_a_malformed_url(self):
        creator, _ = make_paired_couple()

        with self.assertRaises(WatchError):
            load_video(creator, "not a youtube link")

    def test_loading_a_new_video_resets_playback(self):
        creator, _ = make_paired_couple()
        load_video(creator, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        set_playback_state(creator, "playing", 42.0)

        session = load_video(creator, "https://www.youtube.com/watch?v=oHg5SJYRHA0")

        self.assertEqual(session.provider_video_id, "oHg5SJYRHA0")
        self.assertEqual(session.playback_status, WatchSession.PlaybackStatus.PAUSED)
        self.assertEqual(session.position_seconds, 0)

    def test_either_partner_can_load_a_video(self):
        creator, partner = make_paired_couple()
        load_video(creator, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        session = load_video(partner, "https://www.youtube.com/watch?v=oHg5SJYRHA0")

        self.assertEqual(session.provider_video_id, "oHg5SJYRHA0")


class SetPlaybackStateTests(TestCase):
    def setUp(self):
        self.creator, self.partner = make_paired_couple()
        load_video(self.creator, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    def test_updates_status_and_position(self):
        session = set_playback_state(self.partner, "playing", 12.5)

        self.assertEqual(session.playback_status, WatchSession.PlaybackStatus.PLAYING)
        self.assertEqual(session.position_seconds, 12.5)
        self.assertEqual(session.updated_by, self.partner)

    def test_rejects_setting_state_before_any_video_is_loaded(self):
        other_creator, _ = make_paired_couple("carol", "dave")  # a different couple, no video loaded

        with self.assertRaises(WatchError):
            set_playback_state(other_creator, "playing", 0)

    def test_rejects_a_negative_position(self):
        with self.assertRaises(WatchError):
            set_playback_state(self.creator, "paused", -5)

    def test_rejects_an_unpaired_user(self):
        lone_user = make_user("solo")

        with self.assertRaises(WatchError):
            set_playback_state(lone_user, "playing", 0)


class GetStatusForUserTests(TestCase):
    def test_returns_none_when_no_video_has_been_loaded(self):
        creator, _ = make_paired_couple()

        self.assertIsNone(get_status_for_user(creator))

    def test_returns_the_session_after_a_video_is_loaded(self):
        creator, _ = make_paired_couple()
        load_video(creator, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        session = get_status_for_user(creator)

        self.assertEqual(session.provider_video_id, "dQw4w9WgXcQ")

    def test_rejects_an_unpaired_user(self):
        lone_user = make_user("solo")

        with self.assertRaises(WatchError):
            get_status_for_user(lone_user)
