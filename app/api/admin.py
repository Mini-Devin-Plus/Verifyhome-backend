"""Admin portal routes: login, user management, audit, health."""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin, require_super_admin
from ..models import AdminAuditLog, FraudScore, SystemHealth, User
from ..schemas import AdminLoginRequest, FeatureFlagOut, FeatureFlagUpdate, HealthOut
from ..security import verify_password
from ..services import admin_service, platform
from ..services.admin_service import log_admin_action
from ..services.otp_auth import create_admin_session_token

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAILS = {
    "superadmin@verifyhome.com": "SUPER_ADMIN",
    "senioradmin@verifyhome.com": "SENIOR_ADMIN",
    "admin@verifyhome.com": "ADMIN",
}


@router.post("/login")
def admin_login(body: AdminLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    if not user.admin_role:
        raise HTTPException(status_code=403, detail="Not an admin account")
    token = create_admin_session_token(user)
    return {"token": token, "admin_role": user.admin_role, "name": user.name, "email": user.email}


@router.get("/health", response_model=HealthOut)
def health(db: Session = Depends(get_db)):
    return admin_service.compute_health_score(db)


@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "phone": u.phone,
            "email": u.email,
            "role": u.role,
            "verification_status": u.verification_status,
            "is_suspended": u.is_suspended,
            "admin_role": u.admin_role,
            "created_at": u.created_at,
        }
        for u in rows
    ]


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_suspended = True
    db.commit()
    log_admin_action(db, admin, "SUSPEND_USER", "user", user.id)
    return {"success": True, "user_id": user_id}


@router.post("/users/{user_id}/activate")
def activate_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_suspended = False
    db.commit()
    log_admin_action(db, admin, "ACTIVATE_USER", "user", user.id)
    return {"success": True, "user_id": user_id}


@router.get("/audit")
def audit_logs(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return admin_service.list_audit_logs(db)
