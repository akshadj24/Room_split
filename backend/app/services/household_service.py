from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import generate_invite_token, hash_invite_token
from app.models.household import Household, HouseholdInvitation, HouseholdMember
from app.schemas.household import HouseholdCreate


def _to_utc_naive(dt: datetime) -> datetime:
    """Normalize datetime to UTC naive for safe database comparison."""
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


from app.models.expense import Category

DEFAULT_CATEGORIES = ["Food", "Groceries", "Rent", "Utilities", "Transport", "Other"]


def create_household(db: Session, creator_id: int, data: HouseholdCreate) -> Household:
    """Create a new household, assign creator as owner, and seed default categories."""
    household = Household(
        name=data.name.strip(),
        currency=data.currency.strip().upper(),
        created_by=creator_id,
    )
    db.add(household)
    db.flush()

    member = HouseholdMember(
        household_id=household.id,
        user_id=creator_id,
        role="owner",
        status="active",
    )
    db.add(member)

    # Seed default categories
    for cat_name in DEFAULT_CATEGORIES:
        category = Category(
            household_id=household.id,
            name=cat_name,
            is_default=True,
        )
        db.add(category)

    db.commit()
    db.refresh(household)
    return household


def create_invitation(
    db: Session,
    household_id: int,
    creator_id: int,
    expires_in_days: int = 7,
    max_uses: int = 10,
) -> tuple[HouseholdInvitation, str]:
    """Generate a secure invitation token, hash it, store it, and return (invitation, raw_token)."""
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found",
        )

    # Check that creator is a member of this household (owner or member)
    membership = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == creator_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this household",
        )

    raw_token = generate_invite_token()
    token_hash = hash_invite_token(raw_token)
    expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=expires_in_days)

    invitation = HouseholdInvitation(
        household_id=household_id,
        token_hash=token_hash,
        created_by=creator_id,
        expires_at=expires_at,
        max_uses=max_uses,
        use_count=0,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation, raw_token


def accept_invitation(db: Session, raw_token: str, user_id: int) -> Household:
    """Validate invitation token, check expiry/revocation/capacity, and atomically join user."""
    token_hash = hash_invite_token(raw_token)
    invitation = (
        db.query(HouseholdInvitation)
        .filter(HouseholdInvitation.token_hash == token_hash)
        .first()
    )

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation token",
        )

    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has been revoked",
        )

    now = datetime.now(UTC).replace(tzinfo=None)
    if _to_utc_naive(invitation.expires_at) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired",
        )

    if invitation.use_count >= invitation.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation usage limit reached",
        )

    # Check if user is already a member
    existing_member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == invitation.household_id,
            HouseholdMember.user_id == user_id,
        )
        .first()
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this household",
        )

    # Atomic join
    member = HouseholdMember(
        household_id=invitation.household_id,
        user_id=user_id,
        role="member",
        status="active",
    )
    invitation.use_count += 1

    db.add(member)
    db.commit()

    household = db.query(Household).filter(Household.id == invitation.household_id).first()
    return household


def _validate_membership(db: Session, household_id: int, user_id: int) -> HouseholdMember:
    """Validate that user is an active member of the household."""
    member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
            HouseholdMember.status == "active",
        )
        .first()
    )
    if not member:
        household = db.query(Household).filter(Household.id == household_id).first()
        if household and household.created_by == user_id:
            member = HouseholdMember(
                household_id=household_id,
                user_id=user_id,
                role="owner",
                status="active",
            )
            db.add(member)
            db.commit()
            db.refresh(member)
            return member

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this household",
        )
    return member


def get_household_detail(db: Session, household_id: int, user_id: int) -> Household:
    """Get household details after validating membership."""
    _validate_membership(db, household_id, user_id)
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    return household


def get_household_members(db: Session, household_id: int, user_id: int):
    """List all active members of the household."""
    _validate_membership(db, household_id, user_id)
    from app.models.user import User

    records = (
        db.query(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == "active",
        )
        .all()
    )
    members_list = [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": member.role,
            "status": member.status,
        }
        for member, user in records
    ]

    # Guarantee the current user or household owner appears in the member list
    if not any(m["id"] == user_id for m in members_list):
        current_u = db.query(User).filter(User.id == user_id).first()
        if current_u:
            members_list.insert(0, {
                "id": current_u.id,
                "name": current_u.name,
                "email": current_u.email,
                "role": "owner",
                "status": "active",
            })

    return members_list


CATEGORY_META = {
    "Groceries": {"color": "#10b981", "bg": "rgba(16, 185, 129, 0.16)"},
    "WiFi": {"color": "#06b6d4", "bg": "rgba(6, 182, 212, 0.16)"},
    "Food": {"color": "#f59e0b", "bg": "rgba(245, 158, 11, 0.16)"},
    "Rent": {"color": "#8b5cf6", "bg": "rgba(139, 92, 246, 0.16)"},
    "Transport": {"color": "#38bdf8", "bg": "rgba(56, 189, 248, 0.16)"},
    "Other": {"color": "#94a3b8", "bg": "rgba(148, 163, 184, 0.16)"},
}

