"""Agent and review routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Agent, Review, User
from ..schemas import AgentOut, AgentProfileCreate, ReviewCreate, ReviewOut
from ..services import property_service

router = APIRouter(tags=["agents"])


def _agent_out(db: Session, agent: Agent) -> dict:
    user = db.get(User, agent.id)
    return {
        "id": agent.id,
        "name": user.name if user else "",
        "email": user.email if user else None,
        "phone": user.phone if user else "",
        "role": user.role if user else "",
        "verification_status": user.verification_status if user else "Pending",
        "office_address": agent.office_address,
        "cac_number": agent.cac_number,
        "trust_level": agent.trust_level,
        "years_active": agent.years_active,
        "total_properties": agent.total_properties,
        "average_rating": agent.average_rating,
    }


@router.get("/agents", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return [_agent_out(db, a) for a in property_service.list_agents(db)]


@router.get("/agents/{user_id}", response_model=AgentOut)
def get_agent(user_id: str, db: Session = Depends(get_db)):
    agent = property_service.get_agent(db, user_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.trust_level = property_service.refresh_trust_level(db, user_id)
    return _agent_out(db, agent)


@router.post("/me/agent-profile", response_model=AgentOut)
def upsert_agent_profile(body: AgentProfileCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    agent = property_service.create_or_update_agent(db, user.id, body.model_dump())
    property_service.refresh_trust_level(db, user.id)
    return _agent_out(db, agent)


@router.get("/agents/{user_id}/reviews", response_model=list[ReviewOut])
def list_reviews(user_id: str, db: Session = Depends(get_db)):
    return property_service.list_reviews(db, user_id)


@router.post("/agents/{user_id}/reviews", response_model=ReviewOut, status_code=201)
def add_review(user_id: str, body: ReviewCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot review yourself")
    if not property_service.get_agent(db, user_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    review = property_service.add_review(db, user_id, user.id, body.rating, body.comment)
    property_service.refresh_trust_level(db, user_id)
    return review
