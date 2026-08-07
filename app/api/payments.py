"""Payment intent routes (mock + provider-ready)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import PaymentIntent, User
from ..schemas import PaymentIntentCreate, PaymentIntentOut
from ..services import deals as deal_svc
from ..services.deals import calculate_commission, get_active_commission

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/intents", response_model=PaymentIntentOut, status_code=201)
def create_intent(body: PaymentIntentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    snapshot = None
    if body.purpose in ("escrow_deposit", "escrow_release", "commission", "standard_deal"):
        snapshot = calculate_commission(body.amount, get_active_commission(db, "escrow"))
    return deal_svc.create_payment_intent(
        db,
        payer_user_id=user.id,
        purpose=body.purpose,
        amount=body.amount,
        purpose_ref_id=body.purpose_ref_id,
        payee_user_id=body.payee_user_id,
        commission_snapshot=snapshot,
    )


@router.post("/intents/{intent_id}/mock-confirm", response_model=PaymentIntentOut)
def mock_confirm(intent_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    intent = db.query(PaymentIntent).filter(PaymentIntent.id == intent_id).first()
    if not intent or intent.payer_user_id != user.id:
        raise HTTPException(status_code=404, detail="Payment intent not found")
    return deal_svc.confirm_payment_intent(db, intent)
