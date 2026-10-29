
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.settlement import (
    BalanceBreakdownResponse,
    BalanceResponse,
    SettlementCreate,
    SettlementResponse,
    TransferSuggestion,
)
from app.services.settlement_service import (
    calculate_household_balances,
    cancel_settlement,
    confirm_settlement,
    generate_transfer_suggestions,
    get_balance_breakdown,
    get_household_settlements,
    record_settlement,
)

household_settlements_router = APIRouter(prefix="/households/{id}", tags=["settlements"])
settlements_router = APIRouter(prefix="/settlements", tags=["settlements"])


# 1. GET /api/v1/households/{id}/balances — Net balances
@household_settlements_router.get(
    "/balances",
    response_model=BalanceResponse,
)
def get_household_net_balances(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve net balance for every member in the household."""
    balances = calculate_household_balances(
        db=db,
        household_id=id,
        actor_id=current_user.id,
    )
    return BalanceResponse(household_id=id, balances=balances)


# 2. GET /api/v1/households/{id}/balances/{member_id}/breakdown — Why do I owe X
@household_settlements_router.get(
    "/balances/{member_id}/breakdown",
    response_model=BalanceBreakdownResponse,
)
def get_member_balance_breakdown(
    id: int,
    member_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get itemized breakdown explaining a member's net balance."""
    breakdown = get_balance_breakdown(
        db=db,
        household_id=id,
        member_id=member_id,
        actor_id=current_user.id,
    )
    return breakdown


# 3. GET /api/v1/households/{id}/settlements/suggestions — Suggested transfers
@household_settlements_router.get(
    "/settlements/suggestions",
    response_model=list[TransferSuggestion],
)
def get_transfer_suggestions(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate greedy minimum cash-flow transfer suggestions to settle all debts."""
    suggestions = generate_transfer_suggestions(
        db=db,
        household_id=id,
        actor_id=current_user.id,
    )
    return suggestions


# 4. POST /api/v1/households/{id}/settlements — Record repayment
@household_settlements_router.post(
    "/settlements",
    response_model=SettlementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_settlement_repayment(
    id: int,
    data: SettlementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a new repayment settlement in pending state."""
    settlement = record_settlement(
        db=db,
        household_id=id,
        actor_id=current_user.id,
        data=data,
    )
    return settlement


# 5. GET /api/v1/households/{id}/settlements — Settlement history
@household_settlements_router.get(
    "/settlements",
    response_model=list[SettlementResponse],
)
def list_household_settlements(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get history of all pending, confirmed, and cancelled settlements."""
    return get_household_settlements(
        db=db,
        household_id=id,
        actor_id=current_user.id,
    )


# 6. PATCH /api/v1/settlements/{id}/confirm — Receiver confirms payment
@settlements_router.patch(
    "/{id}/confirm",
    response_model=SettlementResponse,
)
def confirm_settlement_payment(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm a repayment settlement. Only the receiver is permitted to confirm."""
    settlement = confirm_settlement(
        db=db,
        settlement_id=id,
        actor_id=current_user.id,
    )
    return settlement


# 7. PATCH /api/v1/settlements/{id}/cancel — Cancel settlement
@settlements_router.patch(
    "/{id}/cancel",
    response_model=SettlementResponse,
)
def cancel_pending_settlement(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a pending settlement before confirmation."""
    settlement = cancel_settlement(
        db=db,
        settlement_id=id,
        actor_id=current_user.id,
    )
    return settlement
