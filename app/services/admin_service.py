"""Admin authentication, audit logging and observability."""
from sqlalchemy.orm import Session

from ..models import AdminAuditLog, SystemHealth, User


def log_admin_action(db: Session, admin: User, action: str, target_type: str | None = None, target_id: str | None = None, otp_session_id: str | None = None, details: dict | None = None, ip: str | None = None) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            otp_session_id=otp_session_id,
            details=details,
            ip_address=ip,
        )
    )
    db.commit()


def list_audit_logs(db: Session, limit: int = 100) -> list[AdminAuditLog]:
    return db.query(AdminAuditLog).order_by(AdminAuditLog.timestamp.desc()).limit(limit).all()


def record_health(db: Session, score: int, component: str | None = None, status: str = "ok", message: str | None = None) -> SystemHealth:
    row = SystemHealth(health_score=score, component=component, status=status, message=message)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def compute_health_score(db: Session) -> dict:
    """Compute a 0-100 health score based on system signals."""
    score = 100
    warnings = []

    otp_ok = True  # placeholder; could inspect audit logs
    if not otp_ok:
        score -= 10
        warnings.append("OTP verification degraded")

    from .platform import get_flags

    flags = get_flags(db)
    if flags.get("globalEmergency", False):
        score -= 40
        warnings.append("Global emergency kill switch is ACTIVE")
    if flags.get("callsKillSwitch", False):
        score -= 10
        warnings.append("Calls kill switch is ACTIVE")
    if flags.get("chatKillSwitch", False):
        score -= 10
        warnings.append("Chat kill switch is ACTIVE")

    return {"score": max(0, score), "warnings": warnings, "recordedAt": None}
