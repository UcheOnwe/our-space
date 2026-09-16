from .models import CompanionProfile


def get_or_create_profile(user) -> CompanionProfile:
    """GET semantics: returns the caller's CompanionProfile, creating one
    with the model's defaults on first-ever access.

    `get_or_create` already handles the rare concurrent-first-access race
    itself (retrying once on the IntegrityError the OneToOneField's unique
    constraint would raise) — unlike couples.services, there's no
    multi-row/two-user invariant here that needs its own transaction or
    locking, just one user's own single row.
    """
    profile, _ = CompanionProfile.objects.get_or_create(user=user)
    return profile


def update_selection(user, companion_type: str, color_variant: str) -> CompanionProfile:
    """PATCH semantics: sets the caller's equipped companion_type AND
    color_variant together — see CompanionSelectionSerializer, which is
    what actually validates both are recognized and that the color is
    valid for the given type. This function trusts already-validated
    input, same division of labor as watch.services.set_playback_state.
    """
    profile = get_or_create_profile(user)
    profile.companion_type = companion_type
    profile.color_variant = color_variant
    profile.save(update_fields=["companion_type", "color_variant", "updated_at"])
    return profile
