"""Property routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import Agent, User
from ..schemas import PropertyCreate, PropertyOut, PropertyVerifyRequest
from ..services import property_service

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=list[PropertyOut])
def list_props(
    type: str | None = None,
    location: str | None = None,
    verified_only: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    return property_service.list_properties(db, property_type=type, location=location, verified_only=verified_only)


@router.get("/{property_id}", response_model=PropertyOut)
def get_prop(property_id: str, db: Session = Depends(get_db)):
    prop = property_service.get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.post("", response_model=PropertyOut, status_code=201)
def create_prop(body: PropertyCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == user.id).first()
    if not agent and user.role not in ("Agent", "Seller", "Landlord"):
        raise HTTPException(status_code=403, detail="Only verified agents can list properties")
    return property_service.create_property(db, body.model_dump(), agent_id=user.id)


@router.post("/{property_id}/verify", response_model=PropertyOut)
def verify_prop(property_id: str, body: PropertyVerifyRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    prop = property_service.update_property_verification(db, property_id, body.status, admin.id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop
