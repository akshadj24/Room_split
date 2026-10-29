from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.household import HouseholdResponse
from app.services.household_service import accept_invitation

router = APIRouter()


@router.post("/{token}/accept", response_model=HouseholdResponse, status_code=status.HTTP_200_OK)
def accept_household_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an invitation to join a household using the raw invitation token."""
    household = accept_invitation(
        db=db,
        raw_token=token,
        user_id=current_user.id,
    )
    return household
