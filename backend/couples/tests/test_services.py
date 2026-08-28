import threading

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, TransactionTestCase

from couples.models import Couple, CoupleMembership, PairingInvite
from couples.services import (
    INVITE_CODE_ALPHABET,
    PairingError,
    cancel_pending_pairing,
    create_couple_with_invite,
    join_couple,
)

User = get_user_model()


def make_user(username="alice"):
    return User.objects.create_user(username=username, password="a-strong-password-1")


class CreateCoupleWithInviteTests(TestCase):
    def test_creates_couple_membership_and_invite(self):
        creator = make_user("alice")

        couple, invite = create_couple_with_invite(creator)

        self.assertEqual(CoupleMembership.objects.filter(couple=couple).count(), 1)
        self.assertEqual(CoupleMembership.objects.get(couple=couple).user, creator)
        self.assertEqual(invite.couple, couple)
        self.assertEqual(invite.created_by, creator)
        self.assertEqual(invite.status, PairingInvite.Status.PENDING)

    def test_invite_code_is_six_uppercase_characters_from_the_safe_alphabet(self):
        creator = make_user("alice")

        _, invite = create_couple_with_invite(creator)

        self.assertEqual(len(invite.code), 6)
        self.assertTrue(all(char in INVITE_CODE_ALPHABET for char in invite.code))
        self.assertNotIn("O", invite.code)
        self.assertNotIn("0", invite.code)
        self.assertNotIn("I", invite.code)
        self.assertNotIn("1", invite.code)

    def test_rejects_a_user_who_already_belongs_to_a_couple(self):
        creator = make_user("alice")
        create_couple_with_invite(creator)

        with self.assertRaises(PairingError):
            create_couple_with_invite(creator)


class JoinCoupleTests(TestCase):
    def setUp(self):
        self.creator = make_user("alice")
        self.couple, self.invite = create_couple_with_invite(self.creator)

    def test_joining_creates_the_second_membership_and_accepts_the_invite(self):
        joiner = make_user("bob")

        membership = join_couple(self.invite.code, joiner)

        self.assertEqual(membership.couple, self.couple)
        self.assertEqual(CoupleMembership.objects.filter(couple=self.couple).count(), 2)
        self.invite.refresh_from_db()
        self.assertEqual(self.invite.status, PairingInvite.Status.ACCEPTED)
        self.assertEqual(self.invite.accepted_by, joiner)
        self.assertIsNotNone(self.invite.accepted_at)

    def test_code_entry_is_case_insensitive(self):
        joiner = make_user("bob")

        join_couple(self.invite.code.lower(), joiner)

        self.assertEqual(CoupleMembership.objects.filter(couple=self.couple).count(), 2)

    def test_rejects_an_unknown_code(self):
        joiner = make_user("bob")

        with self.assertRaises(PairingError):
            join_couple("ZZZZZZ", joiner)

    def test_rejects_an_already_used_code(self):
        first_joiner = make_user("bob")
        join_couple(self.invite.code, first_joiner)

        second_joiner = make_user("carol")
        with self.assertRaises(PairingError):
            join_couple(self.invite.code, second_joiner)

    def test_rejects_self_pairing(self):
        with self.assertRaises(PairingError):
            join_couple(self.invite.code, self.creator)

    def test_rejects_a_joiner_who_already_belongs_to_a_couple(self):
        other_creator = make_user("bob")
        _, other_invite = create_couple_with_invite(other_creator)

        joiner = make_user("carol")
        join_couple(other_invite.code, joiner)

        with self.assertRaises(PairingError):
            join_couple(self.invite.code, joiner)

    def test_rejects_joining_a_couple_that_already_has_two_members(self):
        join_couple(self.invite.code, make_user("bob"))

        # A second invite is never issued for a full couple in normal use,
        # but the count check is what actually protects the two-member
        # cap, so it's exercised directly here.
        stale_invite = PairingInvite.objects.create(
            couple=self.couple, created_by=self.creator, code="STALE1"
        )

        with self.assertRaises(PairingError):
            join_couple(stale_invite.code, make_user("carol"))