MEMBER_COLORS = ["#818cf8", "#34d399", "#c084fc", "#38bdf8", "#f59e0b", "#ec4899"]


def get_household_dashboard(db: Session, household_id: int, user_id: int):
    """Aggregate dashboard metrics: household info, user balance, monthly spend, recent activity, transfers."""
    household = get_household_detail(db, household_id, user_id)
    from app.models.expense import Expense
    from app.models.settlement import Settlement
    from app.services.settlement_service import (
        calculate_household_balances,
        generate_transfer_suggestions,
    )

    # 1. Balances
    balances = calculate_household_balances(db, household_id, user_id)
    user_bal = next((b for b in balances if b.user_id == user_id), None)
    net_paise = user_bal.net_balance_paise if user_bal else 0
    net_balance = round(net_paise / 100.0, 2)

    suggestions = generate_transfer_suggestions(db, household_id, user_id)
    total_owed_to_you = sum(s.amount for s in suggestions if s.to_user_id == user_id)
    total_you_owe = sum(s.amount for s in suggestions if s.from_user_id == user_id)

    # 2. Monthly spend
    now = datetime.now(UTC)
    first_of_month = datetime(now.year, now.month, 1).date()
    # Previous month first day
    if now.month == 1:
        prev_month_first = datetime(now.year - 1, 12, 1).date()
    else:
        prev_month_first = datetime(now.year, now.month - 1, 1).date()

    current_month_expenses = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
            Expense.expense_date >= first_of_month,
        )
        .all()
    )
    prev_month_expenses = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
            Expense.expense_date >= prev_month_first,
            Expense.expense_date < first_of_month,
        )
        .all()
    )

    this_month_paise = sum(e.amount_paise for e in current_month_expenses)
    prev_month_paise = sum(e.amount_paise for e in prev_month_expenses)
    this_month_rupees = round(this_month_paise / 100.0, 2)

    if prev_month_paise > 0:
        change_pct = round(((this_month_paise - prev_month_paise) / prev_month_paise) * 100, 1)
    else:
        change_pct = 0.0

    # 3. Recent activity (combine expenses + settlements)
    recent_expenses = (
        db.query(Expense)
        .filter(Expense.household_id == household_id)
        .order_by(Expense.id.desc())
        .limit(10)
        .all()
    )
    recent_settlements = (
        db.query(Settlement)
        .filter(Settlement.household_id == household_id)
        .order_by(Settlement.id.desc())
        .limit(5)
        .all()
    )

    activities = []
    for exp in recent_expenses:
        cat_name = exp.category.name if exp.category else "Other"
        is_payer = exp.paid_by == user_id
        my_split = next((s for s in exp.splits if s.user_id == user_id), None)

        if is_payer:
            others_share_paise = exp.amount_paise - (my_split.share_paise if my_split else 0)
            lent_amt = round(others_share_paise / 100.0, 2)
            lent_text = f"+₹{lent_amt:,.0f} you lent" if lent_amt > 0 else "you paid"
            is_lent = True
        elif my_split:
            share_amt = round(my_split.share_paise / 100.0, 2)
            lent_text = f"-₹{share_amt:,.0f} your share"
            is_lent = False
        else:
            lent_text = "—"
            is_lent = None

        time_str = exp.expense_date.strftime("%d %b %Y") if exp.expense_date else "Recently"
        activities.append(
            {
                "id": exp.id,
                "type": "expense",
                "title": exp.description,
                "subtitle": cat_name,
                "category": cat_name,
                "time": time_str,
                "total_amount": round(exp.amount_paise / 100.0, 2),
                "lent_or_share": lent_text,
                "is_lent": is_lent,
                "status": exp.status,
                "_timestamp": exp.created_at,
            }
        )

    for st in recent_settlements:
        is_payer = st.payer_id == user_id
        is_receiver = st.receiver_id == user_id
        payer_name = st.payer.name if st.payer else "Roommate"
        receiver_name = st.receiver.name if st.receiver else "Roommate"

        if is_receiver:
            lent_text = f"+₹{st.amount:,.0f} received"
            is_lent = True
        elif is_payer:
            lent_text = f"-₹{st.amount:,.0f} paid"
            is_lent = False
        else:
            lent_text = f"₹{st.amount:,.0f}"
            is_lent = None

        time_str = st.created_at.strftime("%d %b %Y") if st.created_at else "Recently"
        activities.append(
            {
                "id": st.id,
                "type": "settlement",
                "title": f"Settlement: {payer_name} → {receiver_name}",
                "subtitle": f"Status: {st.status.title()}",
                "category": "Settlement",
                "time": time_str,
                "total_amount": round(st.amount_paise / 100.0, 2),
                "lent_or_share": lent_text,
                "is_lent": is_lent,
                "status": st.status,
                "_timestamp": st.created_at,
            }
        )

    # Sort descending by timestamp
    activities.sort(key=lambda a: a["_timestamp"], reverse=True)
    # Strip internal sort key
    clean_activities = [{k: v for k, v in a.items() if k != "_timestamp"} for a in activities[:10]]

    # 4. Formatted Transfer suggestions
    formatted_suggestions = []
    for s in suggestions:
        is_positive = s.to_user_id == user_id
        initial = s.from_user_name[0].upper() if s.from_user_name else "R"
        name = s.from_user_name if is_positive else f"You pay {s.to_user_name}"
        subtext = "pays You" if is_positive else f"to {s.to_user_name}"
        color = "#34d399" if is_positive else "#c084fc"
        bg = "rgba(16, 185, 129, 0.25)" if is_positive else "rgba(139, 92, 246, 0.25)"

        formatted_suggestions.append(
            {
                "id": f"{s.from_user_id}-{s.to_user_id}",
                "initial": initial,
                "avatar_bg": bg,
                "avatar_color": color,
                "name": name,
                "subtext": subtext,
                "amount": s.amount,
                "is_positive": is_positive,
            }
        )

    return {
        "household": household,
        "balance": {
            "net_balance": net_balance,
            "net_paise": net_paise,
            "total_owed_to_you": round(total_owed_to_you, 2),
            "total_you_owe": round(total_you_owe, 2),
        },
        "monthly_spend": {
            "total": this_month_rupees,
            "total_paise": this_month_paise,
            "change_percent": change_pct,
        },
        "recent_activities": clean_activities,
        "suggested_transfers": formatted_suggestions,
    }


