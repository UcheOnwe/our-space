import threading

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection
from django.test import TestCase, TransactionTestCase

from couples.services import create_couple_with_invite, join_couple
from uchem.models import CoupleWallet, PersonalWallet, TransactionReason, UchemTransaction
from uchem.services import (
    DEV_UCHEM_RESTORE_TARGET,
    InsufficientUchemError,
    credit_couple_wallet,
    credit_personal_wallet,
    debit_couple_wallet,
    debit_personal_wallet,
    get_or_create_couple_wallet,
    get_or_create_personal_wallet,
    restore_couple_wallet_for_development,
)

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


def make_paired_couple(username_a="alice", username_b="bob"):
    user_a = make_user(username_a)
    user_b = make_user(username_b)
    couple, invite = create_couple_with_invite(user_a)
    join_couple(invite.code, user_b)
    return user_a, user_b, couple


class GetOrCreatePersonalWalletTests(TestCase):
    def test_creates_a_zero_balance_wallet_on_first_access(self):
        user = make_user()

        wallet = get_or_create_personal_wallet(user)

        self.assertEqual(wallet.balance, 0)

    def test_does_not_create_a_second_row_on_repeated_access(self):
        user = make_user()

        get_or_create_personal_wallet(user)
        get_or_create_personal_wallet(user)

        self.assertEqual(PersonalWallet.objects.filter(user=user).count(), 1)


class GetOrCreateCoupleWalletTests(TestCase):
    def test_creates_a_zero_balance_wallet_on_first_access(self):
        _, _, couple = make_paired_couple()

        wallet = get_or_create_couple_wallet(couple)

        self.assertEqual(wallet.balance, 0)

    def test_does_not_create_a_second_row_on_repeated_access(self):
        _, _, couple = make_paired_couple()

        get_or_create_couple_wallet(couple)
        get_or_create_couple_wallet(couple)

        self.assertEqual(CoupleWallet.objects.filter(couple=couple).count(), 1)


class CreditPersonalWalletTests(TestCase):
    def test_increases_the_balance(self):
        user = make_user()

        wallet = credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "credit-1")

        self.assertEqual(wallet.balance, 100)

    def test_creates_a_matching_ledger_entry(self):
        user = make_user()

        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "credit-1")

        entry = UchemTransaction.objects.get(idempotency_key="credit-1")
        self.assertEqual(entry.personal_wallet.user, user)
        self.assertIsNone(entry.couple_wallet)
        self.assertEqual(entry.amount, 100)
        self.assertEqual(entry.reason, TransactionReason.WELCOME_REWARD)
        self.assertEqual(entry.balance_after, 100)

    def test_rejects_a_zero_amount(self):
        user = make_user()

        with self.assertRaises(ValueError):
            credit_personal_wallet(user, 0, TransactionReason.WELCOME_REWARD, "credit-1")
        self.assertFalse(UchemTransaction.objects.exists())

    def test_rejects_a_negative_amount(self):
        user = make_user()

        with self.assertRaises(ValueError):
            credit_personal_wallet(user, -50, TransactionReason.WELCOME_REWARD, "credit-1")


class DebitPersonalWalletTests(TestCase):
    def test_decreases_the_balance(self):
        user = make_user()
        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "credit-1")

        wallet = debit_personal_wallet(user, 40, TransactionReason.COSMETIC_PURCHASE, "debit-1")

        self.assertEqual(wallet.balance, 60)

    def test_creates_a_matching_ledger_entry_with_a_negative_amount(self):
        user = make_user()
        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "credit-1")

        debit_personal_wallet(user, 40, TransactionReason.COSMETIC_PURCHASE, "debit-1")

        entry = UchemTransaction.objects.get(idempotency_key="debit-1")
        self.assertEqual(entry.amount, -40)
        self.assertEqual(entry.balance_after, 60)

    def test_insufficient_balance_raises_and_changes_nothing(self):
        user = make_user()
        credit_personal_wallet(user, 10, TransactionReason.WELCOME_REWARD, "credit-1")

        with self.assertRaises(InsufficientUchemError):
            debit_personal_wallet(user, 50, TransactionReason.COSMETIC_PURCHASE, "debit-1")

        wallet = PersonalWallet.objects.get(user=user)
        self.assertEqual(wallet.balance, 10)
        self.assertFalse(UchemTransaction.objects.filter(idempotency_key="debit-1").exists())

    def test_cannot_drive_the_balance_negative(self):
        user = make_user()
        get_or_create_personal_wallet(user)  # a real 0-balance wallet, not an implicit one

        with self.assertRaises(InsufficientUchemError):
            debit_personal_wallet(user, 1, TransactionReason.COSMETIC_PURCHASE, "debit-1")

        wallet = PersonalWallet.objects.get(user=user)
        self.assertEqual(wallet.balance, 0)

    def test_a_failed_debit_does_not_even_leave_behind_an_implicitly_created_wallet(self):
        # debit_personal_wallet's own get_or_create runs INSIDE the same
        # atomic() block as the balance check — proving a raised
        # InsufficientUchemError rolls back that implicit creation too,
        # not just the balance/ledger write, i.e. the whole operation is
        # genuinely all-or-nothing.
        user = make_user()

        with self.assertRaises(InsufficientUchemError):
            debit_personal_wallet(user, 1, TransactionReason.COSMETIC_PURCHASE, "debit-1")

        self.assertFalse(PersonalWallet.objects.filter(user=user).exists())


