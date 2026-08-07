"""In-app chat and call services."""
from datetime import datetime
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CallParticipant, CallSession, ChatMessage, ChatParticipant, ChatRoom


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
def create_chat_room(db: Session, created_by: str, room_type: str = "direct", property_id: str | None = None, deal_id: str | None = None, participant_ids: list[str] | None = None) -> ChatRoom:
    room = ChatRoom(
        type=room_type,
        created_by_user_id=created_by,
        is_property_linked=bool(property_id),
        property_id=property_id,
        deal_id=deal_id,
    )
    db.add(room)
    db.flush()
    if participant_ids:
        for uid in participant_ids:
            db.add(ChatParticipant(chat_room_id=room.id, user_id=uid, role_at_join="buyer"))
    db.commit()
    db.refresh(room)
    return room


def list_rooms_for_user(db: Session, user_id: str) -> list[ChatRoom]:
    room_ids = db.query(ChatParticipant.chat_room_id).filter(ChatParticipant.user_id == user_id).all()
    ids = [r[0] for r in room_ids]
    return db.query(ChatRoom).filter(ChatRoom.id.in_(ids)).order_by(ChatRoom.last_message_at.desc().nullslast()).all()


def send_message(db: Session, room_id: str, sender_id: str, body: str, message_type: str = "text") -> ChatMessage | None:
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        return None
    msg = ChatMessage(chat_room_id=room_id, sender_user_id=sender_id, body=body, message_type=message_type)
    db.add(msg)
    room.last_message_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def list_messages(db: Session, room_id: str, limit: int = 100) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()[::-1]
    )


# ---------------------------------------------------------------------------
# Calls
# ---------------------------------------------------------------------------
def create_call_session(
    db: Session,
    call_type: str,
    initiator_id: str,
    initiator_role: str,
    chat_room_id: str | None = None,
    property_id: str | None = None,
    deal_id: str | None = None,
    scheduled_at: datetime | None = None,
    participant_ids: list[str] | None = None,
) -> CallSession:
    call = CallSession(
        type=call_type,
        initiator_user_id=initiator_id,
        initiator_role=initiator_role,
        chat_room_id=chat_room_id,
        property_id=property_id,
        deal_id=deal_id,
        scheduled_at=scheduled_at,
        status="scheduled" if scheduled_at else "active",
        provider="mock" if settings.CALL_PROVIDER == "mock" else settings.CALL_PROVIDER,
    )
    db.add(call)
    db.flush()
    if participant_ids:
        for uid in participant_ids:
            db.add(CallParticipant(call_session_id=call.id, user_id=uid, user_role="buyer"))
    db.commit()
    db.refresh(call)
    return call


def update_call_status(db: Session, call_id: str, status: str) -> CallSession | None:
    call = db.query(CallSession).filter(CallSession.id == call_id).first()
    if not call:
        return None
    call.status = status
    if status == "active" and not call.started_at:
        call.started_at = datetime.utcnow()
    if status == "ended":
        call.ended_at = datetime.utcnow()
        if call.started_at:
            call.duration = int((call.ended_at - call.started_at).total_seconds())
    db.commit()
    db.refresh(call)
    return call
