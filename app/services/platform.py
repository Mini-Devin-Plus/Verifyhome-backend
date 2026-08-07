"""Beta access, feature flags, fraud scoring and subscriptions."""
import secrets
from sqlalchemy.orm import Session

from ..models import BetaUser, FeatureFlag, FraudScore, SubscriptionPlan, User, UserSubscription


# ---------------------------------------------------------------------------
# Beta access
# ---------------------------------------------------------------------------
BETA_CAPACITY = {"alpha": 50, "beta": 100}


def generate_invite_code() -> str:
    return "VH-" + secrets.token_hex(4).upper()


def invite_beta_user(db: Session, phone_number: str, email: str | None, cohort: str, invited_by: str | None = None) -> tuple[BetaUser | None, str | None]:
    cohort = cohort if cohort in BETA_CAPACITY else "beta"
    count = db.query(BetaUser).filter(BetaUser.cohort == cohort, BetaUser.status.in_(["invited", "active"])).count()
    if count >= BETA_CAPACITY[cohort]:
        return None, f"{cohort} cohort is full (capacity {BETA_CAPACITY[cohort]})"
    beta = BetaUser(
        phone_number=phone_number,
        email=email,
        cohort=cohort,
        invited_by=invited_by,
        invite_code=generate_invite_code(),
    )
    db.add(beta)
    db.commit()
    db.refresh(beta)
    return beta, None


def is_beta_authorized(db: Session, phone_number: str) -> bool:
    row = (
        db.query(BetaUser)
        .filter(BetaUser.phone_number == phone_number, BetaUser.status == "active")
        .first()
    )
    return row is not None


def activate_beta(db: Session, invite_code: str) -> tuple[bool, str | None]:
    beta = db.query(BetaUser).filter(BetaUser.invite_code == invite_code).first()
    if not beta:
        return False, "Invalid invite code"
    if beta.status == "revoked":
        return False, "Invite has been revoked"
    beta.status = "active"
    db.commit()
    return True, None


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------
DEFAULT_FLAGS = {
    "escrowDeals": True,
    "standardDeals": True,
    "chat": True,
    "audioCalls": True,
    "videoCalls": True,
    "rentNow": True,
    "screenSharing": False,
    "callRecording": False,
    "openRegistration": False,  # beta gate
    "globalEmergency": False,  # kill switch
    "callsKillSwitch": False,
    "chatKillSwitch": False,
    "dealCreationKillSwitch": False,
}


def ensure_default_flags(db: Session) -> None:
    existing = {f.name for f in db.query(FeatureFlag).all()}
    for name, enabled in DEFAULT_FLAGS.items():
        if name not in existing:
            db.add(FeatureFlag(name=name, enabled=enabled))
    db.commit()


def get_flags(db: Session) -> dict:
    flags = {name: enabled for name, enabled in DEFAULT_FLAGS.items()}
    for f in db.query(FeatureFlag).all():
        flags[f.name] = f.enabled
    return flags


def set_flag(db: Session, name: str, enabled: bool, updated_by: str) -> FeatureFlag:
    flag = db.query(FeatureFlag).filter(FeatureFlag.name == name).first()
    if not flag:
        flag = FeatureFlag(name=name, enabled=enabled, is_kill_switch=name.endswith("KillSwitch") or name == "globalEmergency")
        db.add(flag)
    flag.enabled = enabled
    flag.updated_by = updated_by
    db.commit()
    db.refresh(flag)
    return flag


def check_kill_switch(db: Session, feature: str) -> bool:
    """Return True if the feature is allowed (not killed)."""
    flags = get_flags(db)
    if flags.get("globalEmergency", False):
        return False
    if feature == "calls":
        return not flags.get("callsKillSwitch", False)
    if feature == "chat":
        return not flags.get("chatKillSwitch", False)
    if feature == "deals":
        return not flags.get("dealCreationKillSwitch", False)
    return True


# ---------------------------------------------------------------------------
# Fraud detection
# ---------------------------------------------------------------------------
def score_user(db: Session, user: User) -> FraudScore:
    score = 0
    factors = []
    if not user.phone_verified:
        score += 20
        factors.append("unverified_phone")
    if user.verification_status == "Rejected":
        score += 30
        factors.append("verification_rejected")
    if user.is_suspended:
        score += 50
        factors.append("suspended")
    if not user.email:
        score += 5
        factors.append("no_email")
    risk = "high" if score >= 60 else "medium" if score >= 30 else "low"

    existing = db.query(FraudScore).filter(FraudScore.user_id == user.id).first()
    if existing:
        existing.score = score
        existing.risk_level = risk
        existing.factors = factors
        row = existing
    else:
        row = FraudScore(user_id=user.id, score=score, risk_level=risk, factors=factors)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
def list_subscription_plans(db: Session, role: str | None = None) -> list[SubscriptionPlan]:
    q = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True))
    if role:
        q = q.filter(SubscriptionPlan.role == role)
    return q.all()


def get_user_subscription(db: Session, user_id: str) -> UserSubscription | None:
    return (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == user_id, UserSubscription.status == "active")
        .first()
    )
