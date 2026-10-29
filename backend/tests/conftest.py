import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # Ensure all models are registered on Base.metadata
from app.db.base import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    def _create_headers(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}
    return _create_headers


@pytest.fixture
def seed_household(client):
    """Fixture providing a pre-created household with 3 active members."""
    # 1. Register members
    client.post("/api/v1/auth/register", json={"name": "Alice Admin", "email": "alice_seed@example.com", "password": "password123"})
    client.post("/api/v1/auth/register", json={"name": "Bob Roommate", "email": "bob_seed@example.com", "password": "password123"})
    client.post("/api/v1/auth/register", json={"name": "Charlie Guest", "email": "charlie_seed@example.com", "password": "password123"})

    # 2. Login
    tok_a = client.post("/api/v1/auth/login", json={"email": "alice_seed@example.com", "password": "password123"}).json()["access_token"]
    tok_b = client.post("/api/v1/auth/login", json={"email": "bob_seed@example.com", "password": "password123"}).json()["access_token"]
    tok_c = client.post("/api/v1/auth/login", json={"email": "charlie_seed@example.com", "password": "password123"}).json()["access_token"]

    head_a = {"Authorization": f"Bearer {tok_a}"}
    head_b = {"Authorization": f"Bearer {tok_b}"}
    head_c = {"Authorization": f"Bearer {tok_c}"}

    user_a = client.get("/api/v1/auth/me", headers=head_a).json()
    user_b = client.get("/api/v1/auth/me", headers=head_b).json()
    user_c = client.get("/api/v1/auth/me", headers=head_c).json()

    # 3. Create household
    h_res = client.post("/api/v1/households", headers=head_a, json={"name": "Fixture House", "currency": "INR"})
    h_id = h_res.json()["id"]

    # 4. Join members
    inv_b = client.post(f"/api/v1/households/{h_id}/invitations", headers=head_a).json()["token"]
    client.post(f"/api/v1/invitations/{inv_b}/accept", headers=head_b)

    inv_c = client.post(f"/api/v1/households/{h_id}/invitations", headers=head_a).json()["token"]
    client.post(f"/api/v1/invitations/{inv_c}/accept", headers=head_c)

    return {
        "household_id": h_id,
        "owner": user_a,
        "owner_headers": head_a,
        "member_b": user_b,
        "member_b_headers": head_b,
        "member_c": user_c,
        "member_c_headers": head_c,
    }


def assert_balance_invariant(household_id: int, db, actor_id: int):
    """
    Core Financial Invariant:
    The sum of all member net balances in a household must ALWAYS equal 0.
    """
    from app.services.settlement_service import calculate_household_balances
    balances = calculate_household_balances(db, household_id, actor_id)
    total = sum(b.net_balance_paise for b in balances)
    assert total == 0, f"Balance invariant violated: total sum is {total}"
    return balances
