from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[ChatMessage] = Field(default_factory=list)


class ExpenseDraftSplit(BaseModel):
    user_id: int
    user_name: str
    share_paise: int


class ExpenseDraft(BaseModel):
    amount_paise: int
    description: str
    category_name: str = "Other"
    category_id: int | None = None
    paid_by_id: int
    paid_by_name: str
    split_type: str = "equal"
    splits: list[ExpenseDraftSplit] = Field(default_factory=list)
    expense_date: str = Field(default_factory=lambda: date.today().isoformat())


class ChatResponse(BaseModel):
    reply: str
    draft_expense: ExpenseDraft | None = None
    tool_calls: list[str] = Field(default_factory=list)


# --- Strict Tool Input Schemas ---

class GetExpenseSummaryArgs(BaseModel):
    start_date: str | None = Field(default=None, description="Start date in YYYY-MM-DD format")
    end_date: str | None = Field(default=None, description="End date in YYYY-MM-DD format")
    category: str | None = Field(default=None, description="Category name to filter by, e.g. Food, Groceries")


class GetMemberBalanceArgs(BaseModel):
    member_id: int | None = Field(default=None, description="User ID of the member")
    member_name: str | None = Field(default=None, description="Name of the member if ID is unknown")


class GetHouseholdBalancesArgs(BaseModel):
    pass


class CompareMonthlySpendingArgs(BaseModel):
    month_a: str = Field(..., description="First month (e.g. 'September', '2026-09', or '9')")
    month_b: str = Field(..., description="Second month (e.g. 'October', '2026-10', or '10')")
    year_a: int | None = Field(default=None, description="Year for month A, defaults to current year")
    year_b: int | None = Field(default=None, description="Year for month B, defaults to current year")


class GetCategoryBreakdownArgs(BaseModel):
    start_date: str | None = Field(default=None, description="Start date in YYYY-MM-DD format")
    end_date: str | None = Field(default=None, description="End date in YYYY-MM-DD format")
    month: str | None = Field(default=None, description="Optional month name or number (e.g. 'October' or '10')")
    year: int | None = Field(default=None, description="Optional year (e.g. 2026)")


class ProposeExpenseArgs(BaseModel):
    amount_paise: int | None = Field(default=None, description="Amount in paise (e.g. 50000 for ₹500)")
    amount: float | None = Field(default=None, description="Amount in rupees (e.g. 500 or 500.00)")
    description: str = Field(..., min_length=1, max_length=255, description="Expense description/notes")
    category: str | None = Field(default="Other", description="Category name, e.g. Groceries, Utilities, Food")
    paid_by: str | int | None = Field(default=None, description="Member ID, member name, or 'me'/'self'")
    split_type: str = Field(default="equal", description="Split strategy: 'equal', 'exact', or 'percentage'")
    split_members: list[str | int] | None = Field(
        default=None,
        description="List of member names or user IDs to split among. If omitted, all active members are included.",
    )
    custom_splits: dict[str, int] | None = Field(
        default=None,
        description="Map of member identifier to share in paise for custom/exact splits",
    )
    expense_date: str | None = Field(default=None, description="Date of expense in YYYY-MM-DD format")

    @field_validator("amount_paise", mode="before")
    @classmethod
    def validate_amount(cls, v: Any, info: Any) -> Any:
        return v
