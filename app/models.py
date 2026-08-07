"""SQLAlchemy models for VerifyHome — mirrors database/schema.sql and shared/types/database.ts."""
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_id)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(20), nullable=False)
    role = Column(String(20), nullable=False, default="Buyer")  # Tenant|Buyer|Seller|Landlord|Agent
    bvn = Column(String(11), nullable=True)
    nin = Column(String(11), nullable=True)
    verification_status = Column(String(10), nullable=False, default="Pending")  # Pending|Verified|Rejected
    phone_verified = Column(Boolean, nullable=False, default=False)
    last_otp_verification = Column(DateTime, nullable=True)
    # Admin portal auth (email + password), admin_role: ADMIN|SENIOR_ADMIN|SUPER_ADMIN
    password_hash = Column(String(255), nullable=True)
    admin_role = Column(String(20), nullable=True)
    is_suspended = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=now)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)

    agent_profile = relationship("Agent", back_populates="user", uselist=False)


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    office_address = Column(Text, nullable=False, default="")
    cac_number = Column(String(50), nullable=False, default="")
    trust_level = Column(String(10), nullable=False, default="Bronze")  # Bronze|Silver|Gold
    years_active = Column(Integer, nullable=False, default=0)
    total_properties = Column(Integer, nullable=False, default=0)
    average_rating = Column(Float, nullable=False, default=0.0)

    user = relationship("User", back_populates="agent_profile")


# ---------------------------------------------------------------------------
# Marketplace
# ---------------------------------------------------------------------------
class Property(Base):
    __tablename__ = "properties"

    id = Column(String(36), primary_key=True, default=gen_id)
    title = Column(String(255), nullable=False)
    type = Column(String(10), nullable=False)  # rent|sale
    price = Column(Integer, nullable=False)  # NGN
    location = Column(String(255), nullable=False)
    size = Column(String(50), nullable=False, default="")
    bedrooms = Column(Integer, nullable=False, default=1)
    bathrooms = Column(Integer, nullable=False, default=1)
    verified_status = Column(String(10), nullable=False, default="Pending")  # Pending|Verified|Rejected
    agent_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=True)
    images = Column(JSON, nullable=False, default=list)
    ownership_context = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)

    agent = relationship("User")
    rent_plans = relationship("RentNowPlan", back_populates="property", cascade="all, delete-orphan")


class RentNowPlan(Base):
    __tablename__ = "rent_now_plans"

    id = Column(String(36), primary_key=True, default=gen_id)
    property_id = Column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    months = Column(Integer, nullable=False)
    installment_amount = Column(Integer, nullable=False)
    eligibility_required = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=now)

    property = relationship("Property", back_populates="rent_plans")


class BuyOffer(Base):
    __tablename__ = "buy_offers"

    id = Column(String(36), primary_key=True, default=gen_id)
    property_id = Column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    buyer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    offer_amount = Column(Integer, nullable=False)
    escrow_status = Column(String(10), nullable=False, default="Pending")  # Pending|Deposited|Released|Refunded
    created_at = Column(DateTime, nullable=False, default=now)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(36), primary_key=True, default=gen_id)
    agent_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


# ---------------------------------------------------------------------------
# OTP / Sessions
# ---------------------------------------------------------------------------
class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id = Column(String(36), primary_key=True, default=gen_id)
    phone_number = Column(String(20), nullable=False)
    otp_hash = Column(String(255), nullable=False)
    purpose = Column(String(30), nullable=False)  # login|signup|escrow_confirmation|admin_approval|sensitive_action
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    expires_at = Column(DateTime, nullable=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=now)
    verified_at = Column(DateTime, nullable=True)
    ip_address = Column(String(50), nullable=True)


class OTPAuditLog(Base):
    __tablename__ = "otp_audit_logs"

    id = Column(String(36), primary_key=True, default=gen_id)
    phone_number = Column(String(20), nullable=False)
    purpose = Column(String(30), nullable=False)
    action = Column(String(20), nullable=False)  # sent|verified|failed|expired|rate_limited
    attempts = Column(Integer, nullable=False, default=0)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    error_reason = Column(String(255), nullable=True)
    timestamp = Column(DateTime, nullable=False, default=now)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True, default=gen_id)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    phone_number = Column(String(20), nullable=False)
    otp_session_id = Column(String(36), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=now)
    last_activity_at = Column(DateTime, nullable=False, default=now)
    ip_address = Column(String(50), nullable=True)


