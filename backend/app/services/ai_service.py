import calendar
import json
import logging
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.expense import Category, Expense
from app.models.household import Household, HouseholdMember
from app.models.user import User
from app.schemas.ai import (
    ChatRequest,
    ChatResponse,
    CompareMonthlySpendingArgs,
    ExpenseDraft,
    ExpenseDraftSplit,
    GetCategoryBreakdownArgs,
    GetExpenseSummaryArgs,
    GetHouseholdBalancesArgs,
    GetMemberBalanceArgs,
    ProposeExpenseArgs,
)
from app.services.expense_service import calculate_equal_split
from app.services.settlement_service import (
    _validate_household_membership,
    calculate_household_balances,
    generate_transfer_suggestions,
    get_balance_breakdown,
)

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "january": 1, "jan": 1, "1": 1, "01": 1,
    "february": 2, "feb": 2, "2": 2, "02": 2,
    "march": 3, "mar": 3, "3": 3, "03": 3,
    "april": 4, "apr": 4, "4": 4, "04": 4,
    "may": 5, "5": 5, "05": 5,
    "june": 6, "jun": 6, "6": 6, "06": 6,
    "july": 7, "jul": 7, "7": 7, "07": 7,
    "august": 8, "aug": 8, "8": 8, "08": 8,
    "september": 9, "sep": 9, "9": 9, "09": 9,
    "october": 10, "oct": 10, "10": 10,
    "november": 11, "nov": 11, "11": 11,
    "december": 12, "dec": 12, "12": 12,
}


def format_inr(paise: int) -> str:
    """Format paise into Indian Rupee string."""
    rupees = abs(paise) / 100
    sign = "-" if paise < 0 else ""
    if paise % 100 == 0:
        return f"{sign}₹{int(rupees):,}"
    return f"{sign}₹{rupees:,.2f}"


def parse_flexible_date(val: str | date | None) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    try:
        return datetime.strptime(val.strip(), "%Y-%m-%d").date()
    except ValueError:
        try:
            return datetime.fromisoformat(val.strip()).date()
        except ValueError:
            return None


def parse_month_spec(month_str: str, explicit_year: int | None = None) -> tuple[int, int]:
    """Parse month representation into (year, month)."""
    clean = month_str.strip().lower()
    today = date.today()
    default_year = explicit_year or today.year

    if "-" in clean:
        parts = clean.split("-")
        if len(parts) == 2:
            try:
                y = int(parts[0])
                m = int(parts[1])
                return y, m
            except ValueError:
                pass

    if clean in MONTH_MAP:
        return default_year, MONTH_MAP[clean]

    for name, num in MONTH_MAP.items():
        if name in clean:
            return default_year, num

    raise ValueError(f"Unable to parse month: '{month_str}'")


# --- Approved Anthropic Tool Definitions ---

APPROVED_TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_expense_summary",
        "description": "Get total spending by optional date range (YYYY-MM-DD) and optional category name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format (optional)",
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (optional)",
                },
                "category": {
                    "type": "string",
                    "description": "Category name filter, e.g. Food, Groceries, Utilities (optional)",
                },
            },
        },
    },
    {
        "name": "get_member_balance",
        "description": "Get the net balance and itemized breakdown of contributing expenses/settlements for a household member.",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {
                    "type": "integer",
                    "description": "User ID of the member (optional if member_name provided)",
                },
                "member_name": {
                    "type": "string",
                    "description": "Name of the member, or 'me'/'myself' (optional if member_id provided)",
                },
            },
        },
    },
    {
        "name": "get_household_balances",
        "description": "Get net balance standings for all household members and greedy transfer suggestions.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "compare_monthly_spending",
        "description": "Compare spending between Month A and Month B, with percentage change and per-category differences.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month_a": {
                    "type": "string",
                    "description": "First month (e.g. 'September', '2026-09')",
                },
                "month_b": {
                    "type": "string",
                    "description": "Second month (e.g. 'October', '2026-10')",
                },
                "year_a": {
                    "type": "integer",
                    "description": "Year for month A (defaults to current year)",
                },
                "year_b": {
                    "type": "integer",
                    "description": "Year for month B (defaults to current year)",
                },
            },
            "required": ["month_a", "month_b"],
        },
    },
    {
        "name": "get_category_breakdown",
        "description": "Get spending breakdown per category for a date range or specific month.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format",
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format",
                },
                "month": {
                    "type": "string",
                    "description": "Month name or number, e.g. 'October' or '10'",
                },
                "year": {
                    "type": "integer",
                    "description": "Year (e.g. 2026)",
                },
            },
        },
    },
    {
        "name": "propose_expense",
        "description": "Draft a proposed expense for user confirmation. Does NOT save to database. Use whenever the user asks to add, record, or split an expense.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount in rupees (e.g. 800 or 1500.50)",
                },
                "amount_paise": {
                    "type": "integer",
                    "description": "Amount in paise (e.g. 80000 for ₹800)",
                },
                "description": {
                    "type": "string",
                    "description": "Description of the expense (e.g. 'Groceries at Nature Basket')",
                },
                "category": {
                    "type": "string",
                    "description": "Category name (e.g. Groceries, Food, Utilities)",
                },
                "paid_by": {
                    "type": "string",
                    "description": "Who paid: 'me', or member name, or user ID",
                },
                "split_type": {
                    "type": "string",
                    "enum": ["equal", "exact"],
                    "description": "Split type (defaults to 'equal')",
                },
                "split_members": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of member names or IDs to split among (optional, defaults to all active members)",
                },
                "expense_date": {
                    "type": "string",
                    "description": "Date of expense in YYYY-MM-DD format (defaults to today)",
                },
            },
            "required": ["description"],
        },
    },
]


