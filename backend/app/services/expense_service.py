import math
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.expense import AuditEvent, Category, Expense, ExpenseSplit
from app.models.household import Household, HouseholdMember
from app.schemas.expense import ExpenseCreate, ExpenseUpdate

DEFAULT_CATEGORIES = ["Food", "Groceries", "Rent", "Utilities", "Transport", "Other"]


def log_audit_event(
    db: Session,
    household_id: int,
    actor_id: int,
    entity_type: str,
    entity_id: int,
    action: str,
) -> AuditEvent:
    """Log an audit event for any expense action."""
    event = AuditEvent(
        household_id=household_id,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
    )
    db.add(event)
    return event


def seed_default_categories(db: Session, household_id: int) -> list[Category]:
    """Seed the 6 default categories for a new household."""
    categories = []
    for cat_name in DEFAULT_CATEGORIES:
        category = Category(
            household_id=household_id,
            name=cat_name,
            is_default=True,
        )
        db.add(category)
        categories.append(category)
    return categories


def get_or_create_category(
    db: Session,
    household_id: int,
    category_id: int | None = None,
    category_name: str | None = None,
) -> int | None:
    """Find or create a category in the household, defaulting to 'Other' if empty."""
    if category_id is not None:
        cat = db.query(Category).filter(Category.id == category_id, Category.household_id == household_id).first()
        if cat:
            return cat.id

    if category_name:
        clean_name = category_name.strip()
        cat = (
            db.query(Category)
            .filter(Category.household_id == household_id, Category.name.ilike(clean_name))
            .first()
        )
        if cat:
            return cat.id
        new_cat = Category(household_id=household_id, name=clean_name, is_default=False)
        db.add(new_cat)
        db.flush()
        return new_cat.id

    # Fallback to default 'Other' category
    other_cat = (
        db.query(Category)
        .filter(Category.household_id == household_id, Category.name.ilike("Other"))
        .first()
    )
    if other_cat:
        return other_cat.id

    return None


def calculate_equal_split(
    amount_paise: int,
    payer_id: int,
    participant_ids: list[int],
) -> dict[int, int]:
    """
    Calculate equal split ensuring shares sum exactly to total amount.
    Remainder is allocated to the payer's share (or last participant if payer not in participants).
    e.g. 100 among 3 participants -> non-payers 34 each, payer 32.
    """
    n = len(participant_ids)
    if n == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one participant is required for an expense",
        )

    ceil_share = (amount_paise + n - 1) // n
    shares: dict[int, int] = {}

    if payer_id in participant_ids:
        for uid in participant_ids:
            if uid != payer_id:
                shares[uid] = ceil_share
        shares[payer_id] = amount_paise - sum(shares.values())
    else:
        for uid in participant_ids[:-1]:
            shares[uid] = ceil_share
        shares[participant_ids[-1]] = amount_paise - sum(shares.values())

    return shares


def calculate_custom_split(
    amount_paise: int,
    raw_shares: dict[int, int | float] | list[dict[str, Any]],
    participant_ids: list[int],
) -> dict[int, int]:
    """Validate and compute custom split shares where sum of shares must equal total amount exactly."""
    normalized_shares: dict[int, int] = {}

    if isinstance(raw_shares, list):
        for item in raw_shares:
            uid = int(item.get("user_id", item.get("id")))
            val = item.get("share_paise", item.get("share", item.get("amount")))
            normalized_shares[uid] = int(val)
    elif isinstance(raw_shares, dict):
        for k, v in raw_shares.items():
            normalized_shares[int(k)] = int(v)
    else:
        raise HTTPException(status_code=400, detail="Invalid custom shares format")

    # If inputs were passed in rupees (e.g. 34, 34, 32 for amount_paise=10000)
    if sum(normalized_shares.values()) != amount_paise:
        converted = {uid: round(val * 100) for uid, val in normalized_shares.items()}
        if sum(converted.values()) == amount_paise:
            normalized_shares = converted

    total_shares = sum(normalized_shares.values())
    if total_shares != amount_paise:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shares must sum exactly to expense total ({amount_paise} paise), got {total_shares} paise",
        )

    for uid in normalized_shares:
        if uid not in participant_ids:
            participant_ids.append(uid)

    return normalized_shares


