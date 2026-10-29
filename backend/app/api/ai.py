import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.ai import ChatRequest, ChatResponse
from app.services.ai_service import ai_service

router = APIRouter(prefix="/households/{id}/ai", tags=["ai"])


class UserRateLimiter:
    """In-memory sliding window rate limiter per user."""

    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[int, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, user_id: int) -> None:
        now = time.time()
        with self._lock:
            cutoff = now - self.window_seconds
            # Purge stale requests
            valid = [ts for ts in self._requests[user_id] if ts > cutoff]
            if len(valid) >= self.max_requests:
                oldest = valid[0]
                retry_after = max(1, int(self.window_seconds - (now - oldest)))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Max {self.max_requests} messages per minute.",
                    headers={"Retry-After": str(retry_after)},
                )
            valid.append(now)
            self._requests[user_id] = valid

    def reset(self, user_id: int | None = None) -> None:
        with self._lock:
            if user_id is not None:
                self._requests.pop(user_id, None)
            else:
                self._requests.clear()


ai_rate_limiter = UserRateLimiter(max_requests=10, window_seconds=60)


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
)
def chat_with_household_ai(
    id: int,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message to the household AI assistant.
    Grounded in verified database records via strictly authorized tools.
    Never auto-saves expenses — drafts require explicit user confirmation.
    """
    # 1. Enforce per-user rate limit
    ai_rate_limiter.check(current_user.id)

    # 2. Process conversation securely
    return ai_service.process_chat(
        db=db,
        household_id=id,
        actor_id=current_user.id,
        request=request,
    )
