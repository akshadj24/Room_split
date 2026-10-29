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
    owner, o_tok = _register_and_login(client, "Owner User", "owner_st@example.com")
    r1, r1_tok = _register_and_login(client, "Roommate 1", "r1_st@example.com")
    r2, r2_tok = _register_and_login(client, "Roommate 2", "r2_st@example.com")

    h_res = client.post(
        "/api/v1/households",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={"name": "Settlement Apt", "currency": "INR"},
    )
    h_id = h_res.json()["id"]

    inv1 = client.post(
        f"/api/v1/households/{h_id}/invitations",
        headers={"Authorization": f"Bearer {o_tok}"},
    ).json()["token"]
    client.post(f"/api/v1/invitations/{inv1}/accept", headers={"Authorization": f"Bearer {r1_tok}"})

    inv2 = client.post(
        f"/api/v1/households/{h_id}/invitations",
        headers={"Authorization": f"Bearer {o_tok}"},
    ).json()["token"]
    client.post(f"/api/v1/invitations/{inv2}/accept", headers={"Authorization": f"Bearer {r2_tok}"})

    return h_id, owner, o_tok, r1, r1_tok, r2, r2_tok


def test_balance_invariant_sum_equals_zero(client):
    """Test requirement: Balance invariant - sum of all member balances must always equal 0."""
    h_id, owner, o_tok, r1, _r1_tok, r2, _r2_tok = _setup_household_with_members(client)

    # Owner pays 9000 paise (₹90) split equally among owner, r1, r2
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 9000,
            "paid_by": owner["id"],
            "description": "Internet router",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"], r2["id"]],
        },
    )

    bal_res = client.get(
        f"/api/v1/households/{h_id}/balances",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert bal_res.status_code == 200
    balances = bal_res.json()["balances"]
    assert len(balances) == 3

    bal_dict = {b["user_id"]: b["net_balance_paise"] for b in balances}
    # Owner paid 9000, owes 3000 -> net +6000
    # r1 owes 3000 -> net -3000
    # r2 owes 3000 -> net -3000
    assert bal_dict[owner["id"]] == 6000
    assert bal_dict[r1["id"]] == -3000
    assert bal_dict[r2["id"]] == -3000
    assert sum(bal_dict.values()) == 0


def test_pending_settlement_does_not_affect_balance(client):
    """Test requirement: Pending settlement doesn't change balance."""
    h_id, owner, o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # Owner pays 6000 paise split between owner and r1 (3000 each)
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 6000,
            "paid_by": owner["id"],
            "description": "Groceries",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )

    # r1 records a pending repayment of 3000 to owner
    set_res = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json={
            "payer_id": r1["id"],
            "receiver_id": owner["id"],
            "amount_paise": 3000,
        },
    )
    assert set_res.status_code == 201
    assert set_res.json()["status"] == "pending"

    # Balances must still show r1 at -3000 and owner at +3000 because settlement is still pending
    bal_res = client.get(
        f"/api/v1/households/{h_id}/balances",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    bal_dict = {b["user_id"]: b["net_balance_paise"] for b in bal_res.json()["balances"]}
    assert bal_dict[owner["id"]] == 3000
    assert bal_dict[r1["id"]] == -3000


def test_confirmed_settlement_changes_balance_exactly_once(client):
    """Test requirement: Confirmed settlement changes balance exactly once."""
    h_id, owner, o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # Owner pays 6000 split between owner and r1
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 6000,
            "paid_by": owner["id"],
            "description": "Electricity",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )

    # r1 records repayment of 3000 to owner
    set_res = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json={
            "payer_id": r1["id"],
            "receiver_id": owner["id"],
            "amount_paise": 3000,
        },
    )
    settlement_id = set_res.json()["id"]

    # Receiver (owner) confirms settlement
    conf_res = client.patch(
        f"/api/v1/settlements/{settlement_id}/confirm",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert conf_res.status_code == 200
    assert conf_res.json()["status"] == "confirmed"

    # Now balances should be 0 for both!
    bal_res = client.get(
        f"/api/v1/households/{h_id}/balances",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    bal_dict = {b["user_id"]: b["net_balance_paise"] for b in bal_res.json()["balances"]}
    assert bal_dict[owner["id"]] == 0
    assert bal_dict[r1["id"]] == 0
    assert sum(bal_dict.values()) == 0


def test_receiver_only_confirmation_enforced(client):
    """Test requirement: Only receiver can confirm, not payer."""
    h_id, owner, _o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # r1 records repayment to owner
    set_res = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json={
            "payer_id": r1["id"],
            "receiver_id": owner["id"],
            "amount_paise": 2000,
        },
    )
    settlement_id = set_res.json()["id"]

    # Payer (r1) tries to confirm their own repayment → rejected!
    bad_conf = client.patch(
        f"/api/v1/settlements/{settlement_id}/confirm",
        headers={"Authorization": f"Bearer {r1_tok}"},
    )
    assert bad_conf.status_code == 403
    assert "Only the receiver can confirm" in bad_conf.json()["detail"]


def test_duplicate_post_with_idempotency_key(client):
    """Test requirement: Duplicate POST with same idempotency key → single record."""
    h_id, owner, _o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    payload = {
        "payer_id": r1["id"],
        "receiver_id": owner["id"],
        "amount_paise": 1500,
        "idempotency_key": "unique-payment-uuid-12345",
    }

    res1 = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json=payload,
    )
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    # Retry identical request with same idempotency key
    res2 = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json=payload,
    )
    assert res2.status_code == 201
    id2 = res2.json()["id"]

    assert id1 == id2