class CancelPendingPairingTests(TestCase):
    def setUp(self):
        self.creator = make_user("alice")
        self.couple, self.invite = create_couple_with_invite(self.creator)

    def test_cancelling_removes_the_couple_membership_and_invite(self):
        cancel_pending_pairing(self.creator)

        self.assertFalse(CoupleMembership.objects.filter(user=self.creator).exists())
        self.assertFalse(Couple.objects.filter(pk=self.couple.pk).exists())
        self.assertFalse(PairingInvite.objects.filter(pk=self.invite.pk).exists())

    def test_the_old_code_is_no_longer_joinable_after_cancelling(self):
        cancel_pending_pairing(self.creator)

        with self.assertRaises(PairingError):
            join_couple(self.invite.code, make_user("bob"))

    def test_rejects_a_user_with_no_pending_pairing(self):
        with self.assertRaises(PairingError):
            cancel_pending_pairing(make_user("bob"))

    def test_refuses_to_cancel_an_already_paired_couple(self):
        joiner = make_user("bob")
        join_couple(self.invite.code, joiner)

        with self.assertRaises(PairingError):
            cancel_pending_pairing(self.creator)

        # The couple must be untouched — this is the "no dissolve" guarantee.
        self.assertEqual(CoupleMembership.objects.filter(couple=self.couple).count(), 2)
        self.assertTrue(Couple.objects.filter(pk=self.couple.pk).exists())


class CancelPendingPairingConcurrencyTests(TransactionTestCase):
    """Proves cancel and join can't both "win" against the same pending couple."""

    def test_cancel_racing_a_join_resolves_to_exactly_one_outcome(self):
        creator = make_user("alice")
        _, invite = create_couple_with_invite(creator)
        joiner = make_user("bob")

        barrier = threading.Barrier(2)
        results = {}

        def do_cancel():
            barrier.wait()
            try:
                cancel_pending_pairing(creator)
                results["cancel"] = "success"
            except PairingError:
                results["cancel"] = "failure"
            finally:
                connection.close()

        def do_join():
            barrier.wait()
            try:
                join_couple(invite.code, joiner)
                results["join"] = "success"
            except PairingError:
                results["join"] = "failure"
            finally:
                connection.close()

        t1 = threading.Thread(target=do_cancel)
        t2 = threading.Thread(target=do_join)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(sorted(results.values()), ["failure", "success"])

        if results["join"] == "success":
            self.assertEqual(CoupleMembership.objects.filter(couple_id=invite.couple_id).count(), 2)
        else:
            self.assertFalse(CoupleMembership.objects.filter(user=creator).exists())
            self.assertFalse(CoupleMembership.objects.filter(user=joiner).exists())


class JoinCoupleConcurrencyTests(TransactionTestCase):
    """Exercises the select_for_update row lock under real concurrent requests.

    TransactionTestCase (unlike the default TestCase) does not wrap the
    test in a single rolled-back transaction, so two threads here get real,
    independent database connections — close enough to genuine concurrency
    to prove the lock does its job.
    """

    def test_only_one_concurrent_join_succeeds_for_the_same_code(self):
        creator = make_user("alice")
        _, invite = create_couple_with_invite(creator)
        joiner_a = make_user("bob")
        joiner_b = make_user("carol")

        barrier = threading.Barrier(2)
        results = {}

        def attempt(user, key):
            barrier.wait()
            try:
                join_couple(invite.code, user)
                results[key] = "success"
            except PairingError:
                results[key] = "failure"
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt, args=(joiner_a, "a"))
        t2 = threading.Thread(target=attempt, args=(joiner_b, "b"))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(sorted(results.values()), ["failure", "success"])
        self.assertEqual(CoupleMembership.objects.filter(couple_id=invite.couple_id).count(), 2)
