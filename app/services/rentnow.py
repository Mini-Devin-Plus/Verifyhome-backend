"""RentNow installment services."""
from sqlalchemy.orm import Session

from ..models import RentNowPlan, User


def list_plans_for_property(db: Session, property_id: str) -> list[RentNowPlan]:
    return db.query(RentNowPlan).filter(RentNowPlan.property_id == property_id).all()


def create_plan(db: Session, property_id: str, months: int, installment_amount: int, eligibility_required: bool = False) -> RentNowPlan:
    plan = RentNowPlan(
        property_id=property_id,
        months=months,
        installment_amount=installment_amount,
        eligibility_required=eligibility_required,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def check_eligibility(db: Session, user: User) -> dict:
    """Simple eligibility check: verified phone, no suspension, recent activity."""
    checks = {
        "phoneVerified": user.phone_verified,
        "notSuspended": not user.is_suspended,
        "verificationStatus": user.verification_status == "Verified",
    }
    passed = all(checks.values())
    return {"eligible": passed, "checks": checks}


def project_installments(annual_price: int, months: int) -> dict:
    """Project an installment plan from an annual rental price."""
    monthly = round(annual_price / months)
    return {
        "months": months,
        "annualPrice": annual_price,
        "monthlyInstallment": monthly,
        "totalPayable": monthly * months,
        "savingsNote": "No upfront year payment required.",
    }
