"""Deal routes: escrow and standard deals with state machine transitions."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import EscrowDeal, OTPCheckpoint, Property, StandardDeal, User
from ..schemas import DealAction, DealCreate, EscrowDealOut, StandardDealOut
from ..services import deals as deal_svc
from ..services.platform import check_kill_switch

router = APIRouter(prefix="/deals", tags=["deals"])

ESCROW_ACTIONS = {
    "acknowledge_buyer": ("BUYER_ACKNOWLEDGED", "buyer"),
    "acknowledge_seller": ("SELLER_ACKNOWLEDGED", "seller"),
    "fund": ("BUYER_FUNDED", "buyer"),
    "submit_documents": ("DOCUMENTS_SUBMITTED", "seller"),
    "approve_documents": ("DOCUMENTS_APPROVED", "admin"),
    "schedule_inspection": ("INSPECTION_SCHEDULED", "admin"),
    "complete_inspection": ("INSPECTION_COMPLETED", "admin"),
    "confirm": ("BUYER_CONFIRMED", "buyer"),
    "request_approval": ("PENDING_ADMIN_APPROVAL", "system"),
    "approve": ("APPROVED", "admin"),
    "complete": ("COMPLETED", "admin"),
    "dispute": ("DISPUTED", "buyer"),
    "refund": ("REFUNDED", "admin"),
    "admin_reject": ("ADMIN_REJECTED", "admin"),
}

STANDARD_ACTIONS = {
    "confirm": ("CONFIRMED", "buyer"),
    "seller_acknowledge": ("SELLER_ACKNOWLEDGED", "seller"),
    "payment_received": ("PAYMENT_RECEIVED", "system"),
    "complete": ("COMPLETED", "system"),
    "dispute": ("DISPUTED", "buyer"),
    "request_approval": ("PENDING_ADMIN_APPROVAL", "system"),
}


def _role_for(deal_buyer: str, deal_seller: str, user: User) -> str:
    if user.admin_role:
        return "admin"
    if user.id == deal_buyer:
        return "buyer"
    if user.id == deal_seller:
        return "seller"
    return "none"


@router.post("/escrow", response_model=EscrowDealOut, status_code=201)
def create_escrow(body: DealCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not check_kill_switch(db, "deals"):
        raise HTTPException(status_code=503, detail="Deal creation is temporarily disabled")
    if body.seller_id == user.id:
        raise HTTPException(status_code=400, detail="Buyer and seller must be different users")
    if not db.query(User).filter(User.id == body.seller_id).first():
        raise HTTPException(status_code=400, detail="Seller does not exist")
    if not db.query(Property).filter(Property.id == body.property_id).first():
        raise HTTPException(status_code=400, detail="Property does not exist")
    return deal_svc.create_escrow_deal(db, user.id, body.seller_id, body.property_id, body.amount)


@router.post("/standard", response_model=StandardDealOut, status_code=201)
def create_standard(body: DealCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not check_kill_switch(db, "deals"):
        raise HTTPException(status_code=503, detail="Deal creation is temporarily disabled")
    if not db.query(User).filter(User.id == body.seller_id).first():
        raise HTTPException(status_code=400, detail="Seller does not exist")
    if not db.query(Property).filter(Property.id == body.property_id).first():
        raise HTTPException(status_code=400, detail="Property does not exist")
    return deal_svc.create_standard_deal(db, user.id, body.seller_id, body.property_id, body.amount)


@router.get("/escrow/mine", response_model=list[EscrowDealOut])
def my_escrow(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(EscrowDeal)
        .filter((EscrowDeal.buyer_id == user.id) | (EscrowDeal.seller_id == user.id))
        .order_by(EscrowDeal.created_at.desc())
        .all()
    )


@router.get("/standard/mine", response_model=list[StandardDealOut])
def my_standard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(StandardDeal)
        .filter((StandardDeal.buyer_id == user.id) | (StandardDeal.seller_id == user.id))
        .order_by(StandardDeal.created_at.desc())
        .all()
    )


@router.get("/escrow/{deal_id}", response_model=EscrowDealOut)
def get_escrow(deal_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    deal = db.query(EscrowDeal).filter(EscrowDeal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Escrow deal not found")
    return deal


@router.post("/escrow/{deal_id}/transition", response_model=EscrowDealOut)
def escrow_transition(deal_id: str, body: DealAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    deal = db.query(EscrowDeal).filter(EscrowDeal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Escrow deal not found")
    role = _role_for(deal.buyer_id, deal.seller_id, user)
    if role == "none":
        raise HTTPException(status_code=403, detail="Not part of this deal")

    target, expected_role = ESCROW_ACTIONS.get(body.action, (None, None))
    if target is None:
        raise HTTPException(status_code=400, detail=f"Unknown action {body.action}")
    if expected_role != role:
        raise HTTPException(status_code=403, detail=f"Action '{body.action}' requires role {expected_role}")

    # Funding requires an OTP checkpoint + payment intent
    if body.action == "fund":
        intent = deal_svc.create_payment_intent(db, user.id, "escrow_deposit", deal.amount, deal.id, deal.seller_id)
        deal_svc.confirm_payment_intent(db, intent)
        db.add(
            OTPCheckpoint(
                deal_id=deal.id,
                action="ESCROW_FUNDING",
                user_id=user.id,
                user_role=role,
                phone_number=user.phone,
            )
        )
        db.commit()

    ok, error = deal_svc.escrow_transition(db, deal, target, role, user.id, {"action": body.action})
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    db.refresh(deal)
    return deal


@router.post("/standard/{deal_id}/transition", response_model=StandardDealOut)
def standard_transition(deal_id: str, body: DealAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    deal = db.query(StandardDeal).filter(StandardDeal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Standard deal not found")
    role = _role_for(deal.buyer_id, deal.seller_id, user)
    if role == "none":
        raise HTTPException(status_code=403, detail="Not part of this deal")

    target, expected_role = STANDARD_ACTIONS.get(body.action, (None, None))
    if target is None:
        raise HTTPException(status_code=400, detail=f"Unknown action {body.action}")
    if expected_role not in (role, "system"):
        raise HTTPException(status_code=403, detail=f"Action '{body.action}' requires role {expected_role}")

    ok, error = deal_svc.standard_transition(db, deal, target, role, user.id, {"action": body.action})
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    db.refresh(deal)
    return deal
