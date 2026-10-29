from datetime import datetime

from pydantic import BaseModel, Field


class HouseholdCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    currency: str = Field(default="INR", min_length=1, max_length=10)


class HouseholdResponse(BaseModel):
    id: int
    name: str
    currency: str
    created_by: int
    created_at: datetime

class InvitationResponse(BaseModel):
    token: str
    expires_at: datetime
    invite_url: str

    model_config = {"from_attributes": True}


class HouseholdMemberResponse(BaseModel):

    id: int
    name: str
    email: str
    role: str
    status: str

    model_config = {"from_attributes": True}


class DashboardBalance(BaseModel):
    net_balance: float
    net_paise: int
    total_owed_to_you: float
    total_you_owe: float


class DashboardMonthlySpend(BaseModel):
    total: float
    total_paise: int
    change_percent: float


class DashboardActivity(BaseModel):
    id: int
    type: str  # 'expense' | 'settlement'
    title: str
    subtitle: str
    category: str
    time: str
    total_amount: float
    lent_or_share: str
    is_lent: bool | None = None
    status: str = "active"


class DashboardTransferSuggestion(BaseModel):
    id: str
    initial: str
    avatar_bg: str
    avatar_color: str
    name: str
    subtext: str
    amount: float
    is_positive: bool


class DashboardResponse(BaseModel):
    household: HouseholdResponse
    balance: DashboardBalance
    monthly_spend: DashboardMonthlySpend
    recent_activities: list[DashboardActivity]
    suggested_transfers: list[DashboardTransferSuggestion]


class CategoryBreakdownItem(BaseModel):
    label: str
    category: str
    amount: float
    percent: float
    color: str
    bg: str


class MonthlyHistoryItem(BaseModel):
    month: str
    amount: float
    height: int
    current: bool = False


class MemberShareItem(BaseModel):
    member_id: int
    name: str
    paid: float
    consumed: float
    net: float
    color: str
    initial: str


class AnalyticsResponse(BaseModel):
    household_id: int
    time_range: str
    total_spend_rupees: float
    category_breakdown: list[CategoryBreakdownItem]
    monthly_history: list[MonthlyHistoryItem]
    member_shares: list[MemberShareItem]

