"""VerifyHome FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    admin,
    agents,
    auth,
    comms,
    deals,
    payments,
    platform,
    properties,
    rentnow,
)
from .config import settings

app = FastAPI(
    title="VerifyHome API",
    version="1.0.0",
    description="Trust-first real estate marketplace API for the Nigerian market.",
    openapi_tags=[
        {"name": "auth", "description": "OTP-based authentication"},
        {"name": "properties", "description": "Property listings"},
        {"name": "agents", "description": "Verified agents, trust tiers and reviews"},
        {"name": "deals", "description": "Escrow and standard deals with state machine"},
        {"name": "payments", "description": "Payment intents"},
        {"name": "rentnow", "description": "Installment rent plans"},
        {"name": "chat", "description": "In-app chat"},
        {"name": "calls", "description": "In-app audio/video calls"},
        {"name": "platform", "description": "Subscriptions, beta access, feature flags"},
        {"name": "admin", "description": "Admin portal"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_API_PREFIX = "/api"

for _router in (
    auth.router,
    properties.router,
    agents.router,
    deals.router,
    payments.router,
    rentnow.router,
    comms.chat_router,
    comms.call_router,
    platform.router,
    admin.router,
):
    app.include_router(_router, prefix=_API_PREFIX)


@app.get("/api/health")
def health_check():
    return {"ok": True, "service": "verifyhome", "version": "1.0.0"}


@app.get("/")
def root():
    return {"service": "VerifyHome API", "docs": "/docs", "status": "running"}