class CreditCoupleWalletTests(TestCase):
    def test_increases_the_balance(self):
        _, _, couple = make_paired_couple()

        wallet = credit_couple_wallet(couple, 500, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit-1")

        self.assertEqual(wallet.balance, 500)

    def test_creates_a_matching_ledger_entry(self):
        _, _, couple = make_paired_couple()

        credit_couple_wallet(couple, 500, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit-1")

        entry = UchemTransaction.objects.get(idempotency_key="couple-credit-1")
        self.assertEqual(entry.couple_wallet.couple, couple)
        self.assertIsNone(entry.personal_wallet)
        self.assertEqual(entry.amount, 500)


class DebitCoupleWalletTests(TestCase):
    def test_decreases_the_balance(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 500, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit-1")

        wallet = debit_couple_wallet(couple, 200, TransactionReason.ROOM_PURCHASE, "couple-debit-1")

        self.assertEqual(wallet.balance, 300)

    def test_insufficient_balance_raises_and_changes_nothing(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 100, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit-1")

        with self.assertRaises(InsufficientUchemError):
            debit_couple_wallet(couple, 200, TransactionReason.ROOM_PURCHASE, "couple-debit-1")

        wallet = CoupleWallet.objects.get(couple=couple)
        self.assertEqual(wallet.balance, 100)
        self.assertFalse(UchemTransaction.objects.filter(idempotency_key="couple-debit-1").exists())


class TransactionOwnershipConstraintTests(TestCase):
    def test_a_personal_credit_belongs_to_exactly_the_personal_wallet(self):
        user = make_user()

        credit_personal_wallet(user, 10, TransactionReason.WELCOME_REWARD, "k1")

        entry = UchemTransaction.objects.get(idempotency_key="k1")
        self.assertIsNotNone(entry.personal_wallet)
        self.assertIsNone(entry.couple_wallet)

    def test_the_database_rejects_a_transaction_with_neither_owner(self):
        with self.assertRaises(IntegrityError):
            UchemTransaction.objects.create(
                amount=10, reason=TransactionReason.WELCOME_REWARD, idempotency_key="neither", balance_after=10
            )

    def test_the_database_rejects_a_transaction_with_both_owners(self):
        user = make_user()
        personal_wallet = get_or_create_personal_wallet(user)
        _, _, couple = make_paired_couple("carol", "dave")
        couple_wallet = get_or_create_couple_wallet(couple)

        with self.assertRaises(IntegrityError):
            UchemTransaction.objects.create(
                personal_wallet=personal_wallet,
                couple_wallet=couple_wallet,
                amount=10,
                reason=TransactionReason.WELCOME_REWARD,
                idempotency_key="both",
                balance_after=10,
            )

    def test_the_database_rejects_a_zero_amount_transaction(self):
        user = make_user()
        personal_wallet = get_or_create_personal_wallet(user)

        with self.assertRaises(IntegrityError):
            UchemTransaction.objects.create(
                personal_wallet=personal_wallet,
                amount=0,
                reason=TransactionReason.WELCOME_REWARD,
                idempotency_key="zero",
                balance_after=0,
            )


class IdempotencyTests(TestCase):
    def test_a_repeated_credit_with_the_same_key_only_applies_once(self):
        user = make_user()

        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "room-purchase-ABC123")
        wallet = credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "room-purchase-ABC123")

        self.assertEqual(wallet.balance, 100)
        self.assertEqual(UchemTransaction.objects.filter(idempotency_key="room-purchase-ABC123").count(), 1)

    def test_a_repeated_debit_with_the_same_key_only_applies_once(self):
        user = make_user()
        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "credit-1")

        debit_personal_wallet(user, 40, TransactionReason.COSMETIC_PURCHASE, "purchase-XYZ")
        wallet = debit_personal_wallet(user, 40, TransactionReason.COSMETIC_PURCHASE, "purchase-XYZ")

        self.assertEqual(wallet.balance, 60)
        self.assertEqual(UchemTransaction.objects.filter(idempotency_key="purchase-XYZ").count(), 1)

    def test_reusing_a_key_sequentially_across_two_different_wallets_is_a_no_op(self):
        # A caller bug (or retry) reusing one idempotency_key for two
        # DIFFERENT wallets isn't something the per-wallet row lock can
        # serialize (different rows, different locks) — but called
        # sequentially, the second call's own pre-check (layer 1) already
        # finds the first call's committed row and returns as a no-op
        # before ever touching the database's unique constraint.
        user_a = make_user("alice")
        user_b = make_user("bob")
        credit_personal_wallet(user_a, 50, TransactionReason.WELCOME_REWARD, "shared-key")

        wallet_b = credit_personal_wallet(user_b, 50, TransactionReason.WELCOME_REWARD, "shared-key")

        # The first, legitimate operation is completely untouched.
        self.assertEqual(PersonalWallet.objects.get(user=user_a).balance, 50)
        # The second wallet never received Uchem it didn't earn.
        self.assertEqual(wallet_b.balance, 0)
        self.assertEqual(UchemTransaction.objects.filter(idempotency_key="shared-key").count(), 1)


class WalletIsolationTests(TestCase):
    def test_couple_wallet_spending_does_not_alter_either_personal_wallet(self):
        user_a, user_b, couple = make_paired_couple()
        credit_personal_wallet(user_a, 1500, TransactionReason.WELCOME_REWARD, "a-credit")
        credit_personal_wallet(user_b, 1000, TransactionReason.WELCOME_REWARD, "b-credit")
        credit_couple_wallet(couple, 2500, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit")

        debit_couple_wallet(couple, 2500, TransactionReason.ROOM_PURCHASE, "room-purchase-1")

        self.assertEqual(PersonalWallet.objects.get(user=user_a).balance, 1500)
        self.assertEqual(PersonalWallet.objects.get(user=user_b).balance, 1000)
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 0)

    def test_personal_wallet_spending_does_not_alter_couple_wallet_or_partner_wallet(self):
        user_a, user_b, couple = make_paired_couple()
        credit_personal_wallet(user_a, 1500, TransactionReason.WELCOME_REWARD, "a-credit")
        credit_personal_wallet(user_b, 1000, TransactionReason.WELCOME_REWARD, "b-credit")
        credit_couple_wallet(couple, 2500, TransactionReason.COUPLE_CONTRIBUTION, "couple-credit")

        debit_personal_wallet(user_a, 300, TransactionReason.COSMETIC_PURCHASE, "a-purchase")

        self.assertEqual(PersonalWallet.objects.get(user=user_a).balance, 1200)
        self.assertEqual(PersonalWallet.objects.get(user=user_b).balance, 1000)
        self.assertEqual(CoupleWallet.objects.get(couple=couple).balance, 2500)


class PersonalWalletConcurrencyTests(TransactionTestCase):
    """Exercises the select_for_update row lock under real concurrent
    requests — same approach as couples.tests.test_services's
    JoinCoupleConcurrencyTests (real threads, TransactionTestCase so each
    gets its own DB connection instead of sharing one rolled-back
    transaction)."""

    def test_two_concurrent_debits_cannot_together_overdraw_the_wallet(self):
        user = make_user()
        credit_personal_wallet(user, 100, TransactionReason.WELCOME_REWARD, "seed")

        barrier = threading.Barrier(2)
        results = {}

        def attempt(key):
            barrier.wait()
            try:
                debit_personal_wallet(user, 80, TransactionReason.COSMETIC_PURCHASE, key)
                results[key] = "success"
            except InsufficientUchemError:
                results[key] = "failure"
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt, args=("spend-1",))
        t2 = threading.Thread(target=attempt, args=("spend-2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(sorted(results.values()), ["failure", "success"])
        wallet = PersonalWallet.objects.get(user=user)
        self.assertEqual(wallet.balance, 20)
        self.assertGreaterEqual(wallet.balance, 0)

    def test_two_concurrent_identical_duplicate_requests_apply_only_once(self):
        user = make_user()

        barrier = threading.Barrier(2)

        def attempt():
            barrier.wait()
            try:
                credit_personal_wallet(user, 50, TransactionReason.WELCOME_REWARD, "duplicate-key")
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt)
        t2 = threading.Thread(target=attempt)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        wallet = PersonalWallet.objects.get(user=user)
        self.assertEqual(wallet.balance, 50)
        self.assertEqual(UchemTransaction.objects.filter(idempotency_key="duplicate-key").count(), 1)

    def test_concurrent_reuse_of_a_key_across_two_different_wallets_applies_exactly_once(self):
        # The scenario the database's unique constraint (not the row lock)
        # is actually for: two DIFFERENT wallets, so no shared lock
        # serializes them, racing to apply the SAME idempotency_key at
        # once. Whichever INSERT wins is not something the service
        # dictates — but exactly one of the two must end up applied, the
        # loser's own balance/ledger write must be cleanly rolled back
        # (not the winner's), and no exception should escape to the caller.
        user_a = make_user("alice")
        user_b = make_user("bob")

        barrier = threading.Barrier(2)

        def attempt(user):
            barrier.wait()
            try:
                credit_personal_wallet(user, 50, TransactionReason.WELCOME_REWARD, "cross-wallet-shared-key")
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt, args=(user_a,))
        t2 = threading.Thread(target=attempt, args=(user_b,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        balance_a = PersonalWallet.objects.get(user=user_a).balance
        balance_b = PersonalWallet.objects.get(user=user_b).balance
        # Exactly one of the two wallets actually received the credit.
        self.assertEqual(sorted([balance_a, balance_b]), [0, 50])
        self.assertEqual(UchemTransaction.objects.filter(idempotency_key="cross-wallet-shared-key").count(), 1)


class RestoreCoupleWalletForDevelopmentTests(TestCase):
    def test_restores_a_zero_balance_to_the_target(self):
        _, _, couple = make_paired_couple()

        wallet = restore_couple_wallet_for_development(couple)

        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)

    def test_credits_only_the_shortfall_from_a_partial_balance(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 7500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        wallet = restore_couple_wallet_for_development(couple)

        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)
        entry = UchemTransaction.objects.get(reason=TransactionReason.DEV_TEST_CREDIT)
        self.assertEqual(entry.amount, 2500)

    def test_a_balance_already_at_the_target_is_untouched(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, DEV_UCHEM_RESTORE_TARGET, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        wallet = restore_couple_wallet_for_development(couple)

        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)
        # No dev-credit ledger row at all — a genuine no-op, not a zero-amount credit.
        self.assertFalse(UchemTransaction.objects.filter(reason=TransactionReason.DEV_TEST_CREDIT).exists())

    def test_a_balance_above_the_target_is_untouched(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, DEV_UCHEM_RESTORE_TARGET + 500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        wallet = restore_couple_wallet_for_development(couple)

        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET + 500)
        self.assertFalse(UchemTransaction.objects.filter(reason=TransactionReason.DEV_TEST_CREDIT).exists())

    def test_never_touches_either_partners_personal_wallet(self):
        user_a, user_b, couple = make_paired_couple()
        credit_personal_wallet(user_a, 1500, TransactionReason.WELCOME_REWARD, "a-seed")
        credit_personal_wallet(user_b, 1000, TransactionReason.WELCOME_REWARD, "b-seed")

        restore_couple_wallet_for_development(couple)

        self.assertEqual(PersonalWallet.objects.get(user=user_a).balance, 1500)
        self.assertEqual(PersonalWallet.objects.get(user=user_b).balance, 1000)

    def test_is_repeatable_across_separate_restores(self):
        # The whole point: restoring, spending back down, and restoring
        # again must work every time — no permanent idempotency key blocks
        # a later, genuinely separate restore.
        _, _, couple = make_paired_couple()

        restore_couple_wallet_for_development(couple)
        debit_couple_wallet(couple, 2500, TransactionReason.ROOM_PURCHASE, "spend-1")
        wallet = restore_couple_wallet_for_development(couple)

        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)
        self.assertEqual(UchemTransaction.objects.filter(reason=TransactionReason.DEV_TEST_CREDIT).count(), 2)


class RestoreCoupleWalletForDevelopmentConcurrencyTests(TransactionTestCase):
    """Proves the wallet lock + shortfall check — not any timing/bucketing
    — is what prevents two simultaneous restores from overshooting the
    target, mirroring the exact concurrency-proof pattern already used
    throughout this app (e.g. PersonalWalletConcurrencyTests above)."""

    def test_two_concurrent_restores_never_exceed_the_target(self):
        _, _, couple = make_paired_couple()
        credit_couple_wallet(couple, 7500, TransactionReason.COUPLE_CONTRIBUTION, "seed")

        barrier = threading.Barrier(2)

        def attempt():
            barrier.wait()
            try:
                restore_couple_wallet_for_development(couple)
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt)
        t2 = threading.Thread(target=attempt)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        wallet = CoupleWallet.objects.get(couple=couple)
        self.assertEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)
        self.assertLessEqual(wallet.balance, DEV_UCHEM_RESTORE_TARGET)
        # Exactly one credit was actually applied — the second request's
        # own shortfall check found nothing left to do.
        self.assertEqual(UchemTransaction.objects.filter(reason=TransactionReason.DEV_TEST_CREDIT).count(), 1)
