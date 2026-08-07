"""Pydantic schemas for the VerifyHome API."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Auth / OTP
# ---------------------------------------------------------------------------
class SendOTPRequest(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    purpose: str = "login"  # login|signup|escrow_confirmation|admin_approval|sensitive_action


class SendOTPResponse(BaseModel):
    success: bool
    session_id: Optional[str] = None
    message: Optional[str] = None
    mock_code: Optional[str] = None


class VerifyOTPRequest(BaseModel):
    session_id: str
    otp: str = Field(min_length=4, max_length=8)


class SignupRequest(VerifyOTPRequest):
    name: str = Field(min_length=2)
    email: Optional[EmailStr] = None
    role: str = "Buyer"  # Tenant|Buyer|Seller|Landlord|Agent
    bvn: Optional[str] = None
    nin: Optional[str] = None


class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional["UserOut"] = None
    is_new_user: Optional[bool] = None
    error: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: Optional[str] = None
    phone: str
    role: str
    verification_status: str
    phone_verified: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------
class PropertyCreate(BaseModel):
    title: str = Field(min_length=3)
    type: str = Field(pattern="^(rent|sale)$")
    price: int = Field(gt=0)
    location: str = Field(min_length=2)
    size: str = ""
    bedrooms: int = 1
    bathrooms: int = 1
    description: Optional[str] = None
    images: list[str] = []
    ownership_context: Optional[dict[str, Any]] = None


class PropertyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    type: str
    price: int
    location: str
    size: str
    bedrooms: int
    bathrooms: int
    verified_status: str
    agent_id: str
    description: Optional[str] = None
    images: list[str]
    created_at: datetime


class PropertyVerifyRequest(BaseModel):
    status: str = Field(pattern="^(Verified|Rejected)$")


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------
class AgentProfileCreate(BaseModel):
    office_address: str = ""
    cac_number: str = ""
    years_active: int = 0


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: Optional[str] = None
    phone: str
    role: str
    verification_status: str
    office_address: str
    cac_number: str
    trust_level: str
    years_active: int
    total_properties: int
    average_rating: float


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_id: str
    user_id: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Deals / Escrow
# ---------------------------------------------------------------------------
class DealCreate(BaseModel):
    seller_id: str
    property_id: str
    amount: int = Field(gt=0)


class DealAction(BaseModel):
    action: str  # acknowledge, fund, confirm, complete, dispute, release, refund, approve, submit_documents, approve_documents, schedule_inspection, complete_inspection
    dispute_reason: Optional[str] = None
    otp_session_id: Optional[str] = None


class DealTransitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_state: str
    to_state: str
    triggered_by: str
    user_role: str
    transitioned_at: datetime


class EscrowDealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    buyer_id: str
    seller_id: str
    property_id: str
    amount: int
    state: str
    created_at: datetime
    buyer_confirmed_at: Optional[datetime] = None
    disputed_at: Optional[datetime] = None
    dispute_reason: Optional[str] = None


class StandardDealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    buyer_id: str
    seller_id: str
    property_id: str
    amount: int
    state: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------
class PaymentIntentCreate(BaseModel):
    purpose: str
    amount: int = Field(gt=0)
    purpose_ref_id: Optional[str] = None
    payee_user_id: Optional[str] = None


class PaymentIntentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    payer_user_id: str
    purpose: str
    amount: int
    currency: str
    provider: str
    provider_ref: Optional[str] = None
    status: str
    commission_snapshot: Optional[dict[str, Any]] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# RentNow
# ---------------------------------------------------------------------------
class RentNowPlanCreate(BaseModel):
    property_id: str
    months: int = Field(gt=0)
    installment_amount: int = Field(gt=0)
    eligibility_required: bool = False


class RentNowProjection(BaseModel):
    months: int
    annual_price: int
    monthly_installment: int
    total_payable: int


class RentNowPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    property_id: str
    months: int
    installment_amount: int
    eligibility_required: bool


# ---------------------------------------------------------------------------
# Chat / Calls
# ---------------------------------------------------------------------------
class ChatRoomCreate(BaseModel):
    type: str = "direct"
    property_id: Optional[str] = None
    deal_id: Optional[str] = None
    participant_ids: list[str] = []


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1)


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chat_room_id: str
    sender_user_id: str
    message_type: str
    body: str
    created_at: datetime


class CallCreate(BaseModel):
    type: str = Field(pattern="^(1v1_audio|1v1_video|group_video)$")
    chat_room_id: Optional[str] = None
    property_id: Optional[str] = None
    deal_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    participant_ids: list[str] = []


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
class SubscriptionPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    duration: int
    price: int
    name: str


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class FeatureFlagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    enabled: bool
    is_kill_switch: bool


class FeatureFlagUpdate(BaseModel):
    enabled: bool


class BetaInviteRequest(BaseModel):
    phone_number: str
    email: Optional[EmailStr] = None
    cohort: str = "beta"


class BetaActivateRequest(BaseModel):
    invite_code: str


class HealthOut(BaseModel):
    score: int
    warnings: list[str]


AuthResponse.model_rebuild()