# --- Helper: Member Resolution & Household Authorization ---

def get_active_household_members(db: Session, household_id: int) -> list[tuple[HouseholdMember, User]]:
    return (
        db.query(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == "active",
        )
        .all()
    )


def resolve_member_in_household(
    db: Session,
    household_id: int,
    member_id: int | None = None,
    member_name: str | None = None,
    actor_id: int | None = None,
) -> User:
    """
    Finds a member strictly within the household.
    Rejects any member ID or name outside the household.
    """
    members = get_active_household_members(db, household_id)
    id_map = {user.id: user for _, user in members}
    name_map = {user.name.strip().lower(): user for _, user in members}

    if (
        member_name
        and str(member_name).strip().lower() in ("me", "myself", "i", "self")
        and actor_id
        and actor_id in id_map
    ):
        return id_map[actor_id]

    if member_id is not None:
        try:
            int_id = int(member_id)
            if int_id in id_map:
                return id_map[int_id]
            raise ValueError(f"Member with ID {member_id} is not an active member of this household")
        except (TypeError, ValueError) as err:
            if "not an active member" in str(err):
                raise
            # If member_id was passed as string name
            member_name = str(member_id)

    if member_name:
        clean = member_name.strip().lower()
        if clean in name_map:
            return name_map[clean]
        # Partial match on first/last name
        matches = [user for name, user in name_map.items() if clean in name or name in clean]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            return matches[0]
        raise ValueError(f"Member '{member_name}' is not an active member of this household")

    if actor_id and actor_id in id_map:
        return id_map[actor_id]

    raise ValueError("No member specified and could not resolve default actor")


# --- Tool Implementations ---

def tool_get_expense_summary(
    db: Session,
    household_id: int,
    args: GetExpenseSummaryArgs,
) -> dict[str, Any]:
    query = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
        )
    )

    start_d = parse_flexible_date(args.start_date)
    end_d = parse_flexible_date(args.end_date)
    if start_d:
        query = query.filter(Expense.expense_date >= start_d)
    if end_d:
        query = query.filter(Expense.expense_date <= end_d)

    category_name = None
    if args.category:
        category_name = args.category.strip()
        query = query.join(Category, Expense.category_id == Category.id, isouter=True).filter(
            Category.name.ilike(f"%{category_name}%")
        )

    expenses = query.order_by(Expense.expense_date.desc()).all()
    total_paise = sum(e.amount_paise for e in expenses)

    # Sub-breakdown by category
    cat_totals: dict[str, int] = {}
    for exp in expenses:
        c_name = exp.category.name if exp.category else "Other"
        cat_totals[c_name] = cat_totals.get(c_name, 0) + exp.amount_paise

    return {
        "household_id": household_id,
        "total_amount_paise": total_paise,
        "total_amount_formatted": format_inr(total_paise),
        "expense_count": len(expenses),
        "category_filter": category_name,
        "date_range": {
            "start": start_d.isoformat() if start_d else None,
            "end": end_d.isoformat() if end_d else None,
        },
        "category_breakdown": [
            {
                "category": name,
                "amount_paise": amt,
                "amount_formatted": format_inr(amt),
            }
            for name, amt in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)
        ],
    }


