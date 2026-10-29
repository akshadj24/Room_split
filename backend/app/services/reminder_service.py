import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.expense import Expense
from app.models.household import Household, HouseholdMember
from app.models.reminder import NotificationPreference, Reminder
from app.models.user import User
from app.schemas.reminder import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    ReminderCreate,
    ReminderUpdate,
)
from app.services.settlement_service import (
    _validate_household_membership,
    calculate_household_balances,
)

logger = logging.getLogger(__name__)


def format_inr(paise: int) -> str:
    rupees = abs(paise) / 100
    sign = "-" if paise < 0 else ""
    if paise % 100 == 0:
        return f"{sign}₹{int(rupees):,}"
    return f"{sign}₹{rupees:,.2f}"


def send_email(to: str, subject: str, body: str) -> bool:
    """
    Sends email notification via Resend if key is configured,
    or logs for development and test environments.
    """
    resend_key = getattr(settings, "RESEND_API_KEY", "")
    if resend_key:
        try:
            import httpx
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": "RoomSplit <reminders@roomsplit.app>",
                    "to": [to],
                    "subject": subject,
                    "html": f"<p>{body}</p>",
                },
                timeout=10.0,
            )
            return resp.status_code in (200, 201)
        except Exception as e:  # noqa: BLE001
            logger.error(f"Failed to send email via Resend to {to}: {e}")
            return False

    logger.info(f"[EMAIL NOTIFICATION] To: {to} | Subject: {subject} | Body: {body}")
    return True


def is_notification_enabled(
    db: Session,
    user_id: int,
    household_id: int,
    channel: str = "email",
) -> bool:
    """Check if a specific notification channel is enabled for a user in a household."""
    pref = (
        db.query(NotificationPreference)
        .filter(
            NotificationPreference.user_id == user_id,
            NotificationPreference.household_id == household_id,
            NotificationPreference.channel == channel,
        )
        .first()
    )
    if pref is None:
        return True  # Default enabled
    return pref.enabled


# ==============================================================================
# Scheduled Notification Processors
# ==============================================================================

def process_bill_due_reminders(db: Session, now: datetime | None = None) -> int:
    """
    Finds reminders with due_at within the next 3 days,
    status in ('pending', 'failed'), and sent_at is NULL.
    Sends notification, marks sent_at = now, status = 'sent'.
    Failed sends are marked status = 'failed' to retry next cycle.
    """
    current_time = now or datetime.now(UTC)
    cutoff = current_time + timedelta(days=3)

    # 1. Query pending / failed reminders due within next 3 days that haven't been sent
    reminders = (
        db.query(Reminder)
        .filter(
            Reminder.due_at <= cutoff,
            Reminder.due_at >= current_time - timedelta(days=1),
            Reminder.status.in_(["pending", "failed"]),
            Reminder.sent_at.is_(None),
        )
        .all()
    )

    sent_count = 0
    for r in reminders:
        # Idempotency guard: skip if already sent
        if r.sent_at is not None:
            continue

        # Respect user notification preference
        if not is_notification_enabled(db, r.user_id, r.household_id, "email"):
            logger.info(f"Notification preference disabled for user {r.user_id} in household {r.household_id}. Skipping.")
            continue

        user = db.query(User).filter(User.id == r.user_id).first()
        if not user or not user.email:
            continue

        subject = f"Reminder: {r.title}"
        amount_str = f" - {format_inr(r.amount_paise)}" if r.amount_paise else ""
        body = f"Hello {user.name},\n\nThis is a reminder that '{r.title}'{amount_str} is due on {r.due_at.strftime('%b %d, %Y')}."
        if r.description:
            body += f"\nNote: {r.description}"

        success = send_email(user.email, subject, body)
        if success:
            r.sent_at = current_time
            r.status = "sent"
            sent_count += 1
        else:
            r.status = "failed"
            logger.warning(f"Reminder ID {r.id} send failed. Will retry next cycle.")

        db.commit()

    return sent_count


