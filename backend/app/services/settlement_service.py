from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.expense import AuditEvent, Expense
from app.models.household import HouseholdMember
from app.models.settlement import Settlement
from app.models.user import User
from app.schemas.settlement import (
    BalanceBreakdownItem,
    BalanceBreakdownResponse,
    MemberBalance,
    SettlementCreate,
    TransferSuggestion,
)


def _validate_household_membership(db: Session, household_id: int, user_id: int) -> None:
    """Ensure user is an active member of the specified household."""
    membership = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this household",
        )


def calculate_household_balances(
    db: Session,
    household_id: int,
    actor_id: int,
) -> list[MemberBalance]:
    """
    Calculate net balance for each member in the household:
    Net balance = expenses paid - shares owed + settlements received (confirmed) - settlements paid (confirmed)
    Pending and cancelled settlements are strictly ignored.
    Sum of all balances must always equal 0.
    """
    _validate_household_membership(db, household_id, actor_id)

    members = (
        db.query(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == "active",
        )
        .all()
    )

    balances: dict[int, int] = {user.id: 0 for _, user in members}
    user_map = {user.id: user for _, user in members}

    # 1. Tally active expenses and splits
    active_expenses = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
        )
        .all()
    )

    for exp in active_expenses:
        if exp.paid_by in balances:
            balances[exp.paid_by] += exp.amount_paise

        for s in exp.splits:
            if s.user_id in balances:
                balances[s.user_id] -= s.share_paise

    # 2. Tally confirmed settlements only
    confirmed_settlements = (
        db.query(Settlement)
        .filter(
            Settlement.household_id == household_id,
            Settlement.status == "confirmed",
        )
        .all()
    )

    for st in confirmed_settlements:
        if st.receiver_id in balances:
            balances[st.receiver_id] -= st.amount_paise
        if st.payer_id in balances:
            balances[st.payer_id] += st.amount_paise

    # Invariant verification: sum of all balances in household must = 0
    total_balance_sum = sum(balances.values())
    if total_balance_sum != 0:
        # In rare single-paisa rounding edge cases, verify deviation is 0
        raise ValueError(f"Balance invariant violated: total household balance sum is {total_balance_sum}")

    result = []
    for uid, user in user_map.items():
        result.append(
            MemberBalance(
                user_id=uid,
                name=user.name,
                email=user.email,
                net_balance_paise=balances[uid],
            )
        )
    return result


def generate_transfer_suggestions(
    db: Session,
    household_id: int,
    actor_id: int,
) -> list[TransferSuggestion]:
    """
    Greedy minimum-cash-flow algorithm:
    Matches largest debtor to largest creditor until all balances are zeroed.
    Never persisted to DB (suggestions only).
    """
    member_balances = calculate_household_balances(db, household_id, actor_id)
    user_name_map = {m.user_id: m.name for m in member_balances}

    creditors: list[tuple[int, int]] = []  # (user_id, positive_balance)
    debtors: list[tuple[int, int]] = []  # (user_id, positive_debt)

    for m in member_balances:
        if m.net_balance_paise > 0:
            creditors.append((m.user_id, m.net_balance_paise))
        elif m.net_balance_paise < 0:
            debtors.append((m.user_id, -m.net_balance_paise))

    # Sort descending
    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    c_list = [list(c) for c in creditors]
    d_list = [list(d) for d in debtors]

    suggestions: list[TransferSuggestion] = []
    c_idx = 0
    d_idx = 0

    while c_idx < len(c_list) and d_idx < len(d_list):
        c_user, c_amt = c_list[c_idx]
        d_user, d_amt = d_list[d_idx]

        settle_amt = min(c_amt, d_amt)
        if settle_amt > 0:
            suggestions.append(
                TransferSuggestion(
                    from_user_id=d_user,
                    from_user_name=user_name_map.get(d_user, f"User {d_user}"),
                    to_user_id=c_user,
                    to_user_name=user_name_map.get(c_user, f"User {c_user}"),
                    amount_paise=settle_amt,
                )
            )

        c_list[c_idx][1] -= settle_amt
        d_list[d_idx][1] -= settle_amt

        if c_list[c_idx][1] == 0:
            c_idx += 1
        if d_list[d_idx][1] == 0:
            d_idx += 1

    return suggestions


