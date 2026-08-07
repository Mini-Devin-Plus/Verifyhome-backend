"""Property, agent and review services."""
from sqlalchemy.orm import Session

from ..models import Agent, Property, Review, User


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------
def list_properties(db: Session, property_type: str | None = None, location: str | None = None, verified_only: bool = True) -> list[Property]:
    q = db.query(Property)
    if property_type:
        q = q.filter(Property.type == property_type)
    if location:
        q = q.filter(Property.location.ilike(f"%{location}%"))
    if verified_only:
        q = q.filter(Property.verified_status.in_(["Verified", "Pending"]))
    return q.order_by(Property.created_at.desc()).all()


def get_property(db: Session, property_id: str) -> Property | None:
    return db.query(Property).filter(Property.id == property_id).first()


def create_property(db: Session, data: dict, agent_id: str) -> Property:
    prop = Property(
        title=data["title"],
        type=data["type"],
        price=data["price"],
        location=data["location"],
        size=data.get("size", ""),
        bedrooms=data.get("bedrooms", 1),
        bathrooms=data.get("bathrooms", 1),
        description=data.get("description"),
        images=data.get("images", []),
        ownership_context=data.get("ownership_context"),
        agent_id=agent_id,
        verified_status="Pending",
    )
    db.add(prop)
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent:
        agent.total_properties += 1
    db.commit()
    db.refresh(prop)
    return prop


def update_property_verification(db: Session, property_id: str, status: str, admin_id: str | None = None) -> Property | None:
    prop = get_property(db, property_id)
    if not prop:
        return None
    prop.verified_status = status
    db.commit()
    db.refresh(prop)
    return prop


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------
def get_agent(db: Session, user_id: str) -> Agent | None:
    return db.query(Agent).filter(Agent.id == user_id).first()


def list_agents(db: Session) -> list[Agent]:
    return db.query(Agent).all()


def create_or_update_agent(db: Session, user_id: str, data: dict) -> Agent:
    agent = get_agent(db, user_id)
    if not agent:
        agent = Agent(id=user_id)
        db.add(agent)
    agent.office_address = data.get("office_address", agent.office_address)
    agent.cac_number = data.get("cac_number", agent.cac_number)
    agent.years_active = data.get("years_active", agent.years_active)
    db.commit()
    db.refresh(agent)
    return agent


def compute_trust_level(agent: Agent) -> str:
    score = 0
    if agent.years_active >= 3:
        score += 2
    elif agent.years_active >= 1:
        score += 1
    if agent.total_properties >= 20:
        score += 2
    elif agent.total_properties >= 5:
        score += 1
    if agent.average_rating >= 4.5:
        score += 2
    elif agent.average_rating >= 4.0:
        score += 1
    if score >= 5:
        return "Gold"
    if score >= 3:
        return "Silver"
    return "Bronze"


def refresh_trust_level(db: Session, user_id: str) -> str:
    agent = get_agent(db, user_id)
    if not agent:
        return "Bronze"
    agent.trust_level = compute_trust_level(agent)
    db.commit()
    return agent.trust_level


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
def add_review(db: Session, agent_id: str, user_id: str, rating: int, comment: str | None) -> Review:
    review = Review(agent_id=agent_id, user_id=user_id, rating=max(1, min(5, rating)), comment=comment)
    db.add(review)
    db.commit()
    db.refresh(review)

    agent = get_agent(db, agent_id)
    if agent:
        rows = db.query(Review).filter(Review.agent_id == agent_id).all()
        agent.average_rating = round(sum(r.rating for r in rows) / len(rows), 1)
        db.commit()
    return review


def list_reviews(db: Session, agent_id: str) -> list[Review]:
    return db.query(Review).filter(Review.agent_id == agent_id).order_by(Review.created_at.desc()).all()


def get_user(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()