def tool_get_member_balance(
    db: Session,
    household_id: int,
    actor_id: int,
    args: GetMemberBalanceArgs,
) -> dict[str, Any]:
    member = resolve_member_in_household(
        db,
        household_id,
        member_id=args.member_id,
        member_name=args.member_name,
        actor_id=actor_id,
    )

    breakdown_data = get_balance_breakdown(db, household_id, member.id, actor_id)

    status_str = "settled"
    if breakdown_data.net_balance_paise > 0:
        status_str = "owed"
    elif breakdown_data.net_balance_paise < 0:
        status_str = "owes"

    items_summary = []
    for item in breakdown_data.items:
        items_summary.append({
            "type": item.type,
            "title": item.description,
            "amount_paise": item.effect_paise,
            "amount_formatted": format_inr(item.effect_paise),
            "date": item.date,
            "counterparty": item.other_party,
        })

    return {
        "member_id": member.id,
        "member_name": member.name,
        "net_balance_paise": breakdown_data.net_balance_paise,
        "net_balance_formatted": format_inr(breakdown_data.net_balance_paise),
        "status": status_str,
        "breakdown_items": items_summary,
    }


def tool_get_household_balances(
    db: Session,
    household_id: int,
    actor_id: int,
) -> dict[str, Any]:
    balances = calculate_household_balances(db, household_id, actor_id)
    suggestions = generate_transfer_suggestions(db, household_id, actor_id)

    return {
        "household_id": household_id,
        "members": [
            {
                "user_id": b.user_id,
                "name": b.name,
                "net_balance_paise": b.net_balance_paise,
                "net_balance_formatted": format_inr(b.net_balance_paise),
                "status": "owed" if b.net_balance_paise > 0 else "owes" if b.net_balance_paise < 0 else "settled",
            }
            for b in balances
        ],
        "transfer_suggestions": [
            {
                "from_user_id": s.from_user_id,
                "from_user_name": s.from_user_name,
                "to_user_id": s.to_user_id,
                "to_user_name": s.to_user_name,
                "amount_paise": s.amount_paise,
                "amount_formatted": format_inr(s.amount_paise),
            }
            for s in suggestions
        ],
    }


def tool_compare_monthly_spending(
    db: Session,
    household_id: int,
    args: CompareMonthlySpendingArgs,
) -> dict[str, Any]:
    year_a, month_a = parse_month_spec(args.month_a, args.year_a)
    year_b, month_b = parse_month_spec(args.month_b, args.year_b)

    last_day_a = calendar.monthrange(year_a, month_a)[1]
    start_a = date(year_a, month_a, 1)
    end_a = date(year_a, month_a, last_day_a)

    last_day_b = calendar.monthrange(year_b, month_b)[1]
    start_b = date(year_b, month_b, 1)
    end_b = date(year_b, month_b, last_day_b)

    expenses_a = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
            Expense.expense_date >= start_a,
            Expense.expense_date <= end_a,
        )
        .all()
    )

    expenses_b = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
            Expense.expense_date >= start_b,
            Expense.expense_date <= end_b,
        )
        .all()
    )

    total_a = sum(e.amount_paise for e in expenses_a)
    total_b = sum(e.amount_paise for e in expenses_b)

    cat_a: dict[str, int] = {}
    for e in expenses_a:
        c_name = e.category.name if e.category else "Other"
        cat_a[c_name] = cat_a.get(c_name, 0) + e.amount_paise

    cat_b: dict[str, int] = {}
    for e in expenses_b:
        c_name = e.category.name if e.category else "Other"
        cat_b[c_name] = cat_b.get(c_name, 0) + e.amount_paise

    all_categories = sorted(set(cat_a.keys()) | set(cat_b.keys()))
    diff_paise = total_b - total_a

    pct_change: float | None = None
    if total_a > 0:
        pct_change = round(((total_b - total_a) / total_a) * 100, 1)

    category_diffs = []
    for cat in all_categories:
        amt_a = cat_a.get(cat, 0)
        amt_b = cat_b.get(cat, 0)
        c_diff = amt_b - amt_a
        category_diffs.append({
            "category": cat,
            "month_a_amount_paise": amt_a,
            "month_a_formatted": format_inr(amt_a),
            "month_b_amount_paise": amt_b,
            "month_b_formatted": format_inr(amt_b),
            "diff_paise": c_diff,
            "diff_formatted": format_inr(c_diff),
        })

    category_diffs.sort(key=lambda x: abs(x["diff_paise"]), reverse=True)

    month_a_name = f"{calendar.month_name[month_a]} {year_a}"
    month_b_name = f"{calendar.month_name[month_b]} {year_b}"

    return {
        "month_a": month_a_name,
        "month_a_total_paise": total_a,
        "month_a_total_formatted": format_inr(total_a),
        "month_b": month_b_name,
        "month_b_total_paise": total_b,
        "month_b_total_formatted": format_inr(total_b),
        "diff_paise": diff_paise,
        "diff_formatted": format_inr(diff_paise),
        "percentage_change": pct_change,
        "category_differences": category_diffs,
    }


