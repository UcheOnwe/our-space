import random

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Couple, CoupleMembership, PairingInvite

# Excludes O/0 and I/1 — characters that are easily confused when a person
# reads a code aloud or types it from memory.
INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_CODE_LENGTH = 6
_MAX_CODE_GENERATION_ATTEMPTS = 10


class PairingError(Exception):
    """Raised for any couple-pairing business rule violation.

    Views catch this and return its message as a 400 response with
    `detail` set, matching the error shape the frontend already expects
    from the accounts app.
    """


def _generate_unique_code() -> str:
    for _ in range(_MAX_CODE_GENERATION_ATTEMPTS):
        code = "".join(random.choices(INVITE_CODE_ALPHABET, k=INVITE_CODE_LENGTH))
        if not PairingInvite.objects.filter(code=code).exists():
            return code
    raise PairingError("Could not generate a unique invite code. Please try again.")


def create_couple_with_invite(creator):
    """Creates a couple, makes `creator` member #1, and issues its invite.

    All three rows are created in one transaction (a set of database writes
    that either all succeed or all roll back together), so a failure
    partway through never leaves an orphaned Couple behind.
    """
    if CoupleMembership.objects.filter(user=creator).exists():
        raise PairingError("You already belong to a couple.")

    with transaction.atomic():
        couple = Couple.objects.create()
        try:
            CoupleMembership.objects.create(user=creator, couple=couple)
        except IntegrityError:
            # Defends against the rare race where the same user submits two
            # "Create Our Space" requests at the same instant.
            raise PairingError("You already belong to a couple.")
        invite = PairingInvite.objects.create(
            couple=couple, created_by=creator, code=_generate_unique_code()
        )

    return couple, invite


def join_couple(code, joining_user):
    """Adds `joining_user` as member #2 of the couple behind `code`.

    The invite row is locked with select_for_update — this tells Postgres
    to hold that row exclusively until the transaction finishes, so if two
    people submit the same code at the same instant, the second request
    waits for the first to finish and then correctly sees the invite as
    already accepted, instead of both being let in.
    """
    if CoupleMembership.objects.filter(user=joining_user).exists():
        raise PairingError("You already belong to a couple.")

    normalized_code = code.strip().upper()

    with transaction.atomic():
        try:
            invite = (
                PairingInvite.objects.select_for_update()
                .select_related("couple")
                .get(code=normalized_code, status=PairingInvite.Status.PENDING)
            )
        except PairingInvite.DoesNotExist:
            raise PairingError("This invite code is invalid or has already been used.")

        if invite.created_by_id == joining_user.id:
            raise PairingError("You cannot pair with yourself.")

        if CoupleMembership.objects.filter(couple=invite.couple).count() >= 2:
            raise PairingError("This couple already has two members.")

        try:
            membership = CoupleMembership.objects.create(user=joining_user, couple=invite.couple)
        except IntegrityError:
            raise PairingError("You already belong to a couple.")

        invite.status = PairingInvite.Status.ACCEPTED
        invite.accepted_by = joining_user
        invite.accepted_at = timezone.now()
        invite.save(update_fields=["status", "accepted_by", "accepted_at"])

    return membership


def cancel_pending_pairing(user):
    """Cancels a pending "Create Our Space" that hasn't been joined yet.

    Only the sole member of a still-pending (one-member) couple may cancel.
    Locks the couple's pending invite row first — the same row join_couple
    locks — so a cancel racing against a concurrent join is serialized
    correctly: whichever transaction commits first decides whether the
    couple ends up cancelled or paired; the other sees up-to-date state and
    is rejected.

    Deletes the Couple outright; CoupleMembership and PairingInvite cascade
    with it (see their on_delete=CASCADE). Unlike an accepted invite,
    there's nothing worth keeping as history for a space that was never
    actually paired.
    """
    membership = CoupleMembership.objects.filter(user=user).select_related("couple").first()
    if membership is None:
        raise PairingError("You don't have a pending pairing to cancel.")

    couple = membership.couple

    with transaction.atomic():
        PairingInvite.objects.select_for_update().filter(
            couple=couple, status=PairingInvite.Status.PENDING
        ).first()

        if CoupleMembership.objects.filter(couple=couple).count() >= 2:
            raise PairingError("This couple is already paired and cannot be cancelled.")

        couple.delete()


def get_status_for_user(user):
    """Returns (status, couple, invite) for the couple-status endpoint.

    status is one of "none" / "waiting" / "paired". `couple` is None only
    when status is "none"; `invite` is only ever set alongside "waiting".
    """
    membership = CoupleMembership.objects.filter(user=user).select_related("couple").first()
    if membership is None:
        return "none", None, None

    couple = membership.couple
    member_count = CoupleMembership.objects.filter(couple=couple).count()

    if member_count < 2:
        invite = PairingInvite.objects.filter(
            couple=couple, status=PairingInvite.Status.PENDING
        ).first()
        return "waiting", couple, invite

    return "paired", couple, None
