from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ReminderCreate(BaseModel):
    type: Literal["bill_due", "pending_balance", "custom"] = "bill_due"
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    amount: float | None = None
    amount_paise: int | None = None
    due_at: datetime

    @model_validator(mode="after")
    def sync_amount(self) -> "ReminderCreate":
        if self.amount_paise is None and self.amount is not None:
            self.amount_paise = round(self.amount * 100)
        elif self.amount is None and self.amount_paise is not None:
            self.amount = round(self.amount_paise / 100.0, 2)
        return self


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    due_at: datetime | None = None
    status: Literal["pending", "sent", "failed", "cancelled"] | None = None


class ReminderResponse(BaseModel):
    id: int
    household_id: int
    user_id: int
    type: str
    title: str
    description: str | None = None
    amount_paise: int | None = None
    amount: float | None = None
    due_at: datetime
    sent_at: datetime | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_amount(self) -> "ReminderResponse":
        if self.amount is None and self.amount_paise is not None:
            self.amount = round(self.amount_paise / 100.0, 2)
        return self


class NotificationPreferenceUpdate(BaseModel):
    channel: Literal["email", "push"]
    enabled: bool


class NotificationPreferenceResponse(BaseModel):
    channel: str
    enabled: bool

    model_config = {"from_attributes": True}
