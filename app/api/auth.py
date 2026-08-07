"""Auth routes: OTP send/verify, signup, sensitive-action OTP."""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..config import settings
from ..models import OTPSession, User
from ..schemas import AuthResponse, SendOTPRequest, SendOTPResponse, SignupRequest, VerifyOTPRequest
from ..security import generate_otp
from ..services.otp_auth import create_session, find_or_create_user, send_otp, verify_otp

router = APIRouter(prefix="/auth", tags=["auth"])


class UpdateMeRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2)
    email: EmailStr | None = None
    role: str | None = None
    bvn: str | None = None
    nin: str | None = None


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "verification_status": u.verification_status,
        "phone_verified": u.phone_verified,
        "created_at": u.created_at,
    }


@router.post("/send-otp", response_model=SendOTPResponse)
def send_otp_route(body: SendOTPRequest, x_forwarded_for: str = Header(default=""), db: Session = Depends(get_db)):
    ip = x_forwarded_for.split(",")[0].strip() or None
    session, error = send_otp(db, body.phone_number, body.purpose, ip=ip)
    if error:
        raise HTTPException(status_code=429, detail=error)
    return SendOTPResponse(
        success=True,
        session_id=session.id,
        message="OTP sent",
        mock_code=generate_otp() if settings.mock_otp else None,
    )


@router.post("/verify", response_model=AuthResponse)
def verify_route(body: VerifyOTPRequest, x_forwarded_for: str = Header(default=""), db: Session = Depends(get_db)):
    ok, error = verify_otp(db, body.session_id, body.otp, ip=x_forwarded_for or None)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    session_row = db.get(OTPSession, body.session_id)
    user = find_or_create_user(db, session_row.phone_number)
    token = create_session(db, user, body.session_id, ip=x_forwarded_for or None)
    return AuthResponse(success=True, token=token, user=_user_out(user))


@router.post("/signup", response_model=AuthResponse)
def signup_route(body: SignupRequest, x_forwarded_for: str = Header(default=""), db: Session = Depends(get_db)):
    ok, error = verify_otp(db, body.session_id, body.otp, ip=x_forwarded_for or None)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    session_row = db.get(OTPSession, body.session_id)
    user = db.query(User).filter(User.phone == session_row.phone_number).first()
    if not user:
        user = User(phone=session_row.phone_number, name=body.name, email=body.email, role=body.role, bvn=body.bvn, nin=body.nin)
        db.add(user)
        db.flush()
    user.name = body.name
    if body.email:
        user.email = body.email
    user.role = body.role
    db.commit()
    db.refresh(user)
    token = create_session(db, user, body.session_id, ip=x_forwarded_for or None)
    return AuthResponse(success=True, token=token, user=_user_out(user), is_new_user=True)


@router.post("/sensitive-action", response_model=SendOTPResponse)
def sensitive_action_otp(purpose: str = "sensitive_action", x_forwarded_for: str = Header(default=""), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session, error = send_otp(db, user.phone, purpose, ip=x_forwarded_for or None)
    if error:
        raise HTTPException(status_code=429, detail=error)
    return SendOTPResponse(
        success=True,
        session_id=session.id,
        message="OTP sent",
        mock_code=generate_otp() if settings.mock_otp else None,
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.patch("/me")
def update_me(body: UpdateMeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    if body.bvn is not None:
        user.bvn = body.bvn
    if body.nin is not None:
        user.nin = body.nin
    db.commit()
    db.refresh(user)
    return _user_out(user)
