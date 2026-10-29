def test_register_user(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Alice Johnson",
            "email": "alice@example.com",
            "password": "securepassword123",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Alice Johnson"
    assert data["email"] == "alice@example.com"
    assert "id" in data
    assert "password_hash" not in data


def test_register_duplicate_email_fails(client):
    payload = {
        "name": "Bob",
        "email": "bob@example.com",
        "password": "mypassword123",
    }
    res1 = client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"]


def test_login_returns_jwt_and_me_endpoint(client):
    # Register
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Charlie",
            "email": "charlie@example.com",
            "password": "charliespassword",
        },
    )

    # Login with valid credentials
    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email": "charlie@example.com",
            "password": "charliespassword",
        },
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

    token = token_data["access_token"]

    # Access /auth/me with Bearer token
    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "charlie@example.com"
    assert me_data["name"] == "Charlie"


def test_login_invalid_password_fails(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Dave",
            "email": "dave@example.com",
            "password": "correctpassword",
        },
    )

    bad_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "dave@example.com",
            "password": "wrongpassword",
        },
    )
    assert bad_login.status_code == 401
    assert "Invalid email or password" in bad_login.json()["detail"]


def test_logout(client):
    res = client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert res.json()["message"] == "Logged out successfully"


def test_access_protected_route_without_token_fails(client):
    """Test requirement: Access protected route without token → 401."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert "Not authenticated" in res.json()["detail"] or "credentials" in res.json()["detail"].lower()


def test_access_protected_route_with_expired_token_fails(client):
    """Test requirement: Access protected route with expired token → 401."""
    from datetime import UTC, datetime, timedelta

    import jwt

    from app.core.config import settings

    expired_payload = {
        "sub": "1",
        "exp": datetime.now(UTC) - timedelta(hours=1),
    }
    secret = settings.jwt_secret
    expired_token = jwt.encode(expired_payload, secret, algorithm=settings.JWT_ALGORITHM)

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()
