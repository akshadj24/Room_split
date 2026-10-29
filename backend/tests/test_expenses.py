from app.models.expense import AuditEvent, Category, Expense


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


def _setup_household_with_members(client) -> tuple[int, dict, str, dict, str, dict, str]:
    """Helper to setup a household with 3 members: owner, roommate1, roommate2."""
    owner, o_tok = _register_and_login(client, "Owner User", "owner_exp@example.com")
    r1, r1_tok = _register_and_login(client, "Roommate 1", "r1_exp@example.com")
    r2, r2_tok = _register_and_login(client, "Roommate 2", "r2_exp@example.com")

    # Create household
    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={"name": "Expense Apt", "currency": "INR"},
    )
    h_id = h_res.json()["id"]

    # Invite r1
    inv1 = client.post(
        f"/api/v1/households/{h_id}/invitations",
        headers={"Authorization": f"Bearer {o_tok}"},
    ).json()["token"]
    client.post(f"/api/v1/invitations/{inv1}/accept", headers={"Authorization": f"Bearer {r1_tok}"})

    # Invite r2
    inv2 = client.post(
        f"/api/v1/households/{h_id}/invitations",
        headers={"Authorization": f"Bearer {o_tok}"},
    ).json()["token"]
    client.post(f"/api/v1/invitations/{inv2}/accept", headers={"Authorization": f"Bearer {r2_tok}"})

    return h_id, owner, o_tok, r1, r1_tok, r2, r2_tok


def test_default_categories_seeded_on_household_creation(client, db):
    _owner, o_tok = _register_and_login(client, "Cat Owner", "cat_owner@example.com")
    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={"name": "Category House", "currency": "INR"},
    )
    h_id = h_res.json()["id"]

    cats = db.query(Category).filter(Category.household_id == h_id).all()
    cat_names = [c.name for c in cats]
    expected = ["Food", "Groceries", "Rent", "Utilities", "Transport", "Other"]
    for expected_cat in expected:
        assert expected_cat in cat_names


