from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.reminder import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    ReminderCreate,
    ReminderResponse,
    ReminderUpdate,
)
from app.services.reminder_service import (
    create_reminder,
    get_household_preferences,
    list_user_reminders,
    update_household_preference,
    update_reminder,
)

reminders_router = APIRouter(prefix="/reminders", tags=["reminders"])
household_reminders_router = APIRouter(prefix="/households/{id}", tags=["reminders"])


# 1. GET /api/v1/reminders — List user's reminders
@reminders_router.get(
    "",
    response_model=list[ReminderResponse],
    status_code=status.HTTP_200_OK,
)
def get_user_reminders(
    household_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List reminders belonging to the authenticated user."""
    return list_user_reminders(db, user_id=current_user.id, household_id=household_id)


# 2. POST /api/v1/households/{id}/reminders — Create reminder
@household_reminders_router.post(
    "/reminders",
    response_model=ReminderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_household_reminder(
    id: int,
    data: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new bill or custom reminder scoped to this household."""
    return create_reminder(db, household_id=id, actor_id=current_user.id, data=data)


# 3. PATCH /api/v1/reminders/{id} — Update/cancel reminder
@reminders_router.patch(
    "/{id}",
    response_model=ReminderResponse,
    status_code=status.HTTP_200_OK,
)
def patch_reminder(
    id: int,
    data: ReminderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update reminder details or status (e.g. cancel)."""
    return update_reminder(db, reminder_id=id, user_id=current_user.id, data=data)


# 4. GET /api/v1/households/{id}/preferences — Get notification prefs
@household_reminders_router.get(
    "/preferences",
    response_model=list[NotificationPreferenceResponse],
    status_code=status.HTTP_200_OK,
)
def get_user_notification_preferences(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user's notification preferences for this household."""
    return get_household_preferences(db, household_id=id, user_id=current_user.id)


# 5. PATCH /api/v1/households/{id}/preferences — Update prefs
@household_reminders_router.patch(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    status_code=status.HTTP_200_OK,
)
def update_user_notification_preference(
    id: int,
    data: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update notification preference (email or push) for this household."""
    return update_household_preference(
        db, household_id=id, user_id=current_user.id, data=data
    )
