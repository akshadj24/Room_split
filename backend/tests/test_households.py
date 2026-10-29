from datetime import UTC, datetime, timedelta

from app.core.security import hash_invite_token
from app.models.household import HouseholdInvitation


def _register_and_login(client, name: str, email: str, password: str = "password123") -> tuple[dict, str]:
    client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_res.json()["access_token"]
    user_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    return user_res.json(), token


def test_create_household_and_owner_membership(client):
    user, token = _register_and_login(client, "Owner User", "owner@example.com")

    # Create household
    res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Baker Street Apt 221B", "currency": "INR"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Baker Street Apt 221B"
    assert data["currency"] == "INR"
    assert data["created_by"] == user["id"]


def test_full_invite_and_accept_flow(client):
    _owner, owner_token = _register_and_login(client, "Owner", "owner_flow@example.com")
    _roommate, roommate_token = _register_and_login(client, "Roommate", "roommate@example.com")

    # 1. Owner creates household
    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Sunnyvale House", "currency": "INR"},
    )
    household_id = h_res.json()["id"]

    # 2. Owner generates invite link
    inv_res = client.post(
        f"/api/v1/households/{household_id}/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    raw_token = inv_data["token"]
    assert "invite_url" in inv_data
    assert raw_token in inv_data["invite_url"]

    # 3. Roommate accepts invite
    accept_res = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {roommate_token}"},
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["id"] == household_id

    # 4. Acceptance criteria: User can't join same household twice
    duplicate_res = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {roommate_token}"},
    )
    assert duplicate_res.status_code == 400
    assert "already a member" in duplicate_res.json()["detail"]


def test_accept_expired_invitation_fails(client, db):
    _owner, owner_token = _register_and_login(client, "Owner 2", "owner2@example.com")
    _roommate, roommate_token = _register_and_login(client, "Roommate 2", "roommate2@example.com")

    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Expired Test House"},
    )
    household_id = h_res.json()["id"]

    inv_res = client.post(
        f"/api/v1/households/{household_id}/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    raw_token = inv_res.json()["token"]

    # Expire the invitation directly in the DB
    token_hash = hash_invite_token(raw_token)
    inv = db.query(HouseholdInvitation).filter(HouseholdInvitation.token_hash == token_hash).first()
    inv.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
    db.commit()

    # Attempt to accept expired invite
    res = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {roommate_token}"},
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"]


def test_accept_revoked_invitation_fails(client, db):
    _owner, owner_token = _register_and_login(client, "Owner 3", "owner3@example.com")
    _roommate, roommate_token = _register_and_login(client, "Roommate 3", "roommate3@example.com")

    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Revoke Test House"},
    )
    household_id = h_res.json()["id"]

    inv_res = client.post(
        f"/api/v1/households/{household_id}/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    raw_token = inv_res.json()["token"]

    # Revoke invitation in the DB
    token_hash = hash_invite_token(raw_token)
    inv = db.query(HouseholdInvitation).filter(HouseholdInvitation.token_hash == token_hash).first()
    inv.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()

    # Attempt to accept revoked invite
    res = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {roommate_token}"},
    )
    assert res.status_code == 400
    assert "revoked" in res.json()["detail"]


def test_non_member_cannot_generate_invitations(client):
    _owner, owner_token = _register_and_login(client, "Real Owner", "real_owner@example.com")
    _stranger, stranger_token = _register_and_login(client, "Stranger", "stranger@example.com")

    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Private House"},
    )
    household_id = h_res.json()["id"]

    # Stranger tries to invite people to someone else's household
    inv_res = client.post(
        f"/api/v1/households/{household_id}/invitations",
        headers={"Authorization": f"Bearer {stranger_token}"},
    )
    assert inv_res.status_code == 403
    assert "not an active member" in inv_res.json()["detail"]


def test_accept_invitation_max_uses_hit_fails(client, db):
    """Test requirement: Invite max_uses hit → accept rejected."""
    _owner, owner_token = _register_and_login(client, "Owner Max", "owner_max@example.com")
    _roommate, roommate_token = _register_and_login(client, "Roommate Max", "roommate_max@example.com")

    h_res = client.post("/api/v1/households", headers={"Authorization": f"Bearer {owner_token}"}, json={"name": "Max Use House"})
    h_id = h_res.json()["id"]

    inv_res = client.post(f"/api/v1/households/{h_id}/invitations", headers={"Authorization": f"Bearer {owner_token}"})
    raw_token = inv_res.json()["token"]

    # Set use_count == max_uses in DB
    token_hash = hash_invite_token(raw_token)
    inv = db.query(HouseholdInvitation).filter(HouseholdInvitation.token_hash == token_hash).first()
    inv.use_count = inv.max_uses
    db.commit()

    res = client.post(f"/api/v1/invitations/{raw_token}/accept", headers={"Authorization": f"Bearer {roommate_token}"})
    assert res.status_code == 400
    assert "limit reached" in res.json()["detail"].lower()


def test_wrong_household_id_returns_404(client):
    """Test requirement: Wrong household ID in URL → 404."""
    _owner, owner_token = _register_and_login(client, "Owner 404", "owner_404@example.com")
    res = client.post(
        "/api/v1/households/99999/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 404
