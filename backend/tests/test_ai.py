from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.ai import ai_rate_limiter
from app.models.expense import Category, Expense, ExpenseSplit
from app.models.household import Household, HouseholdMember
from app.models.user import User
from app.schemas.ai import (
    ChatRequest,
    CompareMonthlySpendingArgs,
    GetCategoryBreakdownArgs,
    GetExpenseSummaryArgs,
    GetMemberBalanceArgs,
    ProposeExpenseArgs,
)
from app.services.ai_service import (
    AIService,
    resolve_member_in_household,
    tool_compare_monthly_spending,
    tool_get_category_breakdown,
    tool_get_expense_summary,
    tool_get_household_balances,
    tool_get_member_balance,
    tool_propose_expense,
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


def _add_member(db, household_id: int, user: User) -> HouseholdMember:
    member = HouseholdMember(household_id=household_id, user_id=user.id, role="member", status="active")
    db.add(member)
    db.commit()
    return member


def _create_expense(
    db,
    household_id: int,
    payer_id: int,
    amount_paise: int,
    desc: str,
    exp_date: date,
    category_name: str = "Groceries",
    split_user_ids: list[int] | None = None,
) -> Expense:
    cat = db.query(Category).filter(Category.household_id == household_id, Category.name == category_name).first()
    if not cat:
        cat = Category(household_id=household_id, name=category_name, is_default=False)
        db.add(cat)
        db.commit()
        db.refresh(cat)

    exp = Expense(
        household_id=household_id,
        paid_by=payer_id,
        category_id=cat.id,
        amount_paise=amount_paise,
        description=desc,
        expense_date=exp_date,
        split_type="equal",
        status="active",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    participants = split_user_ids or [payer_id]
    n = len(participants)
    share = amount_paise // n
    remainder = amount_paise % n

    for i, uid in enumerate(participants):
        p_share = share + (remainder if i == 0 else 0)
        split = ExpenseSplit(expense_id=exp.id, user_id=uid, share_paise=p_share)
        db.add(split)
    db.commit()
    return exp


# ==============================================================================
# Step 2 Approved Tools Validation & Execution Tests
# ==============================================================================

def test_get_expense_summary_matches_db_totals(db):
    """Test get_expense_summary returns exact spending totals matching DB."""
    owner = _create_user(db, "Alex Morgan", "alex@test.com")
    roommate = _create_user(db, "Raj Sharma", "raj@test.com")
    h = _create_household(db, "Baker St", owner)
    _add_member(db, h.id, roommate)

    # Add 2 expenses in Oct 2026: Groceries ₹1,800 (180000 paise) and Dining ₹2,400 (240000 paise)
    _create_expense(db, h.id, owner.id, 180000, "Nature Basket Groceries", date(2026, 10, 5), "Groceries", [owner.id, roommate.id])
    _create_expense(db, h.id, roommate.id, 240000, "Swiggy Dining", date(2026, 10, 15), "Dining Out", [owner.id, roommate.id])

    # Add 1 expense in Sept 2026: Rent ₹10,000 (1000000 paise)
    _create_expense(db, h.id, owner.id, 1000000, "Rent Payment", date(2026, 9, 1), "Rent", [owner.id, roommate.id])

    # 1. Total October spending
    args = GetExpenseSummaryArgs(start_date="2026-10-01", end_date="2026-10-31")
    result = tool_get_expense_summary(db, h.id, args)
    assert result["total_amount_paise"] == 420000
    assert result["total_amount_formatted"] == "₹4,200"
    assert result["expense_count"] == 2

    # 2. Category filtered spending
    cat_args = GetExpenseSummaryArgs(start_date="2026-10-01", end_date="2026-10-31", category="Groceries")
    cat_result = tool_get_expense_summary(db, h.id, cat_args)
    assert cat_result["total_amount_paise"] == 180000
    assert cat_result["total_amount_formatted"] == "₹1,800"
    assert cat_result["expense_count"] == 1


def test_get_member_balance_and_breakdown(db):
    """Test get_member_balance returns correct net balance and items."""
    owner = _create_user(db, "Alex Morgan", "alex_bal@test.com")
    raj = _create_user(db, "Raj Sharma", "raj_bal@test.com")
    h = _create_household(db, "Baker St", owner)
    _add_member(db, h.id, raj)

    # Raj pays 70000 paise (₹700) split equally with Alex
    _create_expense(db, h.id, raj.id, 70000, "Electricity Bill", date(2026, 10, 10), "Utilities", [owner.id, raj.id])

    args = GetMemberBalanceArgs(member_name="Raj")
    result = tool_get_member_balance(db, h.id, owner.id, args)

    assert result["member_id"] == raj.id
    assert result["member_name"] == "Raj Sharma"
    assert result["net_balance_paise"] == 35000  # Raj is owed ₹350
    assert result["status"] == "owed"
    assert len(result["breakdown_items"]) >= 1


def test_get_household_balances(db):
    """Test get_household_balances aggregates all members and includes transfer suggestions."""
    owner = _create_user(db, "Alex Morgan", "alex_hb@test.com")
    raj = _create_user(db, "Raj Sharma", "raj_hb@test.com")
    samir = _create_user(db, "Samir Patel", "samir_hb@test.com")
    h = _create_household(db, "Baker St", owner)
    _add_member(db, h.id, raj)
    _add_member(db, h.id, samir)

    # Alex pays 30000 paise (₹300) split equally among Alex, Raj, Samir
    _create_expense(db, h.id, owner.id, 30000, "Internet", date(2026, 10, 1), "Utilities", [owner.id, raj.id, samir.id])

    result = tool_get_household_balances(db, h.id, owner.id)
    assert len(result["members"]) == 3
    # Invariant: sum of member net balances == 0
    total = sum(m["net_balance_paise"] for m in result["members"])
    assert total == 0
    assert len(result["transfer_suggestions"]) >= 1


def test_compare_monthly_spending(db):
    """Test compare_monthly_spending calculates delta, percent change, and category shifts."""
    owner = _create_user(db, "Alex Morgan", "alex_cmp@test.com")
    h = _create_household(db, "Baker St", owner)

    # Sept: ₹10,500 total (1050000 paise), Dining: ₹1,200 (120000 paise)
    _create_expense(db, h.id, owner.id, 930000, "Sept Rent", date(2026, 9, 2), "Rent")
    _create_expense(db, h.id, owner.id, 120000, "Sept Cafe", date(2026, 9, 10), "Dining Out")

    # Oct: ₹12,400 total (1240000 paise), Dining: ₹2,400 (240000 paise) (Dining up by ₹1,200)
    _create_expense(db, h.id, owner.id, 1000000, "Oct Rent", date(2026, 10, 2), "Rent")
    _create_expense(db, h.id, owner.id, 240000, "Oct Restaurant", date(2026, 10, 12), "Dining Out")

    args = CompareMonthlySpendingArgs(month_a="September", month_b="October", year_a=2026, year_b=2026)
    result = tool_compare_monthly_spending(db, h.id, args)

    assert result["month_a_total_paise"] == 1050000
    assert result["month_b_total_paise"] == 1240000
    assert result["diff_paise"] == 190000
    assert result["diff_formatted"] == "₹1,900"
    assert result["percentage_change"] == 18.1

    # Check category differences: Dining Out increased by ₹1,200 (120000 paise)
    dining_diff = next(c for c in result["category_differences"] if c["category"] == "Dining Out")
    assert dining_diff["diff_paise"] == 120000
    assert dining_diff["diff_formatted"] == "₹1,200"


def test_get_category_breakdown(db):
    """Test get_category_breakdown groups and sorts spending by category."""
    owner = _create_user(db, "Alex Morgan", "alex_cat@test.com")
    h = _create_household(db, "Baker St", owner)

    _create_expense(db, h.id, owner.id, 50000, "Groceries 1", date(2026, 10, 1), "Groceries")
    _create_expense(db, h.id, owner.id, 50000, "Groceries 2", date(2026, 10, 2), "Groceries")
    _create_expense(db, h.id, owner.id, 25000, "Electricity", date(2026, 10, 3), "Utilities")

    args = GetCategoryBreakdownArgs(month="October", year=2026)
    result = tool_get_category_breakdown(db, h.id, args)

    assert result["total_amount_paise"] == 125000
    assert result["total_amount_formatted"] == "₹1,250"
    categories = result["categories"]
    assert categories[0]["category"] == "Groceries"
    assert categories[0]["amount_paise"] == 100000
    assert categories[0]["percentage"] == 80.0
    assert categories[1]["category"] == "Utilities"
    assert categories[1]["percentage"] == 20.0


# ==============================================================================
# Step 4 Expense Draft Flow & Safety Rules Tests
# ==============================================================================

def test_propose_expense_never_saves_to_db(db):
    """Test acceptance criterion: propose_expense never saves without user confirmation."""
    owner = _create_user(db, "Alex Morgan", "alex_prop@test.com")
    raj = _create_user(db, "Raj Sharma", "raj_prop@test.com")
    h = _create_household(db, "Baker St", owner)
    _add_member(db, h.id, raj)

    initial_expense_count = db.query(Expense).filter(Expense.household_id == h.id).count()
    assert initial_expense_count == 0

    args = ProposeExpenseArgs(
        amount=800.0,
        description="Groceries at Nature Basket",
        category="Groceries",
        paid_by="me",
        split_type="equal",
    )

    _tool_res, draft = tool_propose_expense(db, h.id, owner.id, args)

    # 1. Draft details are properly computed
    assert draft is not None
    assert draft.amount_paise == 80000
    assert draft.description == "Groceries at Nature Basket"
    assert draft.category_name == "Groceries"
    assert draft.paid_by_id == owner.id
    assert len(draft.splits) == 2
    # ₹800 split equally between 2 members = ₹400 (40000 paise) each
    for s in draft.splits:
        assert s.share_paise == 40000

    # 2. Strict verification: DB remains completely untouched!
    db_count_after = db.query(Expense).filter(Expense.household_id == h.id).count()
    assert db_count_after == 0


def test_out_of_household_member_rejected(db):
    """Test acceptance criterion: Out-of-household member IDs or names in tool calls rejected."""
    owner = _create_user(db, "Alex Morgan", "alex_sec@test.com")
    stranger = _create_user(db, "Intruder User", "intruder@test.com")
    h = _create_household(db, "Baker St", owner)

    # 1. Member lookup for out-of-household ID fails
    with pytest.raises(ValueError, match="not an active member"):
        resolve_member_in_household(db, h.id, member_id=stranger.id, actor_id=owner.id)

    # 2. Member lookup for out-of-household name fails
    with pytest.raises(ValueError, match="not an active member"):
        resolve_member_in_household(db, h.id, member_name="Intruder User", actor_id=owner.id)

    # 3. propose_expense referencing out-of-household participant fails
    prop_args = ProposeExpenseArgs(
        amount=500.0,
        description="Out of household test",
        split_members=["Intruder User"],
    )
    with pytest.raises(ValueError, match="not an active member"):
        tool_propose_expense(db, h.id, owner.id, prop_args)


def test_rate_limit_enforced(client, db):
    """Test acceptance criterion: Rate limit enforced (max 10 requests/min)."""
    owner = _create_user(db, "Rate Limit User", "rl_user@test.com")
    _create_household(db, "RL Apt", owner)

    ai_rate_limiter.reset(owner.id)

    # Call 10 times: should succeed (with mock AI service)
    with patch("app.services.ai_service.ai_service.process_chat") as mock_chat:
        mock_chat.return_value = {
            "reply": "Mock AI reply",
            "draft_expense": None,
            "tool_calls": [],
        }

        # Issue 10 requests
        for _ in range(10):
            ai_rate_limiter.check(owner.id)

        # 11th request must raise 429
        with pytest.raises(HTTPException) as exc_info:
            ai_rate_limiter.check(owner.id)

        assert exc_info.value.status_code == 429
        assert "Rate limit exceeded" in exc_info.value.detail

    ai_rate_limiter.reset(owner.id)


def test_provider_timeout_handled_gracefully(db):
    """Test acceptance criterion: Provider timeout handled gracefully."""
    import anthropic

    service = AIService(api_key="test-api-key")
    owner = _create_user(db, "Timeout User", "timeout@test.com")
    h = _create_household(db, "Timeout Apt", owner)

    with patch("anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.side_effect = anthropic.APITimeoutError(
            request=MagicMock()
        )

        with pytest.raises(HTTPException) as exc_info:
            service.process_chat(
                db=db,
                household_id=h.id,
                actor_id=owner.id,
                request=ChatRequest(message="What did we spend this month?"),
            )

        assert exc_info.value.status_code == 504
        assert "timed out" in exc_info.value.detail.lower()


# ==============================================================================
# End-to-End API Endpoint Tests
# ==============================================================================

def test_api_chat_flow_with_tool_call(client, db):
    """Test full /api/v1/households/{id}/ai/chat flow with mocked Claude tool calling."""
    # Register and login user via API
    client.post("/api/v1/auth/register", json={"name": "Alice", "email": "alice_api@test.com", "password": "password123"})
    login_res = client.post("/api/v1/auth/login", json={"email": "alice_api@test.com", "password": "password123"})
    token = login_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # Create household
    h_res = client.post("/api/v1/households", headers=auth_header, json={"name": "Alice House", "currency": "INR"})
    h_id = h_res.json()["id"]

    # Reset rate limit for clean test
    ai_rate_limiter.reset()

    # Mock Claude message responses:
    # First response: tool_use "propose_expense"
    # Second response: text explanation of draft
    mock_tool_block = MagicMock()
    mock_tool_block.type = "tool_use"
    mock_tool_block.id = "call_abc123"
    mock_tool_block.name = "propose_expense"
    mock_tool_block.input = {
        "amount": 600.0,
        "description": "Internet Router",
        "category": "Utilities",
        "paid_by": "me",
        "split_type": "equal",
    }

    first_claude_resp = MagicMock()
    first_claude_resp.content = [mock_tool_block]

    second_claude_resp = MagicMock()
    mock_text_block = MagicMock()
    mock_text_block.type = "text"
    mock_text_block.text = "Here's the expense draft:\nAmount: ₹600 | Category: Utilities\nPaid by: You | Split: Equal\n[Confirm] [Cancel]"
    second_claude_resp.content = [mock_text_block]

    with patch("app.core.config.settings.LLM_API_KEY", "dummy-key"), \
         patch("anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.side_effect = [first_claude_resp, second_claude_resp]

        chat_res = client.post(
            f"/api/v1/households/{h_id}/ai/chat",
            headers=auth_header,
            json={"message": "I paid ₹600 for internet, split equally"},
        )

        assert chat_res.status_code == 200
        data = chat_res.json()
        assert "Internet Router" in data["reply"] or "draft" in data["reply"]
        assert "propose_expense" in data["tool_calls"]
        assert data["draft_expense"] is not None
        assert data["draft_expense"]["amount_paise"] == 60000
        assert data["draft_expense"]["category_name"] == "Utilities"

        # Verify database has NOT created any expense yet
        exp_list = client.get(f"/api/v1/households/{h_id}/expenses", headers=auth_header).json()
        assert len(exp_list) == 0


def test_api_chat_forbidden_for_non_member(client, db):
    """Test user cannot chat in a household they do not belong to."""
    # Register user 1
    client.post("/api/v1/auth/register", json={"name": "User 1", "email": "u1_ai@test.com", "password": "password123"})
    tok1 = client.post("/api/v1/auth/login", json={"email": "u1_ai@test.com", "password": "password123"}).json()["access_token"]
    h_res = client.post("/api/v1/households", headers={"Authorization": f"Bearer {tok1}"}, json={"name": "U1 House", "currency": "INR"})
    h_id = h_res.json()["id"]

    # Register user 2 (outsider)
    client.post("/api/v1/auth/register", json={"name": "User 2", "email": "u2_ai@test.com", "password": "password123"})
    tok2 = client.post("/api/v1/auth/login", json={"email": "u2_ai@test.com", "password": "password123"}).json()["access_token"]

    chat_res = client.post(
        f"/api/v1/households/{h_id}/ai/chat",
        headers={"Authorization": f"Bearer {tok2}"},
        json={"message": "Hello"},
    )
    assert chat_res.status_code == 403
