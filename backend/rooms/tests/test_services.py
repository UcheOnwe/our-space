import threading

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, TransactionTestCase

from couples.services import create_couple_with_invite, join_couple
from rooms import catalog
from rooms.models import CoupleActiveRoom, CoupleRoomOwnership, RoomType
from rooms.services import (
    RoomPurchaseError,
    get_or_create_active_room,
    get_owned_room_types,
    purchase_room,
    select_active_room,
)
from uchem.models import CoupleWallet, PersonalWallet, TransactionReason, UchemTransaction
from uchem.services import InsufficientUchemError, credit_couple_wallet, credit_personal_wallet

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(username_a="alice", username_b="bob"):
    user_a = make_user(username_a)
    user_b = make_user(username_b)
    couple, invite = create_couple_with_invite(user_a)
    join_couple(invite.code, user_b)
    return user_a, user_b, couple


class CatalogTests(TestCase):
    def test_price_for_cozy_loft_is_2500(self):
        self.assertEqual(catalog.price_for(RoomType.COZY_LOFT), 2500)

    def test_price_for_couple_home_is_zero(self):
        self.assertEqual(catalog.price_for(RoomType.COUPLE_HOME), 0)

    def test_price_for_after_hours_is_5000(self):
        self.assertEqual(catalog.price_for(RoomType.AFTER_HOURS), 5000)

    def test_couple_home_display_name_is_lauruch_loft(self):
        # User-facing rename only — room_type stays "couple_home".
        entry = next(e for e in catalog.get_catalog() if e.room_type == RoomType.COUPLE_HOME)
        self.assertEqual(entry.display_name, "Lauruch Loft")

    def test_catalog_order_is_stable_and_sequential(self):
        entries = catalog.get_catalog()
        orders = [entry.order for entry in entries]
        self.assertEqual(orders, sorted(orders))
        self.assertEqual(len(orders), len(set(orders)))


class DefaultOwnershipTests(TestCase):
    def test_a_fresh_couple_owns_only_couple_home(self):
        _, _, couple = make_paired_couple()

        owned = get_owned_room_types(couple)

        self.assertEqual(owned, {RoomType.COUPLE_HOME})
        self.assertEqual(CoupleRoomOwnership.objects.filter(couple=couple).count(), 0)

    def test_couple_home_ownership_is_never_backed_by_a_row(self):
        # Confirms the "no fragile duplicate data" design: default
        # ownership survives even with zero CoupleRoomOwnership rows.
        _, _, couple = make_paired_couple()

        self.assertIn(RoomType.COUPLE_HOME, get_owned_room_types(couple))
        self.assertFalse(
            CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.COUPLE_HOME).exists()
        )

    def test_active_room_defaults_to_couple_home(self):
        _, _, couple = make_paired_couple()

        active = get_or_create_active_room(couple)

        self.assertEqual(active.room_type, RoomType.COUPLE_HOME)

    def test_getting_the_active_room_does_not_create_a_second_row(self):
        _, _, couple = make_paired_couple()

        get_or_create_active_room(couple)
        get_or_create_active_room(couple)

        self.assertEqual(CoupleActiveRoom.objects.filter(couple=couple).count(), 1)


class PurchaseRoomTests(TestCase):
    def test_purchase_debits_exactly_the_catalog_price_from_the_couple_wallet(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)

    def test_purchase_creates_exactly_one_room_purchase_ledger_entry(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.COZY_LOFT)

        entries = UchemTransaction.objects.filter(reason="room_purchase")
        self.assertEqual(entries.count(), 1)
        entry = entries.first()
        self.assertEqual(entry.amount, -2500)
        self.assertEqual(entry.couple_wallet.couple, couple)
        self.assertIsNone(entry.personal_wallet)

    def test_purchase_creates_exactly_one_ownership_row(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(
            CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.COZY_LOFT).count(), 1
        )
        self.assertIn(RoomType.COZY_LOFT, get_owned_room_types(couple))

    def test_purchase_makes_the_room_active(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COZY_LOFT)

    def test_purchase_does_not_alter_either_personal_wallet(self):
        user_a, user_b, couple = make_paired_couple()
        credit_personal_wallet(user_a, 1500, TransactionReason.COUPLE_CONTRIBUTION, "a-seed")
        credit_personal_wallet(user_b, 1000, TransactionReason.COUPLE_CONTRIBUTION, "b-seed")
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "couple-seed")

        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(PersonalWallet.objects.get(user=user_a).balance, 1500)
        self.assertEqual(PersonalWallet.objects.get(user=user_b).balance, 1000)

    def test_insufficient_uchem_raises_and_changes_nothing(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 100, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        with self.assertRaises(InsufficientUchemError):
            purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 100)
        self.assertFalse(CoupleRoomOwnership.objects.filter(couple=couple).exists())
        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COUPLE_HOME)
        self.assertFalse(UchemTransaction.objects.filter(reason="room_purchase").exists())

    def test_purchasing_couple_home_is_rejected(self):
        _, _, couple = make_paired_couple()

        with self.assertRaises(RoomPurchaseError):
            purchase_room(couple, RoomType.COUPLE_HOME)

    def test_repeated_purchase_only_charges_once(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.COZY_LOFT)
        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)
        self.assertEqual(CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.COZY_LOFT).count(), 1)
        self.assertEqual(UchemTransaction.objects.filter(reason="room_purchase").count(), 1)

    def test_repeated_purchase_of_an_owned_room_still_ends_active(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        purchase_room(couple, RoomType.COZY_LOFT)
        select_active_room(couple, RoomType.COUPLE_HOME)

        purchase_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COZY_LOFT)