# ---------------------------------------------------------------------------
# Deals / Escrow
# ---------------------------------------------------------------------------
class EscrowDeal(Base):
    __tablename__ = "escrow_deals"

    id = Column(String(36), primary_key=True, default=gen_id)
    buyer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    seller_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    property_id = Column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Integer, nullable=False)
    state = Column(String(40), nullable=False, default="INITIATED")
    created_at = Column(DateTime, nullable=False, default=now)
    buyer_confirmed_at = Column(DateTime, nullable=True)
    disputed_at = Column(DateTime, nullable=True)
    dispute_reason = Column(Text, nullable=True)


class StandardDeal(Base):
    __tablename__ = "standard_deals"

    id = Column(String(36), primary_key=True, default=gen_id)
    buyer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    seller_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    property_id = Column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Integer, nullable=False)
    state = Column(String(30), nullable=False, default="PENDING_CONFIRMATION")
    created_at = Column(DateTime, nullable=False, default=now)
    disputed_at = Column(DateTime, nullable=True)
    dispute_reason = Column(Text, nullable=True)


class DealTransition(Base):
    __tablename__ = "deal_transitions"

    id = Column(String(36), primary_key=True, default=gen_id)
    deal_id = Column(String(36), nullable=False)
    deal_type = Column(String(10), nullable=False)  # escrow|standard
    from_state = Column(String(40), nullable=False)
    to_state = Column(String(40), nullable=False)
    triggered_by = Column(String(36), nullable=False)
    user_role = Column(String(10), nullable=False)
    transitioned_at = Column(DateTime, nullable=False, default=now)
    meta = Column("metadata", JSON, nullable=True)


class OTPCheckpoint(Base):
    __tablename__ = "otp_checkpoints"

    id = Column(String(36), primary_key=True, default=gen_id)
    deal_id = Column(String(36), nullable=False)
    action = Column(String(40), nullable=False)
    user_id = Column(String(36), nullable=False)
    user_role = Column(String(10), nullable=False)
    phone_number = Column(String(20), nullable=False)
    verified_at = Column(DateTime, nullable=False, default=now)
    meta = Column("metadata", JSON, nullable=True)


class ActionAttemptLog(Base):
    __tablename__ = "action_attempt_logs"

    id = Column(String(36), primary_key=True, default=gen_id)
    action_type = Column(String(40), nullable=False)
    actor_role = Column(String(10), nullable=False)
    actor_user_id = Column(String(36), nullable=False)
    deal_id = Column(String(36), nullable=True)
    otp_session_id = Column(String(36), nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    failure_reason = Column(String(255), nullable=True)
    timestamp = Column(DateTime, nullable=False, default=now)
    meta = Column("metadata", JSON, nullable=True)


# ---------------------------------------------------------------------------
# Payments / Subscriptions
# ---------------------------------------------------------------------------
class PaymentIntent(Base):
    __tablename__ = "payment_intents"

    id = Column(String(36), primary_key=True, default=gen_id)
    payer_user_id = Column(String(36), nullable=False)
    payee_user_id = Column(String(36), nullable=True)
    purpose = Column(String(30), nullable=False)  # subscription|listing_fee|escrow_deposit|escrow_release|commission|standard_deal
    purpose_ref_id = Column(String(36), nullable=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="NGN")
    provider = Column(String(20), nullable=False, default="mock")
    provider_ref = Column(String(120), nullable=True)
    status = Column(String(10), nullable=False, default="initiated")  # initiated|pending|success|failed|cancelled
    initiated_by = Column(String(10), nullable=True)  # user|system
    commission_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id = Column(String(36), primary_key=True, default=gen_id)
    applies_to = Column(String(20), nullable=False)  # subscription|listing|escrow
    payer = Column(String(10), nullable=False, default="both")
    rate_type = Column(String(10), nullable=False, default="percentage")
    value = Column(Float, nullable=False, default=5.0)
    is_active = Column(Boolean, nullable=False, default=True)
    effective_from = Column(DateTime, nullable=False, default=now)
    description = Column(Text, nullable=True)


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(String(36), primary_key=True, default=gen_id)
    role = Column(String(20), nullable=False)
    duration = Column(Integer, nullable=False, default=12)  # months
    price = Column(Integer, nullable=False)
    name = Column(String(80), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(String(36), primary_key=True, default=gen_id)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(String(36), nullable=False)
    status = Column(String(10), nullable=False, default="none")  # active|expired|none
    start_date = Column(DateTime, nullable=True)
    expiry_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


# ---------------------------------------------------------------------------
# Communication
# ---------------------------------------------------------------------------
class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id = Column(String(36), primary_key=True, default=gen_id)
    type = Column(String(10), nullable=False, default="direct")  # direct|group
    created_by_user_id = Column(String(36), nullable=False)
    is_property_linked = Column(Boolean, nullable=False, default=False)
    property_id = Column(String(36), nullable=True)
    deal_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
    last_message_at = Column(DateTime, nullable=True)
    meta = Column("metadata", JSON, nullable=True)

    participants = relationship("ChatParticipant", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", cascade="all, delete-orphan")


class ChatParticipant(Base):
    __tablename__ = "chat_participants"

    id = Column(String(36), primary_key=True, default=gen_id)
    chat_room_id = Column(String(36), ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), nullable=False)
    role_at_join = Column(String(20), nullable=False)
    joined_at = Column(DateTime, nullable=False, default=now)
    is_admin = Column(Boolean, nullable=False, default=False)
    muted_until = Column(DateTime, nullable=True)
    left_at = Column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=gen_id)
    chat_room_id = Column(String(36), ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    sender_user_id = Column(String(36), nullable=False)
    message_type = Column(String(10), nullable=False, default="text")  # text|system
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=now)
    edited_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    meta = Column("metadata", JSON, nullable=True)


class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(String(36), primary_key=True, default=gen_id)
    type = Column(String(20), nullable=False)  # 1v1_audio|1v1_video|group_video
    initiator_user_id = Column(String(36), nullable=False)
    initiator_role = Column(String(10), nullable=False)
    status = Column(String(10), nullable=False, default="scheduled")  # scheduled|active|ended|cancelled
    chat_room_id = Column(String(36), nullable=True)
    property_id = Column(String(36), nullable=True)
    deal_id = Column(String(36), nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True)
    provider = Column(String(20), nullable=False, default="mock")
    provider_room_id = Column(String(120), nullable=True)
    provider_token = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)
    meta = Column("metadata", JSON, nullable=True)

    participants = relationship("CallParticipant", cascade="all, delete-orphan")