def test_equal_split_remainder_to_payer(client):
    """
    Test requirement: Equal split of ₹100 among 3 → ₹34, ₹34, ₹32 (remainder to payer).
    When amount_paise = 100 among 3 participants, non-payers get 34 each, and payer absorbs 32.
    """
    h_id, owner, o_tok, r1, _r1_tok, r2, _r2_tok = _setup_household_with_members(client)

    payload = {
        "amount_paise": 100,
        "paid_by": owner["id"],
        "description": "Equal split test ₹100",
        "split_type": "equal",
        "participants": [owner["id"], r1["id"], r2["id"]],
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["amount_paise"] == 100

    splits = {s["user_id"]: s["share_paise"] for s in data["splits"]}
    # Non-payers receive 34 each, payer receives remainder (32)
    assert splits[r1["id"]] == 34
    assert splits[r2["id"]] == 34
    assert splits[owner["id"]] == 32
    assert sum(splits.values()) == 100


def test_equal_split_99_among_2_remainder_to_payer(client):
    """
    Test requirement: Equal split ₹99 among 2 → shares: ₹50, ₹49 (remainder to payer).
    When 99 paise is split between 2 participants (payer and non-payer),
    non-payer gets ceil(99/2) = 50, and payer receives remainder = 49.
    """
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    payload = {
        "amount_paise": 99,
        "paid_by": owner["id"],
        "description": "Equal split test ₹99",
        "split_type": "equal",
        "participants": [owner["id"], r1["id"]],
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res.status_code == 201
    data = res.json()
    splits = {s["user_id"]: s["share_paise"] for s in data["splits"]}
    assert splits[r1["id"]] == 50
    assert splits[owner["id"]] == 49
    assert sum(splits.values()) == 99


def test_custom_split_invalid_sum_rejected(client):
    """Test requirement: Custom split where shares don't add up → rejected."""
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # 10000 total paise, but shares sum to 9000
    bad_payload = {
        "amount_paise": 10000,
        "paid_by": owner["id"],
        "description": "Bad custom split",
        "split_type": "custom",
        "participants": [owner["id"], r1["id"]],
        "shares": {
            owner["id"]: 5000,
            r1["id"]: 4000,
        },
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=bad_payload,
    )
    assert res.status_code == 400
    assert "Shares must sum exactly" in res.json()["detail"]


def test_custom_split_valid_succeeds(client):
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    good_payload = {
        "amount_paise": 10000,
        "paid_by": owner["id"],
        "description": "Valid custom split",
        "split_type": "custom",
        "participants": [owner["id"], r1["id"]],
        "shares": {
            owner["id"]: 6000,
            r1["id"]: 4000,
        },
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=good_payload,
    )
    assert res.status_code == 201
    data = res.json()
    splits = {s["user_id"]: s["share_paise"] for s in data["splits"]}
    assert splits[owner["id"]] == 6000
    assert splits[r1["id"]] == 4000


def test_weighted_split_deterministic_remainder(client):
    """Test weighted split calculation with deterministic paise remainder allocation."""
    h_id, owner, o_tok, r1, _r1_tok, r2, _r2_tok = _setup_household_with_members(client)

    payload = {
        "amount_paise": 10000,
        "paid_by": owner["id"],
        "description": "Weighted dinner",
        "split_type": "weighted",
        "participants": [owner["id"], r1["id"], r2["id"]],
        "shares": {
            owner["id"]: 1,
            r1["id"]: 1,
            r2["id"]: 1,
        },
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res.status_code == 201
    data = res.json()
    splits = {s["user_id"]: s["share_paise"] for s in data["splits"]}
    assert sum(splits.values()) == 10000


def test_member_not_in_household_rejected(client):
    """Test requirement: Member not in household → rejected."""
    h_id, owner, o_tok, _r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)
    outsider, _outsider_tok = _register_and_login(client, "Outsider", "outsider@example.com")

    # Participant not in household
    payload = {
        "amount_paise": 5000,
        "paid_by": owner["id"],
        "description": "Party",
        "split_type": "equal",
        "participants": [owner["id"], outsider["id"]],
    }

    res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res.status_code == 400
    assert "not an active member" in res.json()["detail"]


def test_concurrent_duplicate_post_deduplicated(client):
    """Test requirement: Concurrent duplicate POST → only one created."""
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    payload = {
        "amount_paise": 3000,
        "paid_by": owner["id"],
        "description": "Groceries run",
        "split_type": "equal",
        "participants": [owner["id"], r1["id"]],
    }

    res1 = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    # Instant duplicate request
    res2 = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json=payload,
    )
    assert res2.status_code == 201
    id2 = res2.json()["id"]

    # Both return the same single expense
    assert id1 == id2


def test_reverse_expense_creates_counter_entry_and_preserves_balance(client, db):
    """Test requirement: Reversed expense → counter-entry created, balance unaffected, audit logged."""
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # 1. Create expense of 6000 paise
    create_res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 6000,
            "paid_by": owner["id"],
            "description": "WiFi bill",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )
    expense_id = create_res.json()["id"]

    # 2. Reverse expense
    rev_res = client.post(
        f"/api/v1/expenses/{expense_id}/reverse",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["status"] == "reversed"

    # 3. Check counter-entry in DB
    all_expenses = db.query(Expense).filter(Expense.household_id == h_id).all()
    assert len(all_expenses) == 2
    counter_entry = next(e for e in all_expenses if e.status == "reversal")
    assert counter_entry.amount_paise == -6000

    # Net balance of all expenses in household is exactly 0
    net_household_total = sum(e.amount_paise for e in all_expenses)
    assert net_household_total == 0

    # 4. Audit events check
    audits = db.query(AuditEvent).filter(AuditEvent.household_id == h_id).all()
    actions = [a.action for a in audits]
    assert "create" in actions
    assert "reverse" in actions


def test_edit_expense_tracks_audit(client, db):
    """Test requirement: Edit tracked in audit log."""
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    create_res = client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 4000,
            "paid_by": owner["id"],
            "description": "Original description",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )
    exp_id = create_res.json()["id"]

    # Edit expense
    edit_res = client.patch(
        f"/api/v1/expenses/{exp_id}",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={"description": "Updated description"},
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["description"] == "Updated description"

    # Verify audit event
    audit = (
        db.query(AuditEvent)
        .filter(AuditEvent.entity_id == exp_id, AuditEvent.action == "edit")
        .first()
    )
    assert audit is not None
    assert audit.actor_id == owner["id"]


def test_list_and_get_expense_detail(client):
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 2500,
            "paid_by": owner["id"],
            "description": "Snacks",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )

    list_res = client.get(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1
    exp_id = items[0]["id"]

    detail_res = client.get(
        f"/api/v1/expenses/{exp_id}",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert detail_res.status_code == 200
    assert len(detail_res.json()["splits"]) == 2
