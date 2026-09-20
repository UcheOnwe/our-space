from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from couples.services import create_couple_with_invite, join_couple
from uchem import views
from uchem.models import CoupleWallet, PersonalWallet, TransactionReason, UchemTransaction
from uchem.services import DEV_UCHEM_RESTORE_TARGET, credit_couple_wallet, credit_personal_wallet

User = get_user_model()

PERSONAL_URL = "/api/uchem/personal/"
COUPLE_URL = "/api/uchem/couple/"
DEV_RESTORE_URL = "/api/uchem/dev/restore/"
TEST_CODE = "test-code-123"


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


@override_settings(DEBUG=True, DEV_UCHEM_TEST_CODE=TEST_CODE)
class DevRestoreCoupleWalletViewTests(TestCase):
    """Calls DevRestoreCoupleWalletView directly via APIRequestFactory,
    deliberately NOT through self.client/the real URL path.

    Verified directly (not assumed): manage.py test's own runner forces
    settings.DEBUG=False for the ENTIRE test run by default (see
    django.test.runner.DiscoverRunner's debug_mode=False default,
    applied via setup_test_environment() before any test or URLconf
    module loads). uchem/urls.py's `if settings.DEBUG:
    urlpatterns.append(...)` therefore already evaluated to False the
    first time the URLconf was resolved in this process — permanently,
    for the whole test run — and no per-test @override_settings can
    retroactively re-run that module-level conditional without unsafely
    reloading a shared, process-global urls module (risking other test
    classes seeing mutated global routing state). Calling the view
    directly tests exactly what's actually ours to verify — the view's
    own auth/validation/business logic — without depending on that
    already-well-established, trivial Django URL-conditional idiom,
    which isn't meaningfully at risk here.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = views.DevRestoreCoupleWalletView.as_view()
        self.alice = make_user("alice")
        make_user("bob")
        couple, invite = create_couple_with_invite(self.alice)
        self.bob = User.objects.get(username="bob")
        join_couple(invite.code, self.bob)
        self.couple = couple

    def _post(self, data, user=None):
        request = self.factory.post(DEV_RESTORE_URL, data)
        if user is not None:
            force_authenticate(request, user=user)
        response = self.view(request)
        response.render()
        return response

    def test_requires_authentication(self):
        response = self._post({"code": TEST_CODE})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_valid_code_at_zero_restores_to_the_target(self):
        response = self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], DEV_UCHEM_RESTORE_TARGET)

    def test_valid_code_at_a_partial_balance_restores_to_the_target(self):
        credit_couple_wallet(self.couple, 7500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        response = self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(response.data["balance"], DEV_UCHEM_RESTORE_TARGET)

    def test_valid_code_at_the_target_remains_unchanged(self):
        credit_couple_wallet(self.couple, DEV_UCHEM_RESTORE_TARGET, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        response = self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(response.data["balance"], DEV_UCHEM_RESTORE_TARGET)

    def test_valid_code_above_the_target_is_unchanged(self):
        credit_couple_wallet(self.couple, DEV_UCHEM_RESTORE_TARGET + 500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        response = self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(response.data["balance"], DEV_UCHEM_RESTORE_TARGET + 500)

    def test_invalid_code_credits_nothing(self):
        response = self._post({"code": "wrong-code"}, user=self.alice)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CoupleWallet.objects.filter(couple=self.couple).exists())
        self.assertFalse(UchemTransaction.objects.filter(reason=TransactionReason.DEV_TEST_CREDIT).exists())

    def test_missing_code_credits_nothing(self):
        response = self._post({}, user=self.alice)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CoupleWallet.objects.filter(couple=self.couple).exists())

    def test_unpaired_user_gets_no_couple_wallet_credit(self):
        solo = make_user("solo")

        response = self._post({"code": TEST_CODE}, user=solo)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_personal_wallets_remain_unchanged(self):
        credit_personal_wallet(self.alice, 1500, TransactionReason.WELCOME_REWARD, "a-seed")
        credit_personal_wallet(self.bob, 1000, TransactionReason.WELCOME_REWARD, "b-seed")

        self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(PersonalWallet.objects.get(user=self.alice).balance, 1500)
        self.assertEqual(PersonalWallet.objects.get(user=self.bob).balance, 1000)

    def test_client_supplied_amount_is_ignored(self):
        # There is no "amount" field on this endpoint's contract at all —
        # sending one has zero effect; the server always computes the
        # shortfall itself.
        response = self._post({"code": TEST_CODE, "amount": 999999}, user=self.alice)

        self.assertEqual(response.data["balance"], DEV_UCHEM_RESTORE_TARGET)

    @override_settings(DEBUG=False)
    def test_returns_404_when_debug_is_false(self):
        # The view's OWN defensive runtime check — the second layer
        # behind urls.py's conditional registration (see
        # DevRestoreCoupleWalletView's own doc comment) — is what this
        # actually exercises, correctly, since it's a plain per-request
        # settings.DEBUG read, not import-time-cached like urls.py's own
        # conditional (see this class's own doc comment).
        response = self._post({"code": TEST_CODE}, user=self.alice)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(CoupleWallet.objects.filter(couple=self.couple).exists())