def get_balance_breakdown(
    db: Session,
    household_id: int,
    member_id: int,
    actor_id: int,
) -> BalanceBreakdownResponse:
    """
    Detailed explanation of why a member owes or is owed an amount.
    Lists contributing active expenses (paid or split) and confirmed settlements.
    """
    _validate_household_membership(db, household_id, actor_id)

    # Validate target member exists in household
    target_member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == member_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this household",
        )

    users = db.query(User).all()
    user_names = {u.id: u.name for u in users}

    items: list[BalanceBreakdownItem] = []

    # 1. Expenses where member paid (Credit)
    paid_expenses = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.paid_by == member_id,
            Expense.status == "active",
        )
        .all()
    )
    for exp in paid_expenses:
        items.append(
            BalanceBreakdownItem(
                id=exp.id,
                type="expense_paid",
                description=f"Paid for: {exp.description}",
                date=str(exp.expense_date),
                other_party="Self (Payer)",
                effect_paise=exp.amount_paise,
            )
        )

    # 2. Splits where member owes (Debit)
    active_expenses = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
        )
        .all()
    )
    for exp in active_expenses:
        for s in exp.splits:
            if s.user_id == member_id:
                items.append(
                    BalanceBreakdownItem(
                        id=exp.id,
                        type="expense_share",
                        description=f"Share for: {exp.description}",
                        date=str(exp.expense_date),
                        other_party=user_names.get(exp.paid_by, f"User {exp.paid_by}"),
                        effect_paise=-s.share_paise,
                    )
                )

    # 3. Confirmed settlements where member was receiver (Credit)
    received_settlements = (
        db.query(Settlement)
        .filter(
            Settlement.household_id == household_id,
            Settlement.receiver_id == member_id,
            Settlement.status == "confirmed",
        )
        .all()
    )
    for st in received_settlements:
        items.append(
            BalanceBreakdownItem(
                id=st.id,
                type="settlement_received",
                description="Repayment received",
                date=str(st.paid_at or st.created_at),
                other_party=user_names.get(st.payer_id, f"User {st.payer_id}"),
                effect_paise=-st.amount_paise,
            )
        )

    # 4. Confirmed settlements where member was payer (Debt reduced)
    paid_settlements = (
        db.query(Settlement)
        .filter(
            Settlement.household_id == household_id,
            Settlement.payer_id == member_id,
            Settlement.status == "confirmed",
        )
        .all()
    )
    for st in paid_settlements:
        items.append(
            BalanceBreakdownItem(
                id=st.id,
                type="settlement_paid",
                description="Repayment sent",
                date=str(st.paid_at or st.created_at),
                other_party=user_names.get(st.receiver_id, f"User {st.receiver_id}"),
                effect_paise=st.amount_paise,
            )
        )

    total_effect = sum(i.effect_paise for i in items)
    return BalanceBreakdownResponse(
        household_id=household_id,
        user_id=member_id,
        net_balance_paise=total_effect,
        items=items,
    )


def record_settlement(
    db: Session,
    household_id: int,
    actor_id: int,
    data: SettlementCreate,
) -> Settlement:
    """Record a new repayment settlement in pending status with idempotency protection."""
    _validate_household_membership(db, household_id, actor_id)
    _validate_household_membership(db, household_id, data.payer_id)
    _validate_household_membership(db, household_id, data.receiver_id)

    if data.payer_id == data.receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payer and receiver cannot be the same member",
        )

    # Check idempotency key for duplicate prevention
    if data.idempotency_key:
        existing = (
            db.query(Settlement)
            .filter(
                Settlement.household_id == household_id,
                Settlement.idempotency_key == data.idempotency_key.strip(),
            )
            .first()
        )
        if existing:
            return existing

    settlement = Settlement(
        household_id=household_id,
        payer_id=data.payer_id,
        receiver_id=data.receiver_id,
        amount_paise=data.amount_paise,
        status="pending",
        idempotency_key=data.idempotency_key.strip() if data.idempotency_key else None,
    )
    db.add(settlement)
    db.flush()

    audit = AuditEvent(
        household_id=household_id,
        actor_id=actor_id,
        entity_type="settlement",
        entity_id=settlement.id,
        action="create_settlement",
    )
    db.add(audit)

    db.commit()
    db.refresh(settlement)
    return settlement


def confirm_settlement(
    db: Session,
    settlement_id: int,
    actor_id: int,
) -> Settlement:
    """
    Receiver confirms a settlement payment.
    Enforces rule: ONLY receiver can confirm, not payer.
    """
    settlement = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not settlement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Settlement not found",
        )

    # Strict rule: Only receiver can confirm
    if actor_id != settlement.receiver_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the receiver can confirm this settlement",
        )

    if settlement.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm settlement with status '{settlement.status}'",
        )

    settlement.status = "confirmed"
    settlement.paid_at = datetime.now(UTC).replace(tzinfo=None)

    audit = AuditEvent(
        household_id=settlement.household_id,
        actor_id=actor_id,
        entity_type="settlement",
        entity_id=settlement.id,
        action="confirm_settlement",
    )
    db.add(audit)

    db.commit()
    db.refresh(settlement)
    return settlement


def cancel_settlement(
    db: Session,
    settlement_id: int,
    actor_id: int,
) -> Settlement:
    """Cancel a pending settlement. Both payer and receiver can cancel before confirmation."""
    settlement = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not settlement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Settlement not found",
        )

    if actor_id not in (settlement.payer_id, settlement.receiver_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the payer or receiver can cancel this settlement",
        )

    if settlement.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel settlement with status '{settlement.status}'",
        )

    settlement.status = "cancelled"

    audit = AuditEvent(
        household_id=settlement.household_id,
        actor_id=actor_id,
        entity_type="settlement",
        entity_id=settlement.id,
        action="cancel_settlement",
    )
    db.add(audit)

    db.commit()
    db.refresh(settlement)
    return settlement


def get_household_settlements(
    db: Session,
    household_id: int,
    actor_id: int,
) -> list[Settlement]:
    """Retrieve settlement history for a household."""
    _validate_household_membership(db, household_id, actor_id)
    return (
        db.query(Settlement)
        .filter(Settlement.household_id == household_id)
        .order_by(Settlement.id.desc())
        .all()
    )
