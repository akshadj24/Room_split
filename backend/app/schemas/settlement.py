from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class SettlementCreate(BaseModel):
    payer_id: int
    receiver_id: int
    amount: float | None = None
    amount_paise: int | None = None
    idempotency_key: str | None = None

    @model_validator(mode="after")
    def validate_amount(self) -> "SettlementCreate":
        if self.payer_id == self.receiver_id:
            raise ValueError("Payer and receiver cannot be the same user")

        if self.amount_paise is None:
            if self.amount is None:
                raise ValueError("Either amount or amount_paise must be provided")
            self.amount_paise = round(self.amount * 100)
        if self.amount is None:
            self.amount = round(self.amount_paise / 100.0, 2)

        if self.amount_paise <= 0:
            raise ValueError("Settlement amount must be positive")
        return self


class SettlementResponse(BaseModel):
    id: int
    household_id: int
    payer_id: int
    receiver_id: int
    amount_paise: int
    amount: float = Field(default=0.0)
    status: str
    idempotency_key: str | None = None
    paid_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_amount(self) -> "SettlementResponse":
        self.amount = round(self.amount_paise / 100.0, 2)
        return self


class MemberBalance(BaseModel):
    user_id: int
    name: str
    email: str
    net_balance_paise: int
    net_balance: float = Field(default=0.0)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_amount(self) -> "MemberBalance":
        self.net_balance = round(self.net_balance_paise / 100.0, 2)
        return self


class BalanceResponse(BaseModel):
    household_id: int
    balances: list[MemberBalance]


class TransferSuggestion(BaseModel):
    from_user_id: int
    from_user_name: str
    to_user_id: int
    to_user_name: str
    amount_paise: int
    amount: float = Field(default=0.0)

    @model_validator(mode="after")
    def compute_amount(self) -> "TransferSuggestion":
        self.amount = round(self.amount_paise / 100.0, 2)
        return self


class BalanceBreakdownItem(BaseModel):
    id: int
    type: str  # "expense_paid", "expense_share", "settlement_paid", "settlement_received"
    description: str
    date: str | None = None
    other_party: str | None = None
    effect_paise: int
    effect: float = Field(default=0.0)

    @model_validator(mode="after")
    def compute_amount(self) -> "BalanceBreakdownItem":
        self.effect = round(self.effect_paise / 100.0, 2)
        return self


class BalanceBreakdownResponse(BaseModel):
    household_id: int
    user_id: int
    net_balance_paise: int
    net_balance: float = Field(default=0.0)
    items: list[BalanceBreakdownItem]

    @model_validator(mode="after")
    def compute_amount(self) -> "BalanceBreakdownResponse":
        self.net_balance = round(self.net_balance_paise / 100.0, 2)
        return self
