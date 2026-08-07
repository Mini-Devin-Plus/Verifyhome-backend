"""RentNow routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import RentNowPlanCreate, RentNowPlanOut
from ..services import rentnow

router = APIRouter(prefix="/rentnow", tags=["rentnow"])


@router.get("/properties/{property_id}/plans", response_model=list[RentNowPlanOut])
def plans_for_property(property_id: str, db: Session = Depends(get_db)):
    return rentnow.list_plans_for_property(db, property_id)


@router.post("/plans", response_model=RentNowPlanOut, status_code=201)
def create_plan(body: RentNowPlanCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return rentnow.create_plan(db, body.property_id, body.months, body.installment_amount, body.eligibility_required)


@router.post("/project")
def project(annual_price: int = Query(gt=0), months: int = Query(gt=0, le=36)):
    return rentnow.project_installments(annual_price, months)


@router.get("/eligibility")
def eligibility(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return rentnow.check_eligibility(db, user)
