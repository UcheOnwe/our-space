import uuid

from django.db import IntegrityError, transaction

from .models import CoupleWallet, PersonalWallet, TransactionReason, UchemTransaction

# Development-only testing target — see restore_couple_wallet_for_development.
DEV_UCHEM_RESTORE_TARGET = 10_000


class InsufficientUchemError(Exception):
    """Raised when a debit would take a wallet below zero.

    Views/future callers catch this and report it as a normal 400, the
    same error-shape convention couples.PairingError and watch.WatchError
    already use.
    """


def get_or_create_personal_wallet(user) -> PersonalWallet:
    """GET semantics: returns the caller's PersonalWallet, creating one
    with a 0 balance on first-ever access. Same get_or_create race-safety
    as companions.services.get_or_create_profile — a OneToOneField's own
    unique constraint means a rare concurrent-first-access race resolves
    itself without any extra locking here.
    """
    wallet, _ = PersonalWallet.objects.get_or_create(user=user)
    return wallet


def get_or_create_couple_wallet(couple) -> CoupleWallet:
    """Same lazy-creation contract as get_or_create_personal_wallet, keyed
    by Couple instead of User. Callers are responsible for having already
    confirmed `couple` represents a genuinely PAIRED couple (see
    uchem.views.CoupleWalletView) — this function itself doesn't know or
    care about pairing, the same separation of concerns
    companions.services.get_or_create_profile already follows for "does
    this user even need to be paired" (it doesn't check either).
    """
    wallet, _ = CoupleWallet.objects.get_or_create(couple=couple)
    return wallet


def _apply_personal_wallet_delta(user, amount: int, reason: str, idempotency_key: str) -> PersonalWallet:
    """Safely applies `amount` (positive=credit, negative=debit) to
    `user`'s PersonalWallet and records the matching UchemTransaction.

    Duplicate protection is deliberately two layers, not one:

    1. THE ROW LOCK (normal path): select_for_update() locks this wallet's
       one row for the duration of this transaction. Two requests for the
       SAME wallet — including two truly concurrent duplicates carrying
       the same idempotency_key — serialize against each other here: the
       second one blocks until the first commits, then its own
       idempotency_key lookup below finds the row the first request just
       wrote and returns early. This handles both ordinary sequential
       duplicates and same-wallet concurrent duplicates without ever
       touching the database's uniqueness machinery.

    2. THE UNIQUE CONSTRAINT (durable backstop): UchemTransaction.
       idempotency_key is unique at the database level. The row lock in
       (1) only serializes requests against the SAME wallet — it can't
       protect against, say, a caller bug that reuses one idempotency_key
       across two DIFFERENT wallets (different rows, different locks,
       never serialized against each other). The inner atomic() block
       below exists so that if the INSERT still raises an IntegrityError
       (this key already exists), only THIS attempt's balance write and
       ledger insert are rolled back (a savepoint, not the whole
       operation) — the wallet is simply left exactly as it was before
       this call, and the caller gets back the current, correct balance
       rather than an exception. The already-committed first operation is
       never touched.
    """
    if amount == 0:
        raise ValueError("Uchem transaction amount must not be zero.")

    with transaction.atomic():
        wallet, _ = PersonalWallet.objects.select_for_update().get_or_create(user=user)

        if UchemTransaction.objects.filter(idempotency_key=idempotency_key).exists():
            return wallet

        new_balance = wallet.balance + amount
        if new_balance < 0:
            raise InsufficientUchemError("This Personal Wallet does not have enough Uchem for this operation.")

        try:
            with transaction.atomic():
                wallet.balance = new_balance
                wallet.save(update_fields=["balance", "updated_at"])
                UchemTransaction.objects.create(
                    personal_wallet=wallet,
                    amount=amount,
                    reason=reason,
                    idempotency_key=idempotency_key,
                    balance_after=new_balance,
                )
        except IntegrityError:
            # The unique constraint caught a duplicate the row lock above
            # couldn't (see this function's own doc comment, layer 2). The
            # savepoint already undid the balance write attempted just
            # now — refresh from the database rather than trust the
            # in-memory `wallet`, which still holds the rolled-back value.
            wallet.refresh_from_db()

    return wallet


