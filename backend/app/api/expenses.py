
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.models.expense import Category
from app.models.user import User
from app.schemas.expense import (
    CategoryResponse,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseSummary,
    ExpenseUpdate,
)
from app.services.expense_service import (
    create_expense,
    edit_expense,
    get_expense_detail,
    get_household_expenses,
    reverse_expense,
)

household_expenses_router = APIRouter(prefix="/households/{id}", tags=["expenses"])
expenses_router = APIRouter(prefix="/expenses", tags=["expenses"])


# 1. POST /api/v1/households/{id}/expenses — Add expense
@household_expenses_router.post(
    "/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_household_expense(
    id: int,
    data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a new expense with atomic split allocation and audit tracking."""
    expense = create_expense(
        db=db,
        household_id=id,
        actor_id=current_user.id,
        data=data,
    )
    return expense


# 2. GET /api/v1/households/{id}/expenses — List expenses
@household_expenses_router.get(
    "/expenses",
    response_model=list[ExpenseSummary],
)
def list_household_expenses(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all expenses for a given household."""
    expenses = get_household_expenses(
        db=db,
        household_id=id,
        actor_id=current_user.id,
    )
    return expenses


# Helper: GET /api/v1/households/{id}/categories — List categories
@household_expenses_router.get(
    "/categories",
    response_model=list[CategoryResponse],
)
def list_household_categories(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all default and custom categories for a household."""
    return db.query(Category).filter(Category.household_id == id).all()


# 3. GET /api/v1/expenses/{id} — Single expense detail
@expenses_router.get(
    "/{id}",
    response_model=ExpenseResponse,
)
def get_single_expense(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full expense details including participant splits."""
    expense = get_expense_detail(
        db=db,
        expense_id=id,
        actor_id=current_user.id,
    )
    return expense


# 4. PATCH /api/v1/expenses/{id} — Edit expense
@expenses_router.patch(
    "/{id}",
    response_model=ExpenseResponse,
)
def update_expense(
    id: int,
    data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit expense metadata and log edit action to audit trail."""
    expense = edit_expense(
        db=db,
        expense_id=id,
        actor_id=current_user.id,
        data=data,
    )
    return expense


# 5. POST /api/v1/expenses/{id}/reverse — Reverse expense
@expenses_router.post(
    "/{id}/reverse",
    response_model=ExpenseResponse,
)
def reverse_existing_expense(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reverse an expense with an atomic counter-entry and audit record."""
    expense, _ = reverse_expense(
        db=db,
        expense_id=id,
        actor_id=current_user.id,
    )
    return expense
