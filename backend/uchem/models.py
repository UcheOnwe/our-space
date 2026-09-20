from django.conf import settings
from django.db import models


class TransactionReason(models.TextChoices):
    """Controlled set of reasons a wallet's balance may change.

    Deliberately a closed, curated list rather than a free-form string —
    every future feature that moves Uchem (referrals, purchases, ...) adds
    ITS reason here first, so "why did this balance change" always has a
    small, grep-able set of answers instead of ad-hoc strings scattered
    across the app. None of these are wired to an actual earning/spending
    feature yet — this slice only builds the wallets/ledger foundation.
    """

    WELCOME_REWARD = "welcome_reward", "Welcome Reward"
    REFERRAL_REWARD = "referral_reward", "Referral Reward"
    ROOM_PURCHASE = "room_purchase", "Room Purchase"
    COMPANION_PURCHASE = "companion_purchase", "Companion Purchase"
    COSMETIC_PURCHASE = "cosmetic_purchase", "Cosmetic Purchase"
    COUPLE_CONTRIBUTION = "couple_contribution", "Couple Contribution"
    # Development-only — see services.restore_couple_wallet_for_development
    # and views.DevRestoreCoupleWalletView. Never applied in production:
    # that view is only registered/reachable when settings.DEBUG is True.
    DEV_TEST_CREDIT = "dev_test_credit", "Developer Test Credit"


class PersonalWallet(models.Model):
    """One user's own Uchem — a singleton per user, same OneToOneField
    pattern CompanionProfile already uses.

    Never derived from anything else (not from the couple wallet, not from
    a partner's wallet) — this row IS the balance. `balance` is a
    PositiveIntegerField for documentation/form-validation purposes, but
    that alone does NOT add a database-level guarantee against negative
    values in this Django version — the CheckConstraint below is what
    actually enforces it at the database, as a backstop behind the
    service-layer checks in services.py.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uchem_wallet",
    )
    balance = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(balance__gte=0),
                name="uchem_personal_wallet_balance_gte_0",
            )
        ]


class CoupleWallet(models.Model):
    """One couple's shared Uchem — a singleton per couple, completely
    separate storage from either partner's PersonalWallet. Nothing in this
    app ever adds/derives one from the other.

    `on_delete=PROTECT` (not CASCADE): no code path in this repository
    deletes an already-paired Couple today (couples.services.
    cancel_pending_pairing only ever deletes a still-PENDING, one-member
    couple, before any CoupleWallet would exist), so this is an inert
    guard for now — but it's what "protect against accidental currency
    deletion" means concretely: a future paired-couple-deletion feature
    would have to explicitly decide what happens to this wallet, rather
    than silently losing it as a CASCADE side effect. Breakup/dissolution
    behavior is deliberately NOT designed here.
    """

    couple = models.OneToOneField(
        "couples.Couple",
        on_delete=models.PROTECT,
        related_name="uchem_wallet",
    )
    balance = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(balance__gte=0),
                name="uchem_couple_wallet_balance_gte_0",
            )
        ]


class UchemTransaction(models.Model):
    """One append-only row per successful balance change — the ledger half
    of "stored balance + transaction ledger". Never edited or deleted.

    Belongs to EXACTLY one wallet: `personal_wallet` XOR `couple_wallet`,
    enforced by the CheckConstraint below, not just by service-layer
    discipline — see uchem_transaction_exactly_one_owner.

    `idempotency_key` is required and unique on every row: it's the
    durable, database-level half of duplicate-operation protection (the
    other half — a row lock on the wallet being changed — lives in
    services.py). A caller identifies each real-world operation (e.g. one
    specific purchase or reward) with one key; trying to apply the same
    key twice can never produce two rows, because Postgres itself rejects
    the second INSERT.
    """

    personal_wallet = models.ForeignKey(
        PersonalWallet, null=True, blank=True, on_delete=models.CASCADE, related_name="transactions"
    )
    couple_wallet = models.ForeignKey(
        CoupleWallet, null=True, blank=True, on_delete=models.CASCADE, related_name="transactions"
    )
    # Positive = credit (earned), negative = debit (spent). Never zero —
    # see uchem_transaction_amount_nonzero.
    amount = models.IntegerField()
    reason = models.CharField(max_length=32, choices=TransactionReason.choices)
    idempotency_key = models.CharField(max_length=64, unique=True)
    # A snapshot of the wallet's balance immediately after this change —
    # lets history be displayed later without recomputing a running total
    # from every prior row, and doubles as a sanity-check audit trail.
    balance_after = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(personal_wallet__isnull=False, couple_wallet__isnull=True)
                    | models.Q(personal_wallet__isnull=True, couple_wallet__isnull=False)
                ),
                name="uchem_transaction_exactly_one_owner",
            ),
            models.CheckConstraint(
                condition=~models.Q(amount=0),
                name="uchem_transaction_amount_nonzero",
            ),
        ]
