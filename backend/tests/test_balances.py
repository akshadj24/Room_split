from datetime import date

from app.models.expense import Category, Expense, ExpenseSplit
from app.models.household import Household, HouseholdMember
from app.models.settlement import Settlement
from app.models.user import User
from app.services.settlement_service import (
    calculate_household_balances,
    get_balance_breakdown,
)


def _create_user(db, name: str, email: str) -> User:
    user = User(name=name, email=email, password_hash="hashedpass")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_household(db, name: str, owner: User) -> Household:
    household = Household(name=name, created_by=owner.id, currency="INR")
    db.add(household)
    db.commit()
    db.refresh(household)

    member = HouseholdMember(household_id=household.id, user_id=owner.id, role="admin", status="active")
    db.add(member)
    db.commit()
    return household


def _add_member(db, household_id: int, user: User, status: str = "active") -> HouseholdMember:
    member = HouseholdMember(household_id=household_id, user_id=user.id, role="member", status=status)
    db.add(member)
    db.commit()
    return member


def _create_expense(
    db,
    household_id: int,
    payer_id: int,
    amount_paise: int,
    desc: str,
    participant_shares: dict[int, int],
) -> Expense:
    cat = Category(household_id=household_id, name="General", is_default=False)
    db.add(cat)
    db.commit()
    db.refresh(cat)

    exp = Expense(
        household_id=household_id,
        paid_by=payer_id,
        category_id=cat.id,
        amount_paise=amount_paise,
        description=desc,
        expense_date=date.today(),
        split_type="custom",
        status="active",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    for uid, share in participant_shares.items():
        split = ExpenseSplit(expense_id=exp.id, user_id=uid, share_paise=share)
        db.add(split)
    db.commit()
    return exp


def assert_balance_invariant(household_id: int, db, actor_id: int):
    """
    Core Financial Invariant:
    The sum of all member net balances in a household must ALWAYS equal 0.
    """
    balances = calculate_household_balances(db, household_id, actor_id)
    total = sum(b.net_balance_paise for b in balances)
    assert total == 0, f"Balance invariant violated: sum is {total}"
    return balances


# ==============================================================================
# Invariant & Balance Accuracy Tests
# ==============================================================================

def test_balance_invariant_always_zero(db):
    """Test requirement: Sum of all household balances = 0 (always)."""
    u1 = _create_user(db, "User 1", "b1@test.com")
    u2 = _create_user(db, "User 2", "b2@test.com")
    u3 = _create_user(db, "User 3", "b3@test.com")

    h = _create_household(db, "Invariant House", u1)
    _add_member(db, h.id, u2)
    _add_member(db, h.id, u3)

    # Initially all 0
    assert_balance_invariant(h.id, db, u1.id)

    # U1 pays ₹900 (300, 300, 300)
    _create_expense(db, h.id, u1.id, 90000, "Dinner", {u1.id: 30000, u2.id: 30000, u3.id: 30000})
    assert_balance_invariant(h.id, db, u1.id)

    # U2 pays ₹600 (300, 300)
    _create_expense(db, h.id, u2.id, 60000, "Internet", {u2.id: 30000, u3.id: 30000})
    assert_balance_invariant(h.id, db, u1.id)


def test_multiple_expenses_and_settlements_correct_net(db):
    """Test requirement: Multiple expenses + settlements → correct net balance."""
    alice = _create_user(db, "Alice", "alice_net@test.com")
    bob = _create_user(db, "Bob", "bob_net@test.com")
    h = _create_household(db, "Net House", alice)
    _add_member(db, h.id, bob)

    # 1. Alice pays ₹1,000 for groceries split equally (Alice: 500, Bob: 500)
    # Alice: +₹500, Bob: -₹500
    _create_expense(db, h.id, alice.id, 100000, "Groceries", {alice.id: 50000, bob.id: 50000})

    bal = {b.user_id: b.net_balance_paise for b in assert_balance_invariant(h.id, db, alice.id)}
    assert bal[alice.id] == 50000
    assert bal[bob.id] == -50000

    # 2. Bob partially settles ₹300 (confirmed)
    # Bob: -₹500 + ₹300 = -₹200. Alice: +₹500 - ₹300 = +₹200.
    st = Settlement(
        household_id=h.id,
        payer_id=bob.id,
        receiver_id=alice.id,
        amount_paise=30000,
        status="confirmed",
    )
    db.add(st)
    db.commit()

    bal2 = {b.user_id: b.net_balance_paise for b in assert_balance_invariant(h.id, db, alice.id)}
    assert bal2[alice.id] == 20000
    assert bal2[bob.id] == -20000


def test_pending_settlement_ignored_in_balance(db):
    """Test requirement: Pending settlement strictly ignored in balance."""
    alice = _create_user(db, "Alice", "alice_pend@test.com")
    bob = _create_user(db, "Bob", "bob_pend@test.com")
    h = _create_household(db, "Pending House", alice)
    _add_member(db, h.id, bob)

    # Alice pays ₹400 split with Bob
    _create_expense(db, h.id, alice.id, 40000, "Cafe", {alice.id: 20000, bob.id: 20000})

    # Bob records a pending settlement of ₹200 (not confirmed yet)
    st = Settlement(
        household_id=h.id,
        payer_id=bob.id,
        receiver_id=alice.id,
        amount_paise=20000,
        status="pending",
    )
    db.add(st)
    db.commit()

    # Balance must remain exactly unchanged!
    bal = {b.user_id: b.net_balance_paise for b in assert_balance_invariant(h.id, db, alice.id)}
    assert bal[alice.id] == 20000
    assert bal[bob.id] == -20000


def test_confirmed_settlement_changes_balance_exactly_once(db):
    """Test requirement: Confirmed settlement changes balance exactly once."""
    alice = _create_user(db, "Alice", "alice_once@test.com")
    bob = _create_user(db, "Bob", "bob_once@test.com")
    h = _create_household(db, "Once House", alice)
    _add_member(db, h.id, bob)

    _create_expense(db, h.id, alice.id, 50000, "Lunch", {alice.id: 25000, bob.id: 25000})

    st = Settlement(
        household_id=h.id,
        payer_id=bob.id,
        receiver_id=alice.id,
        amount_paise=25000,
        status="confirmed",
    )
    db.add(st)
    db.commit()

    bal = {b.user_id: b.net_balance_paise for b in assert_balance_invariant(h.id, db, alice.id)}
    # Fully settled
    assert bal[alice.id] == 0
    assert bal[bob.id] == 0


def test_balance_breakdown_matches_contributing_expenses(db):
    """Test requirement: Balance breakdown matches contributing expenses."""
    alice = _create_user(db, "Alice", "alice_bk@test.com")
    bob = _create_user(db, "Bob", "bob_bk@test.com")
    h = _create_household(db, "Breakdown House", alice)
    _add_member(db, h.id, bob)

    _create_expense(db, h.id, alice.id, 80000, "Electricity", {alice.id: 40000, bob.id: 40000})

    breakdown = get_balance_breakdown(db, h.id, bob.id, alice.id)
    assert breakdown.net_balance_paise == -40000
    assert len(breakdown.items) == 1
    assert breakdown.items[0].type == "expense_share"
    assert breakdown.items[0].effect_paise == -40000


def test_away_member_not_included_in_split_unaffected(db):
    """Test requirement: Away/non-participating member balance unaffected."""
    alice = _create_user(db, "Alice", "alice_away@test.com")
    bob = _create_user(db, "Bob", "bob_away@test.com")
    charlie = _create_user(db, "Charlie", "charlie_away@test.com")

    h = _create_household(db, "Away House", alice)
    _add_member(db, h.id, bob)
    _add_member(db, h.id, charlie)

    # Alice and Bob split dinner; Charlie is away/not included in participants
    _create_expense(db, h.id, alice.id, 60000, "Dinner without Charlie", {alice.id: 30000, bob.id: 30000})

    bal = {b.user_id: b.net_balance_paise for b in assert_balance_invariant(h.id, db, alice.id)}
    assert bal[charlie.id] == 0
    assert bal[alice.id] == 30000
    assert bal[bob.id] == -30000