def process_pending_balance_nudges(
    db: Session,
    min_unsettled_days: int = 5,
    now: datetime | None = None,
) -> int:
    """
    Calculates balances across all households.
    If a member has a negative net balance unsettled for >= min_unsettled_days,
    sends a polite reminder nudge.
    Enforces idempotency: does not send duplicate nudges within the interval.
    """
    current_time = now or datetime.now(UTC)
    cutoff_recent = current_time - timedelta(days=min_unsettled_days)

    households = db.query(Household).all()
    nudges_sent = 0

    for h in households:
        # Get active members
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.household_id == h.id, HouseholdMember.status == "active")
            .all()
        )
        if not members:
            continue

        try:
            balances = calculate_household_balances(db, h.id, members[0].user_id)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not calculate balances for household {h.id}: {e}")
            continue

        for mb in balances:
            # Member owes money (negative balance)
            if mb.net_balance_paise < 0:
                owed_paise = abs(mb.net_balance_paise)

                # Check if expense contributing to debt is older than min_unsettled_days
                oldest_active_expense = (
                    db.query(Expense)
                    .filter(
                        Expense.household_id == h.id,
                        Expense.status == "active",
                        Expense.expense_date <= cutoff_recent.date(),
                    )
                    .first()
                )

                if not oldest_active_expense:
                    # Expenses are too recent (< min_unsettled_days)
                    continue

                # Idempotency check: has a nudge already been sent recently for this user in this household?
                recent_nudge = (
                    db.query(Reminder)
                    .filter(
                        Reminder.household_id == h.id,
                        Reminder.user_id == mb.user_id,
                        Reminder.type == "pending_balance",
                        Reminder.sent_at >= cutoff_recent,
                    )
                    .first()
                )
                if recent_nudge:
                    # Already nudged recently, skip duplicate
                    continue

                # Respect user preferences
                if not is_notification_enabled(db, mb.user_id, h.id, "email"):
                    continue

                user = db.query(User).filter(User.id == mb.user_id).first()
                if not user or not user.email:
                    continue

                # Create reminder record
                reminder = Reminder(
                    household_id=h.id,
                    user_id=mb.user_id,
                    type="pending_balance",
                    title=f"Pending balance of {format_inr(owed_paise)} in {h.name}",
                    description=f"You have an unsettled share of {format_inr(owed_paise)}.",
                    amount_paise=owed_paise,
                    due_at=current_time,
                    status="pending",
                )
                db.add(reminder)
                db.flush()

                subject = f"RoomSplit Balance Nudge: {h.name}"
                body = (
                    f"Hi {user.name},\n\n"
                    f"You have a pending unsettled balance of {format_inr(owed_paise)} in {h.name}.\n"
                    f"Please review your household ledger and record any settlements when convenient."
                )

                success = send_email(user.email, subject, body)
                if success:
                    reminder.sent_at = current_time
                    reminder.status = "sent"
                    nudges_sent += 1
                else:
                    reminder.status = "failed"

                db.commit()

    return nudges_sent


# ==============================================================================
# CRUD Service Operations
# ==============================================================================

def create_reminder(
    db: Session,
    household_id: int,
    actor_id: int,
    data: ReminderCreate,
) -> Reminder:
    """Create a new reminder scoped to the user's household."""
    _validate_household_membership(db, household_id, actor_id)

    reminder = Reminder(
        household_id=household_id,
        user_id=actor_id,
        type=data.type,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        amount_paise=data.amount_paise,
        due_at=data.due_at,
        status="pending",
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


def list_user_reminders(
    db: Session,
    user_id: int,
    household_id: int | None = None,
) -> list[Reminder]:
    """List reminders for the user, optionally filtered by household."""
    query = db.query(Reminder).filter(Reminder.user_id == user_id)
    if household_id is not None:
        query = query.filter(Reminder.household_id == household_id)
    return query.order_by(Reminder.due_at.asc()).all()


def update_reminder(
    db: Session,
    reminder_id: int,
    user_id: int,
    data: ReminderUpdate,
) -> Reminder:
    """Update or cancel an existing reminder."""
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == user_id).first()
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found",
        )

    if data.title is not None:
        reminder.title = data.title.strip()
    if data.description is not None:
        reminder.description = data.description.strip()
    if data.due_at is not None:
        reminder.due_at = data.due_at
    if data.status is not None:
        reminder.status = data.status

    db.commit()
    db.refresh(reminder)
    return reminder


def get_household_preferences(
    db: Session,
    household_id: int,
    user_id: int,
) -> list[NotificationPreferenceResponse]:
    """Get all notification preferences for the user in this household."""
    _validate_household_membership(db, household_id, user_id)

    prefs = (
        db.query(NotificationPreference)
        .filter(
            NotificationPreference.household_id == household_id,
            NotificationPreference.user_id == user_id,
        )
        .all()
    )

    channels = {"email": True, "push": True}
    for p in prefs:
        channels[p.channel] = p.enabled

    return [
        NotificationPreferenceResponse(channel=ch, enabled=enabled)
        for ch, enabled in channels.items()
    ]


def update_household_preference(
    db: Session,
    household_id: int,
    user_id: int,
    data: NotificationPreferenceUpdate,
) -> NotificationPreferenceResponse:
    """Update a specific notification preference channel for a user in a household."""
    _validate_household_membership(db, household_id, user_id)

    pref = (
        db.query(NotificationPreference)
        .filter(
            NotificationPreference.household_id == household_id,
            NotificationPreference.user_id == user_id,
            NotificationPreference.channel == data.channel,
        )
        .first()
    )

    if not pref:
        pref = NotificationPreference(
            household_id=household_id,
            user_id=user_id,
            channel=data.channel,
            enabled=data.enabled,
        )
        db.add(pref)
    else:
        pref.enabled = data.enabled

    db.commit()
    db.refresh(pref)
    return NotificationPreferenceResponse(channel=pref.channel, enabled=pref.enabled)