def tool_get_category_breakdown(
    db: Session,
    household_id: int,
    args: GetCategoryBreakdownArgs,
) -> dict[str, Any]:
    query = (
        db.query(Expense)
        .filter(
            Expense.household_id == household_id,
            Expense.status == "active",
        )
    )

    if args.month:
        y, m = parse_month_spec(args.month, args.year)
        last_day = calendar.monthrange(y, m)[1]
        start_d = date(y, m, 1)
        end_d = date(y, m, last_day)
    else:
        start_d = parse_flexible_date(args.start_date)
        end_d = parse_flexible_date(args.end_date)

    if start_d:
        query = query.filter(Expense.expense_date >= start_d)
    if end_d:
        query = query.filter(Expense.expense_date <= end_d)

    expenses = query.all()
    total_paise = sum(e.amount_paise for e in expenses)

    cat_map: dict[str, dict[str, Any]] = {}
    for exp in expenses:
        c_name = exp.category.name if exp.category else "Other"
        if c_name not in cat_map:
            cat_map[c_name] = {"category": c_name, "total_paise": 0, "count": 0}
        cat_map[c_name]["total_paise"] += exp.amount_paise
        cat_map[c_name]["count"] += 1

    breakdown = []
    for item in sorted(cat_map.values(), key=lambda x: x["total_paise"], reverse=True):
        pct = round((item["total_paise"] / total_paise * 100), 1) if total_paise > 0 else 0.0
        breakdown.append({
            "category": item["category"],
            "amount_paise": item["total_paise"],
            "amount_formatted": format_inr(item["total_paise"]),
            "count": item["count"],
            "percentage": pct,
        })

    return {
        "household_id": household_id,
        "total_amount_paise": total_paise,
        "total_amount_formatted": format_inr(total_paise),
        "categories": breakdown,
    }


