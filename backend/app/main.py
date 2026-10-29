import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.expenses import expenses_router, household_expenses_router
from app.api.households import router as households_router
from app.api.invitations import router as invitations_router
from app.api.reminders import household_reminders_router, reminders_router
from app.api.settlements import household_settlements_router, settlements_router
from app.core.config import settings
from app.db.base import SessionLocal
from app.services.reminder_service import (
    process_bill_due_reminders,
    process_pending_balance_nudges,
)

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def run_morning_bill_due_job():
    """Every morning job: check bill due dates and send reminders."""
    db = SessionLocal()
    try:
        sent = process_bill_due_reminders(db)
        logger.info(f"Morning reminder job executed: {sent} reminders sent.")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Error executing morning reminder job: {e}")
    finally:
        db.close()


def run_evening_pending_balance_job():
    """Every evening job: check pending balances and nudge members."""
    db = SessionLocal()
    try:
        sent = process_pending_balance_nudges(db)
        logger.info(f"Evening nudge job executed: {sent} nudges sent.")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Error executing evening nudge job: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background scheduler if not explicitly disabled
    if settings.APP_ENV != "test":
        scheduler.add_job(
            run_morning_bill_due_job,
            "cron",
            hour=9,
            minute=0,
            id="morning_bill_due_reminders",
            replace_existing=True,
        )
        scheduler.add_job(
            run_evening_pending_balance_job,
            "cron",
            hour=19,
            minute=0,
            id="evening_pending_balance_nudges",
            replace_existing=True,
        )
        try:
            scheduler.start()
            logger.info("APScheduler started with recurring reminder jobs.")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not start APScheduler: {e}")

    yield

    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")


app = FastAPI(title="RoomSplit API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(households_router, prefix="/api/v1/households", tags=["households"])
app.include_router(invitations_router, prefix="/api/v1/invitations", tags=["invitations"])
app.include_router(household_expenses_router, prefix="/api/v1", tags=["expenses"])
app.include_router(expenses_router, prefix="/api/v1", tags=["expenses"])
app.include_router(household_settlements_router, prefix="/api/v1", tags=["settlements"])
app.include_router(settlements_router, prefix="/api/v1", tags=["settlements"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])
app.include_router(household_reminders_router, prefix="/api/v1", tags=["reminders"])
app.include_router(reminders_router, prefix="/api/v1", tags=["reminders"])

@app.get("/health")
def health():
    return {"status": "ok"}