def get_household_analytics(db: Session, household_id: int, user_id: int):
    """Compute spending analytics: category breakdown, 6-month trend, and member shares."""
    _validate_membership(db, household_id, user_id)
    from app.models.expense import Expense
    from app.models.user import User

    # Query all active expenses
    expenses = (
        db.query(Expense)
        .filter(Expense.household_id == household_id, Expense.status == "active")
        .all()
    )

    total_paise = sum(e.amount_paise for e in expenses)
    total_rupees = round(total_paise / 100.0, 2)

    # 1. Category breakdown
    cat_totals: dict[str, int] = {}
    for exp in expenses:
        cat_name = exp.category.name if exp.category else "Other"
        cat_totals[cat_name] = cat_totals.get(cat_name, 0) + exp.amount_paise

    category_breakdown = []
    for cat_name, amt_paise in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True):
        amt_rupees = round(amt_paise / 100.0, 2)
        pct = round((amt_paise / total_paise) * 100, 1) if total_paise > 0 else 0
        meta = CATEGORY_META.get(cat_name, CATEGORY_META["Other"])
        category_breakdown.append(
            {
                "label": cat_name,
                "category": cat_name,
                "amount": amt_rupees,
                "percent": pct,
                "color": meta["color"],
                "bg": meta["bg"],
            }
        )

    # 2. Monthly history (last 6 calendar months)
    now = datetime.now(UTC)
    months = []
    for i in range(5, -1, -1):
        # Calculate month date
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append((y, m))

    month_totals: list[dict] = []
    max_month_amt = 1
    for y, m in months:
        m_name = datetime(y, m, 1).strftime("%b")
        m_expenses = [
            e for e in expenses
            if e.expense_date and e.expense_date.year == y and e.expense_date.month == m
        ]
        m_total = sum(e.amount_paise for e in m_expenses) / 100.0
        max_month_amt = max(max_month_amt, m_total)
        month_totals.append({
            "month": m_name,
            "amount": round(m_total, 2),
            "is_current": (y == now.year and m == now.month),
        })

    monthly_history = [
        {
            "month": mt["month"],
            "amount": mt["amount"],
            "height": max(15, min(100, int((mt["amount"] / max_month_amt) * 100))) if max_month_amt > 0 else 20,
            "current": mt["is_current"],
        }
        for mt in month_totals
    ]

    # 3. Member shares
    members = (
        db.query(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .filter(HouseholdMember.household_id == household_id, HouseholdMember.status == "active")
        .all()
    )

    member_shares = []
    for idx, (hm, user) in enumerate(members):
        paid_paise = sum(e.amount_paise for e in expenses if e.paid_by == user.id)
        consumed_paise = 0
        for e in expenses:
            for s in e.splits:
                if s.user_id == user.id:
                    consumed_paise += s.share_paise

        paid = round(paid_paise / 100.0, 2)
        consumed = round(consumed_paise / 100.0, 2)
        net = round(paid - consumed, 2)
        color = MEMBER_COLORS[idx % len(MEMBER_COLORS)]
        initial = user.name[0].upper() if user.name else "U"

        member_shares.append(
            {
                "member_id": user.id,
                "name": f"{user.name} (You)" if user.id == user_id else user.name,
                "paid": paid,
                "consumed": consumed,
                "net": net,
                "color": color,
                "initial": initial,
            }
        )

    time_range_str = datetime.now(UTC).strftime("%B %Y")
    return {
        "household_id": household_id,
        "time_range": time_range_str,
        "total_spend_rupees": total_rupees,
        "category_breakdown": category_breakdown,
        "monthly_history": monthly_history,
        "member_shares": member_shares,
    }

