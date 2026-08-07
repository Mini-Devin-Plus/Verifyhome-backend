"""Deal state machine, deal lifecycle, escrow and payments."""
from datetime import datetime
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    CommissionRule,
    DealTransition,
    EscrowDeal,
    PaymentIntent,
    StandardDeal,
)

# ---------------------------------------------------------------------------
# Deal state machine
# ---------------------------------------------------------------------------
ESCROW_FLOW = [
    "INITIATED",
    "BUYER_ACKNOWLEDGED",
    "SELLER_ACKNOWLEDGED",
    "BUYER_FUNDED",
    "DOCUMENTS_SUBMITTED",
    "DOCUMENTS_APPROVED",
    "INSPECTION_SCHEDULED",
    "INSPECTION_COMPLETED",
    "BUYER_CONFIRMED",
    "PENDING_ADMIN_APPROVAL",
    "APPROVED",
    "COMPLETED",
]

STANDARD_FLOW = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "SELLER_ACKNOWLEDGED",
    "PAYMENT_RECEIVED",
    "COMPLETED",
]

# Which roles are allowed to trigger each transition (buyer, seller, admin, system)
ESCROW_PERMISSIONS = {
    "INITIATED": {"buyer"},
    "BUYER_ACKNOWLEDGED": {"buyer"},
    "SELLER_ACKNOWLEDGED": {"seller"},
    "BUYER_FUNDED": {"buyer", "system"},
    "DOCUMENTS_SUBMITTED": {"seller"},
    "DOCUMENTS_APPROVED": {"admin"},
    "INSPECTION_SCHEDULED": {"buyer", "seller", "admin"},
    "INSPECTION_COMPLETED": {"admin", "system"},
    "BUYER_CONFIRMED": {"buyer"},
    "PENDING_ADMIN_APPROVAL": {"system", "buyer", "seller"},
    "APPROVED": {"admin"},
    "COMPLETED": {"admin", "system"},
}

STANDARD_PERMISSIONS = {
    "PENDING_CONFIRMATION": {"buyer"},
    "CONFIRMED": {"buyer", "seller"},
    "SELLER_ACKNOWLEDGED": {"seller"},
    "PAYMENT_RECEIVED": {"system", "buyer"},
    "COMPLETED": {"system", "admin"},
}

TERMINAL = {"COMPLETED", "DISPUTED", "REFUNDED", "SELLER_DEFAULTED", "ADMIN_REJECTED", "EXPIRED"}


def can_transition(deal_type: str, current: str, target: str, role: str) -> bool:
    if current in TERMINAL:
        return False
    if target == "DISPUTED":
        return role in ("buyer", "seller", "admin")
    if deal_type == "escrow":
        if target in ("REFUNDED",):
            return role in ("admin", "buyer") and current in ("BUYER_FUNDED", "PENDING_ADMIN_APPROVAL")
        if target == "SELLER_DEFAULTED":
            return role == "admin"
        if target == "ADMIN_REJECTED":
            return role == "admin"
        flow = ESCROW_FLOW
        perms = ESCROW_PERMISSIONS
    else:
        flow = STANDARD_FLOW
        perms = STANDARD_PERMISSIONS
        if target == "EXPIRED":
            return role == "system"
        if target == "PENDING_ADMIN_APPROVAL":
            return role in ("buyer", "seller", "system")
        if target == "ADMIN_REJECTED":
            return role == "admin"

    if target not in flow or current not in flow:
        return False
    if flow.index(target) != flow.index(current) + 1:
        # allow admin override jumps forward
        if role != "admin":
            return False
    allowed = perms.get(target, set())
    return role in allowed


def record_transition(db: Session, deal_id: str, deal_type: str, from_state: str, to_state: str, triggered_by: str, user_role: str, metadata: dict | None = None) -> None:
    db.add(
        DealTransition(
            deal_id=deal_id,
            deal_type=deal_type,
            from_state=from_state,
            to_state=to_state,
            triggered_by=triggered_by,
            user_role=user_role,
            meta=metadata,
        )
    )


