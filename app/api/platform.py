"""Subscriptions, beta access, and feature flag routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_super_admin, require_admin
from ..models import FeatureFlag, User
from ..schemas import (
    BetaActivateRequest,
    BetaInviteRequest,
    FeatureFlagOut,
    FeatureFlagUpdate,
    SubscriptionPlanOut,
)
from ..services import platform
from ..services.admin_service import log_admin_action

router = APIRouter(tags=["platform"])


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
@router.get("/subscriptions/plans", response_model=list[SubscriptionPlanOut])
def plans(db: Session = Depends(get_db)):
    return platform.list_subscription_plans(db)


# ---------------------------------------------------------------------------
# Beta access
# ---------------------------------------------------------------------------
@router.post("/beta/invite")
def beta_invite(body: BetaInviteRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.admin_role:
        raise HTTPException(status_code=403, detail="Admin access required")
    beta, error = platform.invite_beta_user(db, body.phone_number, body.email, body.cohort, user.id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    log_admin_action(db, user, "BETA_INVITE", "beta_user", beta.id, details={"phone": body.phone_number, "cohort": body.cohort})
    return {"invite_code": beta.invite_code, "cohort": beta.cohort}


@router.post("/beta/activate")
def beta_activate(body: BetaActivateRequest, db: Session = Depends(get_db)):
    ok, error = platform.activate_beta(db, body.invite_code)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    return {"success": True, "message": "Beta access activated"}


@router.get("/beta/status")
def beta_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"authorized": platform.is_beta_authorized(db, user.phone)}


# ---------------------------------------------------------------------------
# Feature flags (SUPER_ADMIN)
# ---------------------------------------------------------------------------
@router.get("/flags", response_model=list[FeatureFlagOut])
def list_flags(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return db.query(FeatureFlag).order_by(FeatureFlag.name).all()


@router.put("/flags/{name}", response_model=FeatureFlagOut)
def update_flag(name: str, body: FeatureFlagUpdate, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    flag = platform.set_flag(db, name, body.enabled, user.id)
    log_admin_action(db, user, "FEATURE_FLAG_UPDATE", "feature_flag", flag.id, details={"name": name, "enabled": body.enabled})
    return flag