class PurchaseAfterHoursTests(TestCase):
    """Mirrors PurchaseRoomTests' meaningfully distinct cases for the
    5,000-Uchem After Hours room — purchase_room/select_active_room are
    already fully generic over room_type (see PurchaseRoomTests above for
    the exhaustive Cozy Loft coverage of the shared mechanics), so this
    only re-checks the parts that actually differ: the price itself and
    that the same idempotency/insufficient-balance guarantees hold."""

    def test_purchase_debits_exactly_5000_and_creates_ownership(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.AFTER_HOURS)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 0)
        self.assertEqual(
            CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.AFTER_HOURS).count(), 1
        )
        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.AFTER_HOURS)

    def test_insufficient_uchem_for_after_hours_raises_and_changes_nothing(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 4999, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        with self.assertRaises(InsufficientUchemError):
            purchase_room(couple, RoomType.AFTER_HOURS)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 4999)
        self.assertFalse(CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.AFTER_HOURS).exists())

    def test_repeated_after_hours_purchase_only_charges_once(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        purchase_room(couple, RoomType.AFTER_HOURS)
        purchase_room(couple, RoomType.AFTER_HOURS)

        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 0)
        self.assertEqual(
            CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.AFTER_HOURS).count(), 1
        )

    def test_cozy_loft_price_is_unaffected_by_after_hours(self):
        self.assertEqual(catalog.price_for(RoomType.COZY_LOFT), 2500)


class SelectActiveRoomTests(TestCase):
    def test_selecting_an_unowned_room_raises(self):
        _, _, couple = make_paired_couple()

        with self.assertRaises(RoomPurchaseError):
            select_active_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COUPLE_HOME)

    def test_selecting_an_owned_room_succeeds(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")
        purchase_room(couple, RoomType.COZY_LOFT)
        select_active_room(couple, RoomType.COUPLE_HOME)

        select_active_room(couple, RoomType.COZY_LOFT)

        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COZY_LOFT)

    def test_reselecting_the_already_active_room_is_a_harmless_no_op(self):
        _, _, couple = make_paired_couple()

        select_active_room(couple, RoomType.COUPLE_HOME)
        select_active_room(couple, RoomType.COUPLE_HOME)

        self.assertEqual(CoupleActiveRoom.objects.filter(couple=couple).count(), 1)
        self.assertEqual(get_or_create_active_room(couple).room_type, RoomType.COUPLE_HOME)


class PurchaseRoomConcurrencyTests(TransactionTestCase):
    """Exercises the two-layer duplicate-purchase protection under real
    concurrent requests — same approach as uchem's own concurrency tests
    (real threads, TransactionTestCase for independent DB connections)."""

    def test_two_concurrent_purchases_of_the_same_room_only_charge_once(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 5000, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        barrier = threading.Barrier(2)
        errors = []

        def attempt():
            barrier.wait()
            try:
                purchase_room(couple, RoomType.COZY_LOFT)
            except Exception as exc:  # noqa: BLE001 — captured for the assertion below, not swallowed silently
                errors.append(exc)
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt)
        t2 = threading.Thread(target=attempt)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(errors, [])
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)
        self.assertEqual(CoupleRoomOwnership.objects.filter(couple=couple, room_type=RoomType.COZY_LOFT).count(), 1)
        self.assertEqual(UchemTransaction.objects.filter(reason="room_purchase").count(), 1)
        self.assertEqual(CoupleActiveRoom.objects.get(couple=couple).room_type, RoomType.COZY_LOFT)
