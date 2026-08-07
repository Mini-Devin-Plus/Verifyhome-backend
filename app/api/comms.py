"""Chat and call routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import CallSession, ChatMessage, ChatParticipant, ChatRoom, User
from ..schemas import CallCreate, ChatMessageCreate, ChatMessageOut, ChatRoomCreate
from ..services import comms
from ..services.platform import check_kill_switch

chat_router = APIRouter(prefix="/chat", tags=["chat"])
call_router = APIRouter(prefix="/calls", tags=["calls"])


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
@chat_router.post("/rooms", status_code=201)
def create_room(body: ChatRoomCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not check_kill_switch(db, "chat"):
        raise HTTPException(status_code=503, detail="Chat is temporarily disabled")
    participants = list(set([user.id] + body.participant_ids))
    room = comms.create_chat_room(db, user.id, body.type, body.property_id, body.deal_id, participants)
    return {"id": room.id, "type": room.type, "created_at": room.created_at}


@chat_router.get("/rooms/mine")
def my_rooms(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rooms = comms.list_rooms_for_user(db, user.id)
    return [
        {
            "id": r.id,
            "type": r.type,
            "property_id": r.property_id,
            "last_message_at": r.last_message_at,
            "participant_ids": [p.user_id for p in r.participants],
        }
        for r in rooms
    ]


@chat_router.get("/rooms/{room_id}/messages", response_model=list[ChatMessageOut])
def room_messages(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(ChatParticipant).filter(ChatParticipant.chat_room_id == room_id, ChatParticipant.user_id == user.id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    return comms.list_messages(db, room_id)


@chat_router.post("/rooms/{room_id}/messages", response_model=ChatMessageOut, status_code=201)
def send(room_id: str, body: ChatMessageCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not check_kill_switch(db, "chat"):
        raise HTTPException(status_code=503, detail="Chat is temporarily disabled")
    member = db.query(ChatParticipant).filter(ChatParticipant.chat_room_id == room_id, ChatParticipant.user_id == user.id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    msg = comms.send_message(db, room_id, user.id, body.body)
    return msg


# ---------------------------------------------------------------------------
# Calls
# ---------------------------------------------------------------------------
@call_router.post("", status_code=201)
def create_call(body: CallCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not check_kill_switch(db, "calls"):
        raise HTTPException(status_code=503, detail="Calls are temporarily disabled")
    participants = list(set([user.id] + body.participant_ids))
    call = comms.create_call_session(
        db,
        body.type,
        user.id,
        user.role.lower(),
        body.chat_room_id,
        body.property_id,
        body.deal_id,
        body.scheduled_at,
        participants,
    )
    return {"id": call.id, "type": call.type, "status": call.status, "provider": call.provider, "scheduled_at": call.scheduled_at}


@call_router.get("/mine")
def my_calls(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(CallSession)
        .filter(CallSession.initiator_user_id == user.id)
        .order_by(CallSession.created_at.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "type": c.type,
            "status": c.status,
            "scheduled_at": c.scheduled_at,
            "duration": c.duration,
        }
        for c in rows
    ]


@call_router.post("/{call_id}/status")
def update_status(call_id: str, status: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    call = comms.update_call_status(db, call_id, status)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"id": call.id, "status": call.status, "duration": call.duration}
