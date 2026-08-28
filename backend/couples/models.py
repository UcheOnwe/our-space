from django.conf import settings
from django.db import models


class Couple(models.Model):
    """The shared private space two paired users belong to.

    Deliberately holds no member fields — membership lives in
    CoupleMembership, and a couple can briefly exist with just one member
    (the creator, before their partner joins).
    """

    created_at = models.DateTimeField(auto_now_add=True)


class CoupleMembership(models.Model):
    """Links one user to the one couple they belong to.

    `user` is a OneToOneField, not a plain ForeignKey — this is what makes
    "a user can belong to at most one couple, ever" a fact enforced by the
    database itself, not just application logic.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="couple_membership",
    )
    couple = models.ForeignKey(Couple, on_delete=models.CASCADE, related_name="memberships")
    joined_at = models.DateTimeField(auto_now_add=True)


class PairingInvite(models.Model):
    """A short code that lets a second user join a couple.

    Accepted invites are kept, not deleted, as a simple historical record —
    consistent with the product's "shared history" ethos. The partial
    unique constraint below allows only one PENDING invite per couple at a
    time; this slice never exposes a "regenerate code" action, but the
    constraint costs nothing and protects the invariant if that's added
    later.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"

    code = models.CharField(max_length=6, unique=True)
    couple = models.ForeignKey(Couple, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invites_created",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invites_accepted",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["couple"],
                condition=models.Q(status="pending"),
                name="unique_pending_invite_per_couple",
            )
        ]