def tool_propose_expense(
    db: Session,
    household_id: int,
    actor_id: int,
    args: ProposeExpenseArgs,
) -> tuple[dict[str, Any], ExpenseDraft]:
    """
    Draft an expense without saving to the DB.
    Strictly validates member references and split balance.
    """
    # 1. Resolve amount in paise
    if args.amount_paise is not None and args.amount_paise > 0:
        amount_paise = args.amount_paise
    elif args.amount is not None and args.amount > 0:
        amount_paise = round(args.amount * 100)
    else:
        raise ValueError("Expense amount must be greater than zero")

    # 2. Resolve payer (strictly within household)
    payer = resolve_member_in_household(
        db,
        household_id,
        member_name=str(args.paid_by) if args.paid_by is not None else "me",
        actor_id=actor_id,
    )

    # 3. Resolve participant members (strictly within household)
    all_members = get_active_household_members(db, household_id)
    if not all_members:
        raise ValueError("No active members found in this household")

    participant_users: list[User] = []
    if args.split_members:
        for m_ident in args.split_members:
            u = resolve_member_in_household(
                db,
                household_id,
                member_name=str(m_ident),
                actor_id=actor_id,
            )
            if u not in participant_users:
                participant_users.append(u)
    else:
        participant_users = [u for _, u in all_members]

    if not participant_users:
        raise ValueError("At least one active household participant is required")

    participant_ids = [u.id for u in participant_users]
    id_to_user = {u.id: u for u in participant_users}

    # 4. Resolve Category (find existing or assign Other)
    cat_name = (args.category or "Other").strip()
    category = (
        db.query(Category)
        .filter(
            Category.household_id == household_id,
            Category.name.ilike(cat_name),
        )
        .first()
    )
    category_id = category.id if category else None
    resolved_cat_name = category.name if category else cat_name

    # 5. Calculate splits
    split_type = args.split_type.lower()
    if split_type == "equal":
        share_map = calculate_equal_split(amount_paise, payer.id, participant_ids)
    elif split_type == "exact" and args.custom_splits:
        share_map = {}
        for k, v in args.custom_splits.items():
            u = resolve_member_in_household(db, household_id, member_name=str(k), actor_id=actor_id)
            share_map[u.id] = int(v)
        if sum(share_map.values()) != amount_paise:
            raise ValueError(f"Custom splits sum ({sum(share_map.values())}) does not match total {amount_paise}")
    else:
        share_map = calculate_equal_split(amount_paise, payer.id, participant_ids)
        split_type = "equal"

    draft_splits = [
        ExpenseDraftSplit(
            user_id=uid,
            user_name=id_to_user[uid].name,
            share_paise=share,
        )
        for uid, share in share_map.items()
    ]

    exp_date = parse_flexible_date(args.expense_date) or date.today()

    draft = ExpenseDraft(
        amount_paise=amount_paise,
        description=args.description.strip(),
        category_name=resolved_cat_name,
        category_id=category_id,
        paid_by_id=payer.id,
        paid_by_name=payer.name,
        split_type=split_type,
        splits=draft_splits,
        expense_date=exp_date.isoformat(),
    )

    tool_result = {
        "status": "draft_created",
        "saved_to_db": False,
        "message": "Expense draft prepared. Confirmation required before saving to ledger.",
        "amount_formatted": format_inr(amount_paise),
        "amount_paise": amount_paise,
        "description": draft.description,
        "category": draft.category_name,
        "paid_by": draft.paid_by_name,
        "split_type": draft.split_type,
        "participant_count": len(draft.splits),
        "splits": [
            {
                "user_name": s.user_name,
                "share_formatted": format_inr(s.share_paise),
                "share_paise": s.share_paise,
            }
            for s in draft.splits
        ],
    }

    return tool_result, draft


# --- Central Tool Dispatcher ---

def execute_authorized_tool(
    name: str,
    raw_args: dict[str, Any],
    db: Session,
    household_id: int,
    actor_id: int,
) -> tuple[dict[str, Any], ExpenseDraft | None]:
    """
    Strictly validates arguments with Pydantic and executes within household boundary.
    """
    _validate_household_membership(db, household_id, actor_id)

    draft: ExpenseDraft | None = None

    if name == "get_expense_summary":
        args = GetExpenseSummaryArgs.model_validate(raw_args)
        result = tool_get_expense_summary(db, household_id, args)

    elif name == "get_member_balance":
        args = GetMemberBalanceArgs.model_validate(raw_args)
        result = tool_get_member_balance(db, household_id, actor_id, args)

    elif name == "get_household_balances":
        GetHouseholdBalancesArgs.model_validate(raw_args)
        result = tool_get_household_balances(db, household_id, actor_id)

    elif name == "compare_monthly_spending":
        args = CompareMonthlySpendingArgs.model_validate(raw_args)
        result = tool_compare_monthly_spending(db, household_id, args)

    elif name == "get_category_breakdown":
        args = GetCategoryBreakdownArgs.model_validate(raw_args)
        result = tool_get_category_breakdown(db, household_id, args)

    elif name == "propose_expense":
        args = ProposeExpenseArgs.model_validate(raw_args)
        result, draft = tool_propose_expense(db, household_id, actor_id, args)

    else:
        raise ValueError(f"Unapproved or unknown tool: '{name}'")

    return result, draft


# --- LLM Adapter & Orchestration ---