class CallParticipant(Base):
    __tablename__ = "call_participants"

    id = Column(String(36), primary_key=True, default=gen_id)
    call_session_id = Column(String(36), ForeignKey("call_sessions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), nullable=False)
    user_role = Column(String(10), nullable=False)
    joined_at = Column(DateTime, nullable=True)
    left_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    audio_enabled = Column(Boolean, nullable=False, default=True)
    video_enabled = Column(Boolean, nullable=False, default=True)


# ---------------------------------------------------------------------------
# Beta / Feature flags / Admin
# ---------------------------------------------------------------------------
class BetaUser(Base):
    __tablename__ = "beta_users"

    id = Column(String(36), primary_key=True, default=gen_id)
    phone_number = Column(String(20), nullable=False)
    email = Column(String(255), nullable=True)
    cohort = Column(String(10), nullable=False)  # alpha|beta
    status = Column(String(10), nullable=False, default="invited")  # invited|active|revoked
    invited_by = Column(String(36), nullable=True)
    invite_code = Column(String(20), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=now)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id = Column(String(36), primary_key=True, default=gen_id)
    name = Column(String(80), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=True)
    is_kill_switch = Column(Boolean, nullable=False, default=False)
    updated_by = Column(String(36), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(String(36), primary_key=True, default=gen_id)
    admin_user_id = Column(String(36), nullable=False)
    action = Column(String(80), nullable=False)
    target_type = Column(String(40), nullable=True)
    target_id = Column(String(36), nullable=True)
    otp_session_id = Column(String(36), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, nullable=False, default=now)


class FraudScore(Base):
    __tablename__ = "fraud_scores"

    id = Column(String(36), primary_key=True, default=gen_id)
    user_id = Column(String(36), nullable=False)
    score = Column(Integer, nullable=False, default=0)  # 0-100
    risk_level = Column(String(10), nullable=False, default="low")  # low|medium|high
    factors = Column(JSON, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=now, onupdate=now)


class SystemHealth(Base):
    __tablename__ = "system_health"

    id = Column(String(36), primary_key=True, default=gen_id)
    health_score = Column(Integer, nullable=False, default=100)
    component = Column(String(40), nullable=True)
    status = Column(String(10), nullable=False, default="ok")
    message = Column(Text, nullable=True)
    recorded_at = Column(DateTime, nullable=False, default=now)