def calculate_weighted_split(
    amount_paise: int,
    weights_input: dict[int, int | float] | list[dict[str, Any]],
    participant_ids: list[int],
    payer_id: int,
) -> dict[int, int]:
    """Calculate proportional split based on weights and deterministically allocate remainder paise."""
    weights: dict[int, float] = {}
    if isinstance(weights_input, list):
        for item in weights_input:
            uid = int(item.get("user_id", item.get("id")))
            w = float(item.get("weight", item.get("share", 1)))
            weights[uid] = w
    elif isinstance(weights_input, dict):
        for k, v in weights_input.items():
            weights[int(k)] = float(v)

    total_weight = sum(weights.values())
    if total_weight <= 0:
        raise HTTPException(status_code=400, detail="Total weights must be greater than zero")

    floor_shares: dict[int, int] = {}
    fractions: list[tuple[float, int]] = []

    for uid, w in weights.items():
        raw_share = (amount_paise * w) / total_weight
        floor_val = math.floor(raw_share)
        floor_shares[uid] = floor_val
        fractions.append((raw_share - floor_val, uid))

    remainder = amount_paise - sum(floor_shares.values())
    # Sort by largest fractional remainder
    fractions.sort(key=lambda x: x[0], reverse=True)

    for i in range(remainder):
        uid = fractions[i % len(fractions)][1]
        floor_shares[uid] += 1

    return floor_shares


def validate_household_and_members(
    db: Session,
    household_id: int,
    actor_id: int,
    payer_id: int,
    participant_ids: list[int],
) -> None:
    """Validate household existence and ensure actor, payer, and participants are active members."""
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")

    active_members = (
        db.query(HouseholdMember.user_id)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == "active",
        )
        .all()
    )
    active_member_ids = {m[0] for m in active_members}

    if actor_id not in active_member_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only members of that household can add or manage expenses",
        )

    if payer_id not in active_member_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payer is not an active member of this household",
        )

    for pid in participant_ids:
        if pid not in active_member_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User {pid} is not an active member of this household",
            )


def create_expense(
    db: Session,
    household_id: int,
    actor_id: int,
    data: ExpenseCreate,
) -> Expense:
    """Create a new expense with atomic splits and audit trail in a single transaction."""
    amount_paise = data.amount_paise
    if amount_paise is None:
        amount_paise = round((data.amount or 0.0) * 100)

    if amount_paise <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expense amount must be greater than zero",
        )

    # Check for duplicate submission within 3 seconds
    recent_dup = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.paid_by == data.paid_by,
            Expense.amount_paise == amount_paise,
            Expense.description == data.description.strip(),
            Expense.status == "active",
        )
        .order_by(Expense.id.desc())
        .first()
    )
    if recent_dup:
        now = datetime.now(UTC).replace(tzinfo=None)
        exp_time = recent_dup.created_at.replace(tzinfo=None) if recent_dup.created_at else now
        if (now - exp_time).total_seconds() < 3.0:
            return recent_dup

    # Participants resolution
    participants = list(data.participants) if data.participants else []
    if not participants:
        if data.shares and isinstance(data.shares, dict):
            participants = [int(k) for k in data.shares]
        elif data.shares and isinstance(data.shares, list):
            participants = [int(item.get("user_id", item.get("id"))) for item in data.shares]
        else:
            participants = [data.paid_by]

    validate_household_and_members(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        payer_id=data.paid_by,
        participant_ids=participants,
    )

    split_type = data.split_type.lower()
    if split_type in ("equal", "even"):
        splits_dict = calculate_equal_split(amount_paise, data.paid_by, participants)
    elif split_type in ("custom", "exact"):
        if not data.shares:
            raise HTTPException(status_code=400, detail="Custom split requires shares dictionary")
        splits_dict = calculate_custom_split(amount_paise, data.shares, participants)
    elif split_type in ("weighted", "percentage", "proportion"):
        if not data.shares:
            raise HTTPException(status_code=400, detail="Weighted split requires weights dictionary")
        splits_dict = calculate_weighted_split(amount_paise, data.shares, participants, data.paid_by)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported split type: {data.split_type}")

    # Validate exact sum
    if sum(splits_dict.values()) != amount_paise:
        raise HTTPException(status_code=400, detail="Shares must sum exactly to expense total")

    # Category resolution
    cat_id = get_or_create_category(db, household_id, data.category_id, data.category)

    # Atomic write
    expense = Expense(
        household_id=household_id,
        paid_by=data.paid_by,
        category_id=cat_id,
        amount_paise=amount_paise,
        description=data.description.strip(),
        expense_date=data.expense_date or date.today(),
        split_type=split_type,
        status="active",
    )
    db.add(expense)
    db.flush()

    for uid, share in splits_dict.items():
        split = ExpenseSplit(
            expense_id=expense.id,
            user_id=uid,
            share_paise=share,
        )
        db.add(split)

    log_audit_event(
        db=db,
        household_id=household_id,
        actor_id=actor_id,
        entity_type="expense",
        entity_id=expense.id,
        action="create",
    )

    db.commit()
    db.refresh(expense)
    return expense


