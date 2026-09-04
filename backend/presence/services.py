from couples.models import CoupleMembership
from couples.services import get_status_for_user

# The couple's creator is always "A", the partner who joined is always "B".
# This is an abstract seat assignment, not a character choice — the
# frontend alone decides what "A"/"B" actually look like. Keeping identity
# (who is A) and appearance (what A renders as) separate is what lets
# future avatar customization change without touching this or the
# WebSocket protocol.
SEAT_A = "A"
SEAT_B = "B"


def get_paired_couple_or_none(user):
    """Returns the user's Couple if they're fully paired, else None.

    Reuses couples.services rather than re-querying CoupleMembership
    directly, so "what counts as paired" stays defined in exactly one
    place across the whole app.
    """
    status, couple, _invite = get_status_for_user(user)
    return couple if status == "paired" else None


def get_seat_assignments(couple):
    """Returns {user_id: "A" | "B"} for a paired couple.

    Ordered by CoupleMembership.joined_at — the creator (member #1) always
    joined first, so no separate "who created this" flag is needed beyond
    what couple pairing already records.
    """
    memberships = list(
        CoupleMembership.objects.filter(couple=couple).order_by("joined_at")
    )
    if len(memberships) != 2:
        return {}
    return {memberships[0].user_id: SEAT_A, memberships[1].user_id: SEAT_B}
