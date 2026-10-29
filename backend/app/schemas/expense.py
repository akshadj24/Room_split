from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class ExpenseSplitResponse(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    share_paise: int
    share: float = Field(default=0.0)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_share(self) -> "ExpenseSplitResponse":
        self.share = round(self.share_paise / 100.0, 2)
        return self


class CategoryResponse(BaseModel):
    id: int
    household_id: int
    name: str
    is_default: bool

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    amount: float | None = None
    amount_paise: int | None = None
    paid_by: int
    category_id: int | None = None
    category: str | None = None
    description: str = Field(..., min_length=1, max_length=255)
    expense_date: date | None = None
    split_type: str = Field(default="equal")
    participants: list[int] | None = None
    shares: dict[int, int | float] | list[dict[str, Any]] | None = None
    idempotency_key: str | None = None

    @model_validator(mode="after")
    def validate_amount(self) -> "ExpenseCreate":
        if self.amount_paise is None:
            if self.amount is None:
                raise ValueError("Either amount or amount_paise must be provided")
            self.amount_paise = round(self.amount * 100)
        if self.amount is None:
            self.amount = round(self.amount_paise / 100.0, 2)
        return self


class ExpenseUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=255)
    category_id: int | None = None
    expense_date: date | None = None


class ExpenseSummary(BaseModel):
    id: int
    household_id: int
    paid_by: int
    paid_by_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    amount_paise: int
    amount: float = Field(default=0.0)
    description: str
    expense_date: date
    split_type: str
    status: str
    created_at: datetime
    splits: list[ExpenseSplitResponse] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_amount(self) -> "ExpenseSummary":
        self.amount = round(self.amount_paise / 100.0, 2)
        return self



class ExpenseResponse(BaseModel):
    id: int
    household_id: int
    paid_by: int
    category_id: int | None = None
    amount_paise: int
    amount: float = Field(default=0.0)
    description: str
    expense_date: date
    split_type: str
    status: str
    created_at: datetime
    updated_at: datetime | None = None
    splits: list[ExpenseSplitResponse] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_amount(self) -> "ExpenseResponse":
        self.amount = round(self.amount_paise / 100.0, 2)
        return self


class AuditEventResponse(BaseModel):
    id: int
    household_id: int
    actor_id: int
    entity_type: str
    entity_id: int
    action: str
    created_at: datetime

    model_config = {"from_attributes": True}