def test_partial_repayment_handled_correctly(client):
    """Test requirement: Partial repayment handled correctly."""
    h_id, owner, o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # Owner pays 10000 split between owner and r1 (r1 owes 5000)
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 10000,
            "paid_by": owner["id"],
            "description": "Big grocery trip",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )

    # r1 partially repays 2000 of 5000
    set_res = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json={
            "payer_id": r1["id"],
            "receiver_id": owner["id"],
            "amount_paise": 2000,
        },
    )
    settlement_id = set_res.json()["id"]

    # Confirm partial repayment
    client.patch(
        f"/api/v1/settlements/{settlement_id}/confirm",
        headers={"Authorization": f"Bearer {o_tok}"},
    )

    # Remaining debt for r1 should be -3000, owner should be +3000
    bal_res = client.get(
        f"/api/v1/households/{h_id}/balances",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    bal_dict = {b["user_id"]: b["net_balance_paise"] for b in bal_res.json()["balances"]}
    assert bal_dict[owner["id"]] == 3000
    assert bal_dict[r1["id"]] == -3000
    assert sum(bal_dict.values()) == 0


def test_transfer_suggestions_greedy_matching(client):
    """
    Test requirement: Transfer suggestions match largest debtor to largest creditor.
    Matches the example in user plan:
    Owner pays 1000, r1 owes 500, r2 owes 500.
    """
    h_id, owner, o_tok, r1, _r1_tok, r2, _r2_tok = _setup_household_with_members(client)

    # Owner pays 100000 paise (₹1000) with r1 owing 50000, r2 owing 50000
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 100000,
            "paid_by": owner["id"],
            "description": "Furniture",
            "split_type": "custom",
            "participants": [r1["id"], r2["id"]],
            "shares": {
                r1["id"]: 50000,
                r2["id"]: 50000,
            },
        },
    )

    sug_res = client.get(
        f"/api/v1/households/{h_id}/settlements/suggestions",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert sug_res.status_code == 200
    suggestions = sug_res.json()
    assert len(suggestions) == 2
    # Both r1 and r2 pay owner 50000 each
    recipients = {s["to_user_id"] for s in suggestions}
    assert recipients == {owner["id"]}
    total_suggested = sum(s["amount_paise"] for s in suggestions)
    assert total_suggested == 100000


def test_balance_breakdown_shows_contributing_items(client):
    """Test requirement: Breakdown shows contributing expenses and settlements."""
    h_id, owner, o_tok, r1, _r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    # Expense 1: Owner pays 4000, r1 share 2000
    client.post(
        f"/api/v1/households/{h_id}/expenses",
        headers={"Authorization": f"Bearer {o_tok}"},
        json={
            "amount_paise": 4000,
            "paid_by": owner["id"],
            "description": "Snacks and coffee",
            "split_type": "equal",
            "participants": [owner["id"], r1["id"]],
        },
    )

    # Breakdown for r1
    res = client.get(
        f"/api/v1/households/{h_id}/balances/{r1['id']}/breakdown",
        headers={"Authorization": f"Bearer {o_tok}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["net_balance_paise"] == -2000
    assert len(data["items"]) >= 1
    assert data["items"][0]["effect_paise"] == -2000
    assert "Snacks and coffee" in data["items"][0]["description"]


def test_cancel_pending_settlement(client):
    h_id, owner, _o_tok, r1, r1_tok, _r2, _r2_tok = _setup_household_with_members(client)

    set_res = client.post(
        f"/api/v1/households/{h_id}/settlements",
        headers={"Authorization": f"Bearer {r1_tok}"},
        json={
            "payer_id": r1["id"],
            "receiver_id": owner["id"],
            "amount_paise": 1000,
        },
    )
    s_id = set_res.json()["id"]

    cancel_res = client.patch(
        f"/api/v1/settlements/{s_id}/cancel",
        headers={"Authorization": f"Bearer {r1_tok}"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"
