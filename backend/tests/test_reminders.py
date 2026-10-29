from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

from app.models.expense import Category, Expense, ExpenseSplit
from app.models.household import Household, HouseholdMember
from app.models.reminder import Reminder
from app.models.user import User
from app.schemas.reminder import (
    NotificationPreferenceUpdate,
    ReminderCreate,
)
from app.services.reminder_service import (
    create_reminder,
    list_user_reminders,
    process_bill_due_reminders,
    process_pending_balance_nudges,
    update_household_preference,
)


def _create_user(db, name: str, email: str) -> User:
    user = User(name=name, email=email, password_hash="hashedpass")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_household(db, name: str, owner: User) -> Household:
    household = Household(name=name, created_by=owner.id, currency="INR")
    db.add(household)
    db.commit()
    db.refresh(household)

    member = HouseholdMember(household_id=household.id, user_id=owner.id, role="admin", status="active")
    db.add(member)
    db.commit()
    return household


def _add_member(db, household_id: int, user: User) -> HouseholdMember:
    member = HouseholdMember(household_id=household_id, user_id=user.id, role="member", status="active")
    db.add(member)
    db.commit()
    return member


def _create_expense(
    db,
    household_id: int,
    payer_id: int,
    amount_paise: int,
    desc: str,
    exp_date: date,
    split_user_ids: list[int],
) -> Expense:
    cat = Category(household_id=household_id, name="Utilities", is_default=False)
    db.add(cat)
    db.commit()
    db.refresh(cat)

    exp = Expense(
        household_id=household_id,
        paid_by=payer_id,
        category_id=cat.id,
        amount_paise=amount_paise,
        description=desc,
        expense_date=exp_date,
        split_type="equal",
        status="active",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    n = len(split_user_ids)
    share = amount_paise // n
    remainder = amount_paise % n

    for i, uid in enumerate(split_user_ids):
        p_share = share + (remainder if i == 0 else 0)
        split = ExpenseSplit(expense_id=exp.id, user_id=uid, share_paise=p_share)
        db.add(split)
    db.commit()
    return exp


# ==============================================================================
# Acceptance Criteria Tests
# ==============================================================================

def test_bill_due_reminders_sent_3_days_before(db):
    """Test acceptance criterion: Bill due reminders sent 3 days before due date."""
    owner = _create_user(db, "Alice", "alice_bill@test.com")
    h = _create_household(db, "Bill Apt", owner)
    now = datetime(2026, 10, 28, 9, 0, 0, tzinfo=UTC)

    # 1. Reminder due in 2 days (within 3-day window) -> Should be sent
    r_soon = create_reminder(
        db,
        household_id=h.id,
        actor_id=owner.id,
        data=ReminderCreate(
            type="bill_due",
            title="Electricity Bill",
            amount=1500.0,
            due_at=now + timedelta(days=2),
        ),
    )

    # 2. Reminder due in 10 days (outside 3-day window) -> Should NOT be sent yet
    r_far = create_reminder(
        db,
        household_id=h.id,
        actor_id=owner.id,
        data=ReminderCreate(
            type="bill_due",
            title="Next Month Rent",
            amount=10000.0,
            due_at=now + timedelta(days=10),
        ),
    )

    with patch("app.services.reminder_service.send_email", return_value=True) as mock_send:
        sent_count = process_bill_due_reminders(db, now=now)

        assert sent_count == 1
        mock_send.assert_called_once()

        db.refresh(r_soon)
        db.refresh(r_far)

        assert r_soon.status == "sent"
        assert r_soon.sent_at is not None
        assert r_far.status == "pending"
        assert r_far.sent_at is None


def test_no_duplicate_sends_after_restart(db):
    """Test acceptance criterion: No duplicate sends after app restart (idempotency rule)."""
    owner = _create_user(db, "Bob", "bob_dup@test.com")
    h = _create_household(db, "Bob Apt", owner)
    now = datetime(2026, 10, 28, 9, 0, 0, tzinfo=UTC)

    create_reminder(
        db,
        household_id=h.id,
        actor_id=owner.id,
        data=ReminderCreate(
            type="bill_due",
            title="Wifi Bill",
            amount=800.0,
            due_at=now + timedelta(days=1),
        ),
    )

    with patch("app.services.reminder_service.send_email", return_value=True) as mock_send:
        # First execution cycle
        first_run = process_bill_due_reminders(db, now=now)
        assert first_run == 1
        assert mock_send.call_count == 1

        # Second execution cycle (simulating app restart / recurring schedule run)
        second_run = process_bill_due_reminders(db, now=now + timedelta(minutes=10))
        assert second_run == 0
        assert mock_send.call_count == 1  # No additional send!


def test_user_can_disable_notifications_per_channel(db):
    """Test acceptance criterion: User can disable notifications per channel."""
    owner = _create_user(db, "Charlie", "charlie_pref@test.com")
    h = _create_household(db, "Charlie Apt", owner)
    now = datetime(2026, 10, 28, 9, 0, 0, tzinfo=UTC)

    create_reminder(
        db,
        household_id=h.id,
        actor_id=owner.id,
        data=ReminderCreate(
            type="bill_due",
            title="Water Bill",
            due_at=now + timedelta(days=1),
        ),
    )

    # Disable email notifications for this user in this household
    update_household_preference(
        db,
        household_id=h.id,
        user_id=owner.id,
        data=NotificationPreferenceUpdate(channel="email", enabled=False),
    )

    with patch("app.services.reminder_service.send_email") as mock_send:
        sent_count = process_bill_due_reminders(db, now=now)
        assert sent_count == 0
        mock_send.assert_not_called()


def test_failed_sends_retried_next_cycle(db):
    """Test acceptance criterion: Failed sends retried next cycle, not immediately."""
    owner = _create_user(db, "David", "david_fail@test.com")
    h = _create_household(db, "David Apt", owner)
    now = datetime(2026, 10, 28, 9, 0, 0, tzinfo=UTC)

    r = create_reminder(
        db,
        household_id=h.id,
        actor_id=owner.id,
        data=ReminderCreate(
            type="bill_due",
            title="Gas Cylinder",
            due_at=now + timedelta(days=1),
        ),
    )

    # 1. First cycle: provider fails (e.g. network error / 500)
    with patch("app.services.reminder_service.send_email", return_value=False):
        cycle1 = process_bill_due_reminders(db, now=now)
        assert cycle1 == 0
        db.refresh(r)
        assert r.status == "failed"
        assert r.sent_at is None

    # 2. Second cycle (next run): provider recovers
    with patch("app.services.reminder_service.send_email", return_value=True):
        cycle2 = process_bill_due_reminders(db, now=now + timedelta(hours=1))
        assert cycle2 == 1
        db.refresh(r)
        assert r.status == "sent"
        assert r.sent_at is not None


def test_pending_balance_nudges_after_x_days(db):
    """Test acceptance criterion: Pending balance nudges after X days."""
    owner = _create_user(db, "Emma", "emma_nudge@test.com")
    roommate = _create_user(db, "Frank", "frank_nudge@test.com")
    h = _create_household(db, "Nudge Apt", owner)
    _add_member(db, h.id, roommate)

    now = datetime(2026, 10, 28, 19, 0, 0, tzinfo=UTC)

    # Emma paid ₹1,000 (100000 paise) split with Frank on Oct 10 (18 days ago > 5 days)
    _create_expense(db, h.id, owner.id, 100000, "Dinner", date(2026, 10, 10), [owner.id, roommate.id])

    with patch("app.services.reminder_service.send_email", return_value=True) as mock_send:
        nudges = process_pending_balance_nudges(db, min_unsettled_days=5, now=now)
        assert nudges == 1
        mock_send.assert_called_once()

        # Check reminder created in DB
        rem = (
            db.query(Reminder)
            .filter(
                Reminder.household_id == h.id,
                Reminder.user_id == roommate.id,
                Reminder.type == "pending_balance",
            )
            .first()
        )
        assert rem is not None
        assert rem.amount_paise == 50000  # Frank owes ₹500
        assert rem.status == "sent"

        # Running again immediately should NOT duplicate
        second_run = process_pending_balance_nudges(db, min_unsettled_days=5, now=now)
        assert second_run == 0


def test_reminders_scoped_to_correct_household(db):
    """Test acceptance criterion: Reminders scoped to correct household."""
    u1 = _create_user(db, "User 1", "u1_scope@test.com")
    u2 = _create_user(db, "User 2", "u2_scope@test.com")

    h1 = _create_household(db, "House 1", u1)
    h2 = _create_household(db, "House 2", u2)

    now = datetime(2026, 10, 28, 10, 0, 0, tzinfo=UTC)

    r1 = create_reminder(
        db,
        household_id=h1.id,
        actor_id=u1.id,
        data=ReminderCreate(type="custom", title="House 1 Reminder", due_at=now),
    )

    # User 1 reminders in house 1
    u1_h1 = list_user_reminders(db, user_id=u1.id, household_id=h1.id)
    assert len(u1_h1) == 1
    assert u1_h1[0].id == r1.id

    # User 1 reminders in house 2 (should be empty)
    u1_h2 = list_user_reminders(db, user_id=u1.id, household_id=h2.id)
    assert len(u1_h2) == 0


# ==============================================================================
# API Endpoint Integration Tests
# ==============================================================================

def test_api_reminder_crud_flow(client):
    """Test full CRUD via API: create, list, patch, and preferences."""
    # 1. Register & login
    client.post("/api/v1/auth/register", json={"name": "Grace", "email": "grace_api@test.com", "password": "password123"})
    login_res = client.post("/api/v1/auth/login", json={"email": "grace_api@test.com", "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create household
    h_res = client.post("/api/v1/households", headers=headers, json={"name": "Grace Apt", "currency": "INR"})
    h_id = h_res.json()["id"]

    # 3. POST /api/v1/households/{id}/reminders — Create reminder
    due_str = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    create_res = client.post(
        f"/api/v1/households/{h_id}/reminders",
        headers=headers,
        json={
            "type": "bill_due",
            "title": "Gym Membership",
            "description": "Annual renewal",
            "amount": 2500.0,
            "due_at": due_str,
        },
    )
    assert create_res.status_code == 201
    r_data = create_res.json()
    assert r_data["title"] == "Gym Membership"
    assert r_data["amount_paise"] == 250000
    assert r_data["amount"] == 2500.0
    assert r_data["status"] == "pending"
    rem_id = r_data["id"]

    # 4. GET /api/v1/reminders — List user's reminders
    list_res = client.get("/api/v1/reminders", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 5. PATCH /api/v1/reminders/{id} — Cancel reminder
    patch_res = client.patch(
        f"/api/v1/reminders/{rem_id}",
        headers=headers,
        json={"status": "cancelled"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "cancelled"

    # 6. GET /api/v1/households/{id}/preferences — Get notification prefs
    prefs_res = client.get(f"/api/v1/households/{h_id}/preferences", headers=headers)
    assert prefs_res.status_code == 200
    prefs_list = prefs_res.json()
    assert any(p["channel"] == "email" for p in prefs_list)

    # 7. PATCH /api/v1/households/{id}/preferences — Disable push
    update_pref_res = client.patch(
        f"/api/v1/households/{h_id}/preferences",
        headers=headers,
        json={"channel": "push", "enabled": False},
    )
    assert update_pref_res.status_code == 200
    assert update_pref_res.json()["channel"] == "push"
    assert update_pref_res.json()["enabled"] is False