# ---------------------------------------------------------------------------
# Commission
# ---------------------------------------------------------------------------
def get_active_commission(db: Session, applies_to: str) -> float:
    rule = (
        db.query(CommissionRule)
        .filter(CommissionRule.applies_to == applies_to, CommissionRule.is_active.is_(True))
        .order_by(CommissionRule.effective_from.desc())
        .first()
    )
    if rule and rule.rate_type == "percentage":
        return rule.value
    return 5.0  # default 5%


def calculate_commission(amount: int, rate_pct: float) -> dict:
    commission = round(amount * rate_pct / 100)
    return {
        "grossAmount": amount,
        "platformCommission": commission,
        "sellerReceives": amount - commission,
        "buyerPays": amount,
        "calculatedAt": datetime.utcnow().isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# Deal lifecycle
# ---------------------------------------------------------------------------
def create_escrow_deal(db: Session, buyer_id: str, seller_id: str, property_id: str, amount: int) -> EscrowDeal:
    deal = EscrowDeal(buyer_id=buyer_id, seller_id=seller_id, property_id=property_id, amount=amount, state="INITIATED")
    db.add(deal)
    db.commit()
    db.refresh(deal)
    record_transition(db, deal.id, "escrow", "-", "INITIATED", buyer_id, "buyer")
    db.commit()
    return deal


def create_standard_deal(db: Session, buyer_id: str, seller_id: str, property_id: str, amount: int) -> StandardDeal:
    deal = StandardDeal(buyer_id=buyer_id, seller_id=seller_id, property_id=property_id, amount=amount, state="PENDING_CONFIRMATION")
    db.add(deal)
    db.commit()
    db.refresh(deal)
    record_transition(db, deal.id, "standard", "-", "PENDING_CONFIRMATION", buyer_id, "buyer")
    db.commit()
    return deal


def escrow_transition(db: Session, deal: EscrowDeal, target: str, role: str, actor: str, metadata: dict | None = None) -> tuple[bool, str | None]:
    if not can_transition("escrow", deal.state, target, role):
        return False, f"Invalid transition {deal.state} -> {target} for role {role}"
    from_state = deal.state
    deal.state = target
    if target == "DISPUTED":
        deal.disputed_at = datetime.utcnow()
    if target == "BUYER_CONFIRMED":
        deal.buyer_confirmed_at = datetime.utcnow()
    db.commit()
    record_transition(db, deal.id, "escrow", from_state, target, actor, role, metadata)
    db.commit()
    return True, None


def standard_transition(db: Session, deal: StandardDeal, target: str, role: str, actor: str, metadata: dict | None = None) -> tuple[bool, str | None]:
    if not can_transition("standard", deal.state, target, role):
        return False, f"Invalid transition {deal.state} -> {target} for role {role}"
    from_state = deal.state
    deal.state = target
    if target == "DISPUTED":
        deal.disputed_at = datetime.utcnow()
    db.commit()
    record_transition(db, deal.id, "standard", from_state, target, actor, role, metadata)
    db.commit()
    return True, None


# ---------------------------------------------------------------------------
# Payments / Escrow funding
# ---------------------------------------------------------------------------
def create_payment_intent(
    db: Session,
    payer_user_id: str,
    purpose: str,
    amount: int,
    purpose_ref_id: str | None = None,
    payee_user_id: str | None = None,
    commission_snapshot: dict | None = None,
) -> PaymentIntent:
    provider = "mock" if settings.mock_payments else settings.PAYMENT_PROVIDER
    intent = PaymentIntent(
        payer_user_id=payer_user_id,
        payee_user_id=payee_user_id,
        purpose=purpose,
        purpose_ref_id=purpose_ref_id,
        amount=amount,
        provider=provider,
        status="initiated",
        initiated_by="user",
        commission_snapshot=commission_snapshot,
    )
    db.add(intent)
    db.commit()
    db.refresh(intent)
    return intent


def confirm_payment_intent(db: Session, intent: PaymentIntent) -> PaymentIntent:
    intent.status = "success"
    db.commit()
    db.refresh(intent)
    return intent