def get_household_expenses(db: Session, household_id: int, actor_id: int) -> list[Expense]:
    """List all active and reversed expenses for a household."""
    # Ensure actor is a member
    membership = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == actor_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return (
        db.query(Expense)
        .filter(Expense.household_id == household_id)
        .order_by(Expense.id.desc())
        .all()
    )


def get_expense_detail(db: Session, expense_id: int, actor_id: int) -> Expense:
    """Retrieve details for a single expense with splits."""
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    membership = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == expense.household_id,
            HouseholdMember.user_id == actor_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return expense


def edit_expense(
    db: Session,
    expense_id: int,
    actor_id: int,
    data: ExpenseUpdate,
) -> Expense:
    """Edit expense metadata (description, category, date) and record in audit trail."""
    expense = get_expense_detail(db, expense_id, actor_id)

    if expense.status == "reversed":
        raise HTTPException(status_code=400, detail="Cannot edit a reversed expense")

    if data.description is not None:
        expense.description = data.description.strip()
    if data.category_id is not None:
        cat = db.query(Category).filter(Category.id == data.category_id, Category.household_id == expense.household_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Category does not belong to this household")
        expense.category_id = data.category_id
    if data.expense_date is not None:
        expense.expense_date = data.expense_date

    log_audit_event(
        db=db,
        household_id=expense.household_id,
        actor_id=actor_id,
        entity_type="expense",
        entity_id=expense.id,
        action="edit",
    )

    db.commit()
    db.refresh(expense)
    return expense


def reverse_expense(db: Session, expense_id: int, actor_id: int) -> tuple[Expense, Expense]:
    """
    Reverse an expense by marking it reversed and creating an atomic counter-entry.
    Balances are preserved without hard deletes.
    """
    expense = get_expense_detail(db, expense_id, actor_id)

    if expense.status in ("reversed", "reversal"):
        raise HTTPException(status_code=400, detail="Expense has already been reversed")

    expense.status = "reversed"

    # Create counter-entry
    reversal_entry = Expense(
        household_id=expense.household_id,
        paid_by=expense.paid_by,
        category_id=expense.category_id,
        amount_paise=-expense.amount_paise,
        description=f"Reversal of #{expense.id}: {expense.description}",
        expense_date=date.today(),
        split_type=expense.split_type,
        status="reversal",
    )
    db.add(reversal_entry)
    db.flush()

    for s in expense.splits:
        counter_split = ExpenseSplit(
            expense_id=reversal_entry.id,
            user_id=s.user_id,
            share_paise=-s.share_paise,
        )
        db.add(counter_split)

    log_audit_event(
        db=db,
        household_id=expense.household_id,
        actor_id=actor_id,
        entity_type="expense",
        entity_id=expense.id,
        action="reverse",
    )

    db.commit()
    db.refresh(expense)
    db.refresh(reversal_entry)
    return expense, reversal_entry