class AIService:
    """
    LLM Adapter wrapping Anthropic Claude.
    Swap-friendly — rest of application never imports Anthropic SDK directly.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key if api_key is not None else settings.LLM_API_KEY
        self.model = model if model else (settings.LLM_MODEL or "claude-sonnet-4-6")

    def _build_system_prompt(self, db: Session, household_id: int, actor_id: int) -> str:
        household = db.query(Household).filter(Household.id == household_id).first()
        h_name = household.name if household else f"Household #{household_id}"
        currency = household.currency if household else "INR"

        members = get_active_household_members(db, household_id)
        # PII minimized: only user ID and first/last name. NO emails, passwords or auth tokens!
        members_list = [{"id": u.id, "name": u.name} for _, u in members]
        current_user = next((u for _, u in members if u.id == actor_id), None)
        user_name = current_user.name if current_user else f"User #{actor_id}"

        return (
            f"You are the RoomSplit AI Financial Assistant for the household '{h_name}'.\n"
            f"Household Currency: {currency} (symbol: ₹ for INR).\n"
            f"Today's Date: {date.today().isoformat()}.\n"
            f"Current Authenticated User: {user_name} (User ID: {actor_id}).\n"
            f"Active Household Members: {json.dumps(members_list)}.\n\n"
            "CRITICAL OPERATIONAL RULES:\n"
            "1. Ground all answers in REAL household data by calling the approved tools.\n"
            "2. Never hallucinate or assume financial amounts, debts, or historical transactions.\n"
            "3. When the user asks to record, add, or split a new expense, call the 'propose_expense' tool.\n"
            "   State clearly that the proposed expense has been drafted and requires their confirmation to save.\n"
            "4. Keep explanations concise, professional, friendly, and structured with clean markdown.\n"
            "5. If a tool reports that a member is not in the household, inform the user clearly.\n"
            "6. When comparing months, highlight overall total difference, percentage change, and standout category shifts.\n"
        )

    def process_chat(
        self,
        db: Session,
        household_id: int,
        actor_id: int,
        request: ChatRequest,
    ) -> ChatResponse:
        """
        Orchestrates Anthropic Claude request with function calling / tools loop.
        """
        _validate_household_membership(db, household_id, actor_id)

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is not configured (missing LLM API key).",
            )

        try:
            import anthropic
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Anthropic SDK is not installed.",
            )

        system_prompt = self._build_system_prompt(db, household_id, actor_id)

        # Build message history for Claude
        messages: list[dict[str, Any]] = []
        for msg in request.conversation_history[-8:]:  # limit context window
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": request.message})

        client = anthropic.Anthropic(
            api_key=self.api_key,
            timeout=25.0,
            max_retries=2,
        )

        executed_tools: list[str] = []
        final_draft: ExpenseDraft | None = None

        try:
            # Step 1: Initial call to Claude
            response = client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
                tools=APPROVED_TOOLS,
            )

            # Check if Claude requested tool calls
            tool_calls = [c for c in response.content if c.type == "tool_use"]

            if not tool_calls:
                reply_text = "".join(c.text for c in response.content if c.type == "text")
                return ChatResponse(
                    reply=reply_text or "How can I assist you with your household expenses?",
                    draft_expense=None,
                    tool_calls=[],
                )

            # Step 2: Execute requested tools securely
            tool_results_content: list[dict[str, Any]] = []

            for call in tool_calls:
                executed_tools.append(call.name)
                try:
                    tool_res, draft = execute_authorized_tool(
                        name=call.name,
                        raw_args=call.input,
                        db=db,
                        household_id=household_id,
                        actor_id=actor_id,
                    )
                    if draft:
                        final_draft = draft
                    content_str = json.dumps(tool_res)
                except Exception as err:  # noqa: BLE001
                    logger.warning(f"Tool {call.name} execution error: {err}")
                    content_str = json.dumps({"error": str(err)})

                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": content_str,
                })

            # Step 3: Return tool results back to Claude for natural language explanation
            follow_up_messages = list(messages)
            follow_up_messages.append({"role": "assistant", "content": response.content})
            follow_up_messages.append({"role": "user", "content": tool_results_content})

            second_response = client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                messages=follow_up_messages,
                tools=APPROVED_TOOLS,
            )

            reply_text = "".join(c.text for c in second_response.content if c.type == "text")

            return ChatResponse(
                reply=reply_text or "I have processed your request.",
                draft_expense=final_draft,
                tool_calls=executed_tools,
            )

        except anthropic.APITimeoutError as err:
            logger.error(f"Claude API timeout: {err}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="AI service timed out while processing your request. Please try again.",
            )
        except anthropic.APIConnectionError as err:
            logger.error(f"Claude connection error: {err}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach AI service provider. Please check network connection.",
            )
        except anthropic.APIStatusError as err:
            logger.error(f"Claude API status error {err.status_code}: {err.message}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI service provider returned an error: {err.message}",
            )
        except HTTPException:
            raise
        except Exception as err:
            logger.exception("Unexpected AI service error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI assistant error: {err!s}",
            )


# Default singleton instance
ai_service = AIService()
