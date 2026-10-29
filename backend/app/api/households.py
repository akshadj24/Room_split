from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.household import (
    AnalyticsResponse,
    DashboardResponse,
    HouseholdCreate,
    HouseholdMemberResponse,
    HouseholdResponse,
    InvitationResponse,
)
from app.services.household_service import (
    create_household,
    create_invitation,
    get_household_analytics,
    get_household_dashboard,
    get_household_detail,
    get_household_members,
)

router = APIRouter()


@router.post("", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
def create_new_household(
    data: HouseholdCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new household and set the creator as owner."""
    household = create_household(db=db, creator_id=current_user.id, data=data)
    return household


@router.get("/{id}", response_model=HouseholdResponse)
def get_household(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get household details."""
    return get_household_detail(db=db, household_id=id, user_id=current_user.id)


@router.get("/{id}/members", response_model=list[HouseholdMemberResponse])
def list_household_members(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get active members for this household."""
    return get_household_members(db=db, household_id=id, user_id=current_user.id)


@router.get("/{id}/dashboard", response_model=DashboardResponse)
def get_dashboard_summary(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve full dashboard summary for a household."""
    return get_household_dashboard(db=db, household_id=id, user_id=current_user.id)


@router.get("/{id}/analytics", response_model=AnalyticsResponse)
def get_analytics(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve spend analytics for a household."""
    return get_household_analytics(db=db, household_id=id, user_id=current_user.id)


@router.post("/{id}/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def invite_to_household(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate an invitation link for a roommate to join the household."""
    invitation, raw_token = create_invitation(
        db=db,
        household_id=id,
        creator_id=current_user.id,
    )

    invite_url = f"{settings.FRONTEND_ORIGIN}/invite/{raw_token}"
    return InvitationResponse(
        token=raw_token,
        expires_at=invitation.expires_at,
        invite_url=invite_url,
    )

