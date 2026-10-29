from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import authenticate_user, register_user

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user with name, email, and password."""
    user = register_user(db, data)
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with email & password and return a JWT access token."""
    user = authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/logout")
def logout():
    """Logout endpoint for clients to clear token state."""
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the profile of the currently authenticated user including active household."""
    from app.models.household import Household, HouseholdMember

    membership = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.user_id == current_user.id,
            HouseholdMember.status == "active",
        )
        .order_by(HouseholdMember.id.desc())
        .first()
    )

    household_id = None
    role = None

    if membership:
        household_id = membership.household_id
        role = membership.role
    else:
        created_household = (
            db.query(Household)
            .filter(Household.created_by == current_user.id)
            .order_by(Household.id.asc())
            .first()
        )
        if created_household:
            household_id = created_household.id
            role = "owner"
            hm = HouseholdMember(
                household_id=created_household.id,
                user_id=current_user.id,
                role="owner",
                status="active",
            )
            db.add(hm)
            db.commit()
        else:
            from app.schemas.household import HouseholdCreate
            from app.services.household_service import create_household

            new_household = create_household(
                db=db,
                creator_id=current_user.id,
                data=HouseholdCreate(name=f"{current_user.name}'s Home", currency="INR"),
            )
            household_id = new_household.id
            role = "owner"

    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        created_at=current_user.created_at,
        household_id=household_id,
        role=role,
    )
