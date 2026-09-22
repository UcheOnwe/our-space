from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from couples.services import create_couple_with_invite, join_couple
from uchem.models import CoupleWallet, PersonalWallet, TransactionReason
from uchem.services import credit_couple_wallet, get_or_create_personal_wallet

User = get_user_model()

GALLERY_URL = "/api/rooms/gallery/"
PURCHASE_URL = "/api/rooms/purchase/"
SELECT_ACTIVE_URL = "/api/rooms/select-active/"


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(username_a="alice", username_b="bob"):
    user_a = make_user(username_a)
    user_b = make_user(username_b)
    couple, invite = create_couple_with_invite(user_a)
    user_b_obj = User.objects.get(username=username_b)
    join_couple(invite.code, user_b_obj)
    return user_a, user_b_obj, couple


def find_room(gallery_data, room_type):
    return next(item for item in gallery_data if item["room_type"] == room_type)


class RoomGalleryViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get(GALLERY_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unpaired_user_gets_400(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(GALLERY_URL)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_default_gallery_shows_couple_home_owned_and_active_cozy_loft_locked(self):
        make_paired_couple()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(GALLERY_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        couple_home = find_room(response.data, "couple_home")
        cozy_loft = find_room(response.data, "cozy_loft")
        self.assertTrue(couple_home["is_owned"])
        self.assertTrue(couple_home["is_active"])
        self.assertEqual(couple_home["price"], 0)
        self.assertEqual(couple_home["display_name"], "Lauruch Loft")
        self.assertFalse(cozy_loft["is_owned"])
        self.assertFalse(cozy_loft["is_active"])
        self.assertEqual(cozy_loft["price"], 2500)

    def test_default_gallery_shows_after_hours_locked_at_5000(self):
        make_paired_couple()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(GALLERY_URL)

        after_hours = find_room(response.data, "after_hours")
        self.assertEqual(after_hours["display_name"], "After Hours")
        self.assertFalse(after_hours["is_owned"])
        self.assertFalse(after_hours["is_active"])
        self.assertEqual(after_hours["price"], 5000)

    def test_gallery_is_ordered_by_the_catalogs_order_field(self):
        make_paired_couple()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get(GALLERY_URL)

        orders = [item["order"] for item in response.data]
        self.assertEqual(orders, sorted(orders))

    def test_both_partners_see_identical_gallery_state(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})
        self.client.logout()

        self.client.login(username="bob", password="a-strong-password-1")
        response = self.client.get(GALLERY_URL)

        cozy_loft = find_room(response.data, "cozy_loft")
        self.assertTrue(cozy_loft["is_owned"])
        self.assertTrue(cozy_loft["is_active"])


class PurchaseRoomViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unpaired_user_gets_400(self):
        make_user()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_successful_purchase_returns_the_updated_gallery(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cozy_loft = find_room(response.data, "cozy_loft")
        self.assertTrue(cozy_loft["is_owned"])
        self.assertTrue(cozy_loft["is_active"])

    def test_insufficient_uchem_returns_400_and_changes_nothing(self):
        alice, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 100, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 100)

    def test_purchase_does_not_change_either_partners_personal_wallet(self):
        alice, bob, couple = make_paired_couple()
        # Real, existing 0-balance wallets — not just "no row at all" —
        # so this proves the balance itself stays untouched, not merely
        # that nothing happened to create one.
        get_or_create_personal_wallet(alice)
        get_or_create_personal_wallet(bob)
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(PersonalWallet.objects.get(user=alice).balance, 0)
        self.assertEqual(PersonalWallet.objects.get(user=bob).balance, 0)

    def test_client_supplied_price_field_is_ignored(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "cozy_loft", "price": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The real catalog price (2500) was charged regardless of the
        # bogus client-supplied "price": 1 above.
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)

    def test_repeated_purchase_via_the_api_only_charges_once(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})
        self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)


class PurchaseAfterHoursViewTests(APITestCase):
    """Mirrors PurchaseRoomViewTests' distinct cases for the 5,000-Uchem
    After Hours room via the same generic purchase endpoint."""

    def test_successful_purchase_returns_the_updated_gallery(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "after_hours"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after_hours = find_room(response.data, "after_hours")
        self.assertTrue(after_hours["is_owned"])
        self.assertTrue(after_hours["is_active"])
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 0)

    def test_insufficient_uchem_returns_400_and_changes_nothing(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 4999, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(PURCHASE_URL, {"room_type": "after_hours"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 4999)

    def test_repeated_purchase_via_the_api_only_charges_once(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")

        self.client.post(PURCHASE_URL, {"room_type": "after_hours"})
        self.client.post(PURCHASE_URL, {"room_type": "after_hours"})

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 0)


class SelectActiveRoomViewTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.post(SELECT_ACTIVE_URL, {"room_type": "couple_home"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_selecting_an_unowned_room_returns_400(self):
        make_paired_couple()
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post(SELECT_ACTIVE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_selecting_an_owned_room_returns_the_updated_gallery(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        self.client.login(username="alice", password="a-strong-password-1")
        self.client.post(PURCHASE_URL, {"room_type": "cozy_loft"})
        self.client.post(SELECT_ACTIVE_URL, {"room_type": "couple_home"})

        response = self.client.post(SELECT_ACTIVE_URL, {"room_type": "cozy_loft"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(find_room(response.data, "cozy_loft")["is_active"])
        self.assertFalse(find_room(response.data, "couple_home")["is_active"])
