from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from couples.services import create_couple_with_invite

User = get_user_model()

CREATE_URL = "/api/couples/"
STATUS_URL = "/api/couples/couple-status/"
JOIN_URL = "/api/couples/join/"
CANCEL_URL = "/api/couples/cancel-pending-pairing/"


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


class CreateCoupleViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.post(CREATE_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_a_couple_with_an_invite(self):
        user = make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(CREATE_URL)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["invite"]["code"]), 6)
        self.assertEqual(response.data["couple"]["members"][0]["username"], "alice")

    def test_rejects_a_second_create_for_the_same_user(self):
        make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.post(CREATE_URL)

        response = self.client.post(CREATE_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)


class CoupleStatusViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get(STATUS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_none_for_an_unpaired_user(self):
        make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "none")

    def test_reports_waiting_with_the_invite_code_for_the_creator(self):
        creator = make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")
        create_response = self.client.post(CREATE_URL)
        code = create_response.data["invite"]["code"]

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.data["status"], "waiting")
        self.assertEqual(response.data["invite"]["code"], code)

    def test_reports_paired_with_both_members_after_joining(self):
        make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")
        create_response = self.client.post(CREATE_URL)
        code = create_response.data["invite"]["code"]
        self.client.logout()

        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")
        self.client.post(JOIN_URL, {"code": code})

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.data["status"], "paired")
        usernames = {member["username"] for member in response.data["couple"]["members"]}
        self.assertEqual(usernames, {"alice", "bob"})


class JoinCoupleViewTests(APITestCase):
    def setUp(self):
        self.creator = make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")
        create_response = self.client.post(CREATE_URL)
        self.code = create_response.data["invite"]["code"]
        self.client.logout()

    def test_requires_authentication(self):
        response = self.client.post(JOIN_URL, {"code": self.code})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_joins_with_a_valid_code(self):
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(JOIN_URL, {"code": self.code})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {member["username"] for member in response.data["couple"]["members"]}
        self.assertEqual(usernames, {"alice", "bob"})

    def test_code_entry_is_case_insensitive(self):
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(JOIN_URL, {"code": self.code.lower()})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_rejects_an_invalid_code(self):
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(JOIN_URL, {"code": "ZZZZZZ"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_self_pairing(self):
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(JOIN_URL, {"code": self.code})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_a_user_who_already_belongs_to_another_couple(self):
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")
        self.client.post(CREATE_URL)  # bob creates his own, separate couple

        response = self.client.post(JOIN_URL, {"code": self.code})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CancelPendingPairingViewTests(APITestCase):
    def setUp(self):
        self.creator = make_user("alice")
        self.client.login(username="alice", password="a-strong-password-1")
        create_response = self.client.post(CREATE_URL)
        self.code = create_response.data["invite"]["code"]

    def test_requires_authentication(self):
        self.client.logout()

        response = self.client.post(CANCEL_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancelling_returns_the_creator_to_a_none_status(self):
        response = self.client.post(CANCEL_URL)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        status_response = self.client.get(STATUS_URL)
        self.assertEqual(status_response.data["status"], "none")

    def test_the_old_code_is_rejected_by_join_after_cancelling(self):
        self.client.post(CANCEL_URL)
        self.client.logout()

        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(JOIN_URL, {"code": self.code})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_cancelling_with_no_pending_pairing(self):
        self.client.logout()
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")

        response = self.client.post(CANCEL_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refuses_to_cancel_an_already_paired_couple(self):
        self.client.logout()
        make_user("bob")
        self.client.login(username="bob", password="a-strong-password-1")
        self.client.post(JOIN_URL, {"code": self.code})
        self.client.logout()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(CANCEL_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Both members must still be paired — nothing was dissolved.
        status_response = self.client.get(STATUS_URL)
        self.assertEqual(status_response.data["status"], "paired")
