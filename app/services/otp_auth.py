"""OTP and authentication services."""
import httpx
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from ..config import settings
from ..models import OTPAuditLog, OTPSession, User, UserSession
from ..security import create_session_token, generate_otp, hash_otp

OTP_LIFETIME_MINUTES = 5


def _audit(db: Session, phone: str, purpose: str, action: str, success: bool, attempts: int = 0, error_reason: str | None = None, ip: str | None = None) -> None:
    db.add(
        OTPAuditLog(
            phone_number=phone,
            purpose=purpose,
            action=action,
            success=success,
            attempts=attempts,
            error_reason=error_reason,
            ip_address=ip,
        )
    )


def _send_via_termii(phone: str, otp: str) -> bool:
    if settings.mock_otp:
        return True
    try:
        resp = httpx.post(
            "https://api.ng.termii.com/api/sms/otp/send",
            json={
                "api_key": settings.TERMII_API_KEY,
                "message_type": "NUMERIC",
                "to": phone,
                "from": settings.TERMII_SENDER_ID,
                "channel": "generic",
                "pin_attempts": 5,
                "pin_time_to_live": OTP_LIFETIME_MINUTES * 60,
                "pin_length": 6,
                "pin_placeholder": "< 123456 >",
                "message_text": f"Your VerifyHome code is < 123456 >. It expires in {OTP_LIFETIME_MINUTES} minutes.",
            },
            timeout=15,
        )
        return resp.status_code == 200
    except Exception:
        return False


def send_otp(db: Session, phone_number: str, purpose: str, ip: str | None = None) -> tuple[OTPSession | None, str | None]:
    """Create an OTP session and deliver the code. Returns (session, error)."""
    existing = (
        db.query(OTPSession)
        .filter(OTPSession.phone_number == phone_number, OTPSession.is_verified == False)  # noqa: E712
        .order_by(OTPSession.created_at.desc())
        .first()
    )
    if existing and datetime.utcnow() < existing.created_at + timedelta(seconds=30):
        _audit(db, phone_number, purpose, "rate_limited", False, existing.attempts, "Too soon since last request", ip)
        db.commit()
        return None, "Please wait before requesting another code."

    otp = generate_otp()
    session = OTPSession(
        phone_number=phone_number,
        otp_hash=hash_otp(otp),
        purpose=purpose,
        max_attempts=5,
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_LIFETIME_MINUTES),
        ip_address=ip,
    )
    db.add(session)

    if not _send_via_termii(phone_number, otp):
        db.rollback()
        return None, "Could not send SMS. Try again later."

    db.commit()
    db.refresh(session)
    _audit(db, phone_number, purpose, "sent", True, 0, ip=ip)
    db.commit()

    if settings.mock_otp:
        print(f"[MOCK OTP] {phone_number} -> {otp} (session {session.id})")
    return session, None


def verify_otp(db: Session, session_id: str, otp: str, ip: str | None = None) -> tuple[bool, str | None]:
    """Verify an OTP. Returns (success, error)."""
    session = db.query(OTPSession).filter(OTPSession.id == session_id).first()
    if not session:
        return False, "Session not found"
    if session.is_verified:
        return False, "Session already used"

    if datetime.utcnow() > session.expires_at:
        _audit(db, session.phone_number, session.purpose, "expired", False, session.attempts, ip=ip)
        db.commit()
        return False, "Code expired. Request a new one."

    session.attempts += 1
    if session.attempts > session.max_attempts:
        _audit(db, session.phone_number, session.purpose, "rate_limited", False, session.attempts, "Too many attempts", ip)
        db.commit()
        return False, "Too many failed attempts. Request a new code."

    if hash_otp(otp.strip()) != session.otp_hash:
        _audit(db, session.phone_number, session.purpose, "failed", False, session.attempts, "Wrong code", ip)
        db.commit()
        return False, "Incorrect code."

    session.is_verified = True
    session.verified_at = datetime.utcnow()
    db.commit()
    _audit(db, session.phone_number, session.purpose, "verified", True, session.attempts, ip=ip)
    db.commit()
    return True, None


def find_or_create_user(db: Session, phone_number: str) -> User:
    user = db.query(User).filter(User.phone == phone_number).first()
    if not user:
        user = User(phone=phone_number, name=phone_number, email=f"{phone_number}@verifyhome.local", role="Buyer")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def create_session(db: Session, user: User, otp_session_id: str, ip: str | None = None) -> str:
    session = UserSession(
        user_id=user.id,
        phone_number=user.phone,
        otp_session_id=otp_session_id,
        is_active=True,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRES_MINUTES),
        ip_address=ip,
    )
    db.add(session)
    user.phone_verified = True
    user.last_otp_verification = datetime.utcnow()
    db.commit()
    return create_session_token(user.id, user.phone, user.admin_role)


def create_admin_session_token(user: User) -> str:
    return create_session_token(user.id, user.phone, user.admin_role)