def _apply_couple_wallet_delta(couple, amount: int, reason: str, idempotency_key: str) -> CoupleWallet:
    """Same contract and same two-layer duplicate protection as
    _apply_personal_wallet_delta — see that function's doc comment for the
    full reasoning. Kept as its own function, not a generic helper
    branching on wallet type, so each wallet type's logic stays a plain,
    readable read-lock-check-write, matching the rest of this codebase's
    preference for explicit small functions over shared generic ones.
    """
    if amount == 0:
        raise ValueError("Uchem transaction amount must not be zero.")

    with transaction.atomic():
        wallet, _ = CoupleWallet.objects.select_for_update().get_or_create(couple=couple)

        if UchemTransaction.objects.filter(idempotency_key=idempotency_key).exists():
            return wallet

        new_balance = wallet.balance + amount
        if new_balance < 0:
            raise InsufficientUchemError("This Couple Wallet does not have enough Uchem for this operation.")

        try:
            with transaction.atomic():
                wallet.balance = new_balance
                wallet.save(update_fields=["balance", "updated_at"])
                UchemTransaction.objects.create(
                    couple_wallet=wallet,
                    amount=amount,
                    reason=reason,
                    idempotency_key=idempotency_key,
                    balance_after=new_balance,
                )
        except IntegrityError:
            wallet.refresh_from_db()

    return wallet

def _validate_positive_amount(amount: int) -> None:
    """Ensures callers provide a posive Uchem amount"""
    if amount <= 0:
        raise ValueError("Uchem amount must be positive")
    
def credit_personal_wallet(user, amount: int, reason: str, idempotency_key: str) -> PersonalWallet:
    """Adds Uchem to `user`'s own wallet. `amount` must be positive — pass
    the magnitude to earn, not a pre-negated value. Never touches the
    couple wallet or any other user's wallet."""
    _validate_positive_amount(amount)
    return _apply_personal_wallet_delta(user, amount, reason, idempotency_key)


def debit_personal_wallet(user, amount: int, reason: str, idempotency_key: str) -> PersonalWallet:
    """Removes Uchem from `user`'s own wallet. `amount` must be positive —
    pass the magnitude to spend; this negates it internally. Raises
    InsufficientUchemError, unchanged, if the wallet doesn't have enough.
    Never touches the couple wallet or any other user's wallet."""
    _validate_positive_amount(amount)
    return _apply_personal_wallet_delta(user, -amount, reason, idempotency_key)


def credit_couple_wallet(couple, amount: int, reason: str, idempotency_key: str) -> CoupleWallet:
    """Adds Uchem to a couple's shared wallet. `amount` must be positive.
    Never touches either partner's PersonalWallet."""
    _validate_positive_amount(amount)
    return _apply_couple_wallet_delta(couple, amount, reason, idempotency_key)


def debit_couple_wallet(couple, amount: int, reason: str, idempotency_key: str) -> CoupleWallet:
    """Removes Uchem from a couple's shared wallet. `amount` must be
    positive; this negates it internally. Raises InsufficientUchemError,
    unchanged, if the wallet doesn't have enough. Never touches either
    partner's PersonalWallet."""
    _validate_positive_amount(amount)
    return _apply_couple_wallet_delta(couple, -amount, reason, idempotency_key)


def restore_couple_wallet_for_development(couple) -> CoupleWallet:
    """DEVELOPMENT-ONLY: brings `couple`'s Wallet up to
    DEV_UCHEM_RESTORE_TARGET, crediting only the shortfall — never a flat
    top-up, and a genuine no-op (no credit call, no ledger row) once the
    balance is already at or above the target. Never touches either
    partner's PersonalWallet, and never debits.

    Correctness under concurrency comes ENTIRELY from the row lock and the
    shortfall check happening together, inside one atomic transaction —
    NOT from the idempotency key below, and NOT from any timing/bucketing.
    Two simultaneous calls for the same couple serialize on this wallet's
    row: whichever transaction commits first restores it to the target;
    the second, once it can finally acquire the lock, reads the
    ALREADY-restored balance, computes a shortfall of 0 (or negative), and
    credits nothing. This is the same select_for_update()-first pattern
    couples.services.join_couple and rooms.services.purchase_room already
    use to serialize a couple-scoped mutation — not a new technique.

    The idempotency key passed to credit_couple_wallet is a fresh
    uuid4 per actual credit, namespaced by couple id. It does not need to
    be deterministic/stable the way a one-time purchase's key does —
    restoring is intentionally a repeatable action (the same couple may
    legitimately do this many times across a testing session), and the
    lock/shortfall check above is what already prevents any single
    restore from double-applying, not this key. The key still satisfies
    credit_couple_wallet's own required duplicate-protection contract
    (see its doc comment) — it just isn't the mechanism doing the
    interesting work here.
    """
    with transaction.atomic():
        wallet, _ = CoupleWallet.objects.select_for_update().get_or_create(couple=couple)
        shortfall = DEV_UCHEM_RESTORE_TARGET - wallet.balance
        if shortfall <= 0:
            return wallet

        idempotency_key = f"dev-uchem-restore:{couple.id}:{uuid.uuid4()}"
        return credit_couple_wallet(couple, shortfall, TransactionReason.DEV_TEST_CREDIT, idempotency_key)
