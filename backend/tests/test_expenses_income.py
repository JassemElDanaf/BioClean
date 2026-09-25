"""Expenses and Income are structurally identical ledgers (see their
models' docstrings) - one test file for both rather than duplicating the
same cases twice under different names."""

EXPENSES_URL = "/api/v1/expenses"
INCOME_URL = "/api/v1/income"


def test_create_and_list_expense(client):
	res = client.post(EXPENSES_URL, json={"category": "Rent", "amount": 500, "description": "October rent"})
	assert res.status_code == 201, res.text
	assert res.json()["category"] == "Rent"

	res = client.get(EXPENSES_URL)
	assert len(res.json()) == 1


def test_expense_rejects_non_positive_amount(client):
	res = client.post(EXPENSES_URL, json={"category": "Rent", "amount": 0})
	assert res.status_code == 422


def test_update_and_delete_expense(client):
	created = client.post(EXPENSES_URL, json={"category": "Rent", "amount": 500}).json()

	res = client.put(f"{EXPENSES_URL}/{created['id']}", json={"category": "Utilities", "amount": 120})
	assert res.status_code == 200
	assert res.json()["category"] == "Utilities"

	assert client.delete(f"{EXPENSES_URL}/{created['id']}").status_code == 204
	assert client.get(EXPENSES_URL).json() == []


def test_expense_date_filter_and_total_count(client):
	client.post(EXPENSES_URL, json={"category": "Rent", "amount": 500, "date": "2020-01-15T00:00:00Z"})
	client.post(EXPENSES_URL, json={"category": "Utilities", "amount": 100})

	res = client.get(f"{EXPENSES_URL}?from_date=2020-01-01&to_date=2020-01-31")
	assert len(res.json()) == 1
	assert res.json()[0]["category"] == "Rent"

	assert int(client.get(EXPENSES_URL).headers["x-total-count"]) == 2


def test_create_and_list_income(client):
	res = client.post(INCOME_URL, json={"source": "Bank Interest", "amount": 15.5})
	assert res.status_code == 201
	assert res.json()["source"] == "Bank Interest"
	assert len(client.get(INCOME_URL).json()) == 1


def test_update_and_delete_income(client):
	created = client.post(INCOME_URL, json={"source": "Bank Interest", "amount": 15.5}).json()
	res = client.put(f"{INCOME_URL}/{created['id']}", json={"source": "Refund", "amount": 20})
	assert res.json()["source"] == "Refund"

	assert client.delete(f"{INCOME_URL}/{created['id']}").status_code == 204
	assert client.get(INCOME_URL).json() == []


def test_rename_expense_category_updates_every_matching_expense(client):
	client.post(EXPENSES_URL, json={"category": "Old Name", "amount": 100})
	client.post(EXPENSES_URL, json={"category": "Old Name", "amount": 50})
	client.post(EXPENSES_URL, json={"category": "Other", "amount": 25})

	res = client.put(f"{EXPENSES_URL}/categories/Old Name", json={"new_category": "New Name"})
	assert res.status_code == 200, res.text
	assert res.json()["updated"] == 2

	categories = [e["category"] for e in client.get(EXPENSES_URL).json()]
	assert categories.count("New Name") == 2
	assert categories.count("Old Name") == 0
	assert categories.count("Other") == 1


def test_rename_expense_category_rejects_blank_new_name(client):
	client.post(EXPENSES_URL, json={"category": "Rent", "amount": 100})
	res = client.put(f"{EXPENSES_URL}/categories/Rent", json={"new_category": ""})
	assert res.status_code == 422
