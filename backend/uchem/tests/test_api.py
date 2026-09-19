from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from couples.services import create_couple_with_invite, join_couple
from uchem.models import PersonalWallet, TransactionReason
from uchem.services import credit_couple_wallet, credit_personal_wallet

User = get_user_model()

PERSONAL_URL = "/api/uchem/personal/"
COUPLE_URL = "/api/uchem/couple/"


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


class PersonalWalletViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get(PERSONAL_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_lazily_creates_a_zero_balance_wallet(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(PERSONAL_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], 0)

    def test_get_does_not_create_a_second_row_on_repeated_calls(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        self.client.get(PERSONAL_URL)
        self.client.get(PERSONAL_URL)

        self.assertEqual(PersonalWallet.objects.count(), 1)

    def test_reflects_the_authoritative_balance(self):
        user = make_user()
        credit_personal_wallet(user, 250, TransactionReason.WELCOME_REWARD, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(PERSONAL_URL)

        self.assertEqual(response.data["balance"], 250)

    def test_never_returns_the_partners_personal_wallet(self):
        alice = make_user("alice")
        make_user("bob")
        couple, invite = create_couple_with_invite(alice)
        bob = User.objects.get(username="bob")
        join_couple(invite.code, bob)
        credit_personal_wallet(bob, 9999, TransactionReason.WELCOME_REWARD, "bob-seed")

        self.client.login(username="alice", password="a-strong-password-1")
        response = self.client.get(PERSONAL_URL)

        # alice's own wallet, unaffected by bob's balance, and nothing in
        # this response shape can even express "someone else's wallet".
        self.assertEqual(response.data["balance"], 0)


class CoupleWalletViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get(COUPLE_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unpaired_user_cannot_access_a_couple_wallet(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(COUPLE_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_paired_user_gets_their_couples_wallet(self):
        alice = make_user("alice")
        make_user("bob")
        couple, invite = create_couple_with_invite(alice)
        bob = User.objects.get(username="bob")
        join_couple(invite.code, bob)
        credit_couple_wallet(couple, 2500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        self.client.login(username="alice", password="a-strong-password-1")
        response = self.client.get(COUPLE_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], 2500)

    def test_both_partners_see_the_identical_couple_balance(self):
        alice = make_user("alice")
        make_user("bob")
        couple, invite = create_couple_with_invite(alice)
        bob = User.objects.get(username="bob")
        join_couple(invite.code, bob)
        credit_couple_wallet(couple, 2500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        self.client.login(username="alice", password="a-strong-password-1")
        alice_response = self.client.get(COUPLE_URL)
        self.client.logout()

        self.client.login(username="bob", password="a-strong-password-1")
        bob_response = self.client.get(COUPLE_URL)

        self.assertEqual(alice_response.data["balance"], bob_response.data["balance"])
        self.assertEqual(bob_response.data["balance"], 2500)

    def test_a_user_cannot_access_an_unrelated_couples_wallet(self):
        # No id/couple parameter exists on this endpoint at all — this
        # proves the isolation holds in practice, not just by inspection:
        # an unrelated, fully-funded couple's balance never leaks into a
        # different couple's response.
        alice = make_user("alice")
        make_user("bob")
        couple_ab, invite_ab = create_couple_with_invite(alice)
        bob = User.objects.get(username="bob")
        join_couple(invite_ab.code, bob)
        credit_couple_wallet(couple_ab, 777, TransactionReason.COUPLE_CONTRIBUTION, "ab-seed")

        carol = make_user("carol")
        make_user("dave")
        couple_cd, invite_cd = create_couple_with_invite(carol)
        dave = User.objects.get(username="dave")
        join_couple(invite_cd.code, dave)
        credit_couple_wallet(couple_cd, 111, TransactionReason.COUPLE_CONTRIBUTION, "cd-seed")

        self.client.login(username="carol", password="a-strong-password-1")
        response = self.client.get(COUPLE_URL)

        self.assertEqual(response.data["balance"], 111)
