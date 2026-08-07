"""Seed the VerifyHome database with demo data for local development."""
from datetime import datetime

from app.database import SessionLocal, engine
from app.models import (
    Agent,
    Base,
    BetaUser,
    CallParticipant,
    CallSession,
    ChatMessage,
    ChatParticipant,
    ChatRoom,
    CommissionRule,
    DealTransition,
    EscrowDeal,
    FeatureFlag,
    PaymentIntent,
    Property,
    RentNowPlan,
    Review,
    StandardDeal,
    SubscriptionPlan,
    User,
)
from app.security import hash_password
from app.services.deals import escrow_transition, standard_transition
from app.services.platform import DEFAULT_FLAGS, ensure_default_flags


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ------------------------------------------------------------------
    # 1. Admins (email + password for admin portal)
    # ------------------------------------------------------------------
    if db.query(User).filter(User.admin_role.isnot(None)).first():
        print("Seed already applied, skipping.")
        db.close()
        return

    admins = [
        ("superadmin@verifyhome.com", "Adaeze Obi", "SUPER_ADMIN", "+2348000000001"),
        ("senioradmin@verifyhome.com", "Tunde Bakare", "SENIOR_ADMIN", "+2348000000002"),
        ("admin@verifyhome.com", "Funke Adeyemi", "ADMIN", "+2348000000003"),
    ]
    admin_rows = []
    for email, name, role, phone in admins:
        u = User(
            name=name,
            email=email,
            phone=phone,
            role="Buyer",
            phone_verified=True,
            verification_status="Verified",
            password_hash=hash_password("Admin@123"),
            admin_role=role,
        )
        db.add(u)
        admin_rows.append(u)
    db.flush()

    # ------------------------------------------------------------------
    # 2. Demo marketplace users
    # ------------------------------------------------------------------
    buyer = User(
        name="Chiamaka Eze",
        email="chiamaka@example.com",
        phone="+2348012345678",
        role="Buyer",
        phone_verified=True,
        verification_status="Verified",
    )
    seller = User(
        name="Ibrahim Musa",
        email="ibrahim@example.com",
        phone="+2348098765432",
        role="Seller",
        phone_verified=True,
        verification_status="Verified",
    )
    landlord = User(
        name="Ngozi Okonkwo",
        email="ngozi@example.com",
        phone="+2348022223333",
        role="Landlord",
        phone_verified=True,
        verification_status="Verified",
    )
    tenant = User(
        name="David Adeleke",
        email="david@example.com",
        phone="+2348111222333",
        role="Tenant",
        phone_verified=True,
        verification_status="Verified",
    )
    agent_u = User(
        name="Aisha Bello",
        email="aisha@example.com",
        phone="+2348076543210",
        role="Agent",
        phone_verified=True,
        verification_status="Verified",
    )
    pending_agent_u = User(
        name="Emeka Nwosu",
        email="emeka@example.com",
        phone="+2348155554444",
        role="Agent",
        phone_verified=True,
        verification_status="Pending",
    )
    for u in (buyer, seller, landlord, tenant, agent_u, pending_agent_u):
        db.add(u)
    db.flush()

    agent = Agent(
        id=agent_u.id,
        office_address="12 Admiralty Way, Lekki Phase 1, Lagos",
        cac_number="RC-452198",
        trust_level="Gold",
        years_active=8,
        total_properties=24,
        average_rating=4.8,
    )
    pending_agent = Agent(
        id=pending_agent_u.id,
        office_address="3 Obafemi Awolowo Way, Ikeja, Lagos",
        cac_number="RC-998001",
        trust_level="Bronze",
        years_active=1,
        total_properties=0,
        average_rating=0.0,
    )
    db.add_all([agent, pending_agent])

    # ------------------------------------------------------------------
    # 3. Properties (Lagos)
    # ------------------------------------------------------------------
    props = [
        dict(title="3-Bedroom Detached Duplex, Lekki Phase 1", type="sale", price=185_000_000, location="Lekki Phase 1, Lagos",
             size="450 sqm", bedrooms=3, bathrooms=4, status="Verified", agent=agent_u,
             desc="Corner duplex with BQ, smart home automation and 24/7 estate security.",
             images=["https://images.unsplash.com/photo-1568605114967-8130f3a36994"]),
        dict(title="2-Bedroom Apartment, Victoria Island", type="rent", price=12_500_000, location="Victoria Island, Lagos",
             size="120 sqm", bedrooms=2, bathrooms=2, status="Verified", agent=agent_u,
             desc="Serviced apartment with gym, pool and backup power in quiet cul-de-sac.",
             images=["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688"]),
        dict(title="4-Bedroom Terrace, Ikoyi", type="sale", price=320_000_000, location="Ikoyi, Lagos",
             size="520 sqm", bedrooms=4, bathrooms=5, status="Verified", agent=agent_u,
             desc="Full duplex terrace with private lift and waterfront views.",
             images=["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9"]),
        dict(title="1-Bedroom Studio, Yaba", type="rent", price=2_400_000, location="Yaba, Lagos",
             size="45 sqm", bedrooms=1, bathrooms=1, status="Verified", agent=agent_u,
             desc="Compact studio near tech hub, high-speed internet ready.",
             images=["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267"]),
        dict(title="5-Bedroom Mansion, Banana Island", type="sale", price=950_000_000, location="Banana Island, Lagos",
             size="1100 sqm", bedrooms=5, bathrooms=7, status="Verified", agent=agent_u,
             desc="Luxury waterfront mansion with helipad access and full staff quarters.",
             images=["https://images.unsplash.com/photo-1613490493576-7fde63acd811"]),
        dict(title="3-Bedroom Bungalow, Surulere", type="rent", price=5_500_000, location="Surulere, Lagos",
             size="250 sqm", bedrooms=3, bathrooms=3, status="Pending", agent=pending_agent_u,
             desc="Family bungalow with large compound and carport.",
             images=["https://images.unsplash.com/photo-1512917774080-9991f1c4c750"]),
        dict(title="2-Bedroom Flat, Gbagada", type="rent", price=3_800_000, location="Gbagada, Lagos",
             size="110 sqm", bedrooms=2, bathrooms=2, status="Pending", agent=pending_agent_u,
             desc="Mid-floor flat with balcony, power and water included.",
             images=["https://images.unsplash.com/photo-1570129477492-45c003edd2be"]),
        dict(title="6-Bedroom Smart Home, Eko Atlantic", type="sale", price=620_000_000, location="Eko Atlantic, Lagos",
             size="800 sqm", bedrooms=6, bathrooms=8, status="Verified", agent=agent_u,
             desc="Penthouse smart home with ocean view, EV charging and home cinema.",
             images=["https://images.unsplash.com/photo-1600585154340-be6161a56a0c"]),
    ]
    property_rows = []
    for i, pr in enumerate(props):
        p = Property(
            title=pr["title"], type=pr["type"], price=pr["price"], location=pr["location"],
            size=pr["size"], bedrooms=pr["bedrooms"], bathrooms=pr["bathrooms"],
            verified_status=pr["status"], agent_id=pr["agent"].id, description=pr["desc"],
            images=pr["images"],
        )
        db.add(p)
        property_rows.append(p)
    db.flush()

    rent_prop = property_rows[1]
    rentnow_plan = RentNowPlan(property_id=rent_prop.id, months=12, installment_amount=1_041_667, eligibility_required=True)
    db.add(rentnow_plan)

    # ------------------------------------------------------------------
    # 4. Reviews
    # ------------------------------------------------------------------
    db.add_all([
        Review(agent_id=agent_u.id, user_id=buyer.id, rating=5, comment="Aisha handled the whole process professionally and transparently."),
        Review(agent_id=agent_u.id, user_id=seller.id, rating=5, comment="Fast listing, honest pricing advice."),
        Review(agent_id=agent_u.id, user_id=tenant.id, rating=4, comment="Good service, minor communication delays."),
    ])

    # ------------------------------------------------------------------
    # 5. Deals (escrow + standard) with a few transitions
    # ------------------------------------------------------------------
    escrow = EscrowDeal(buyer_id=buyer.id, seller_id=seller.id, property_id=property_rows[0].id, amount=185_000_000)
    db.add(escrow)
    db.flush()
    escrow_transition(db, escrow, "BUYER_ACKNOWLEDGED", "buyer", buyer.id, {"seed": True})
    escrow_transition(db, escrow, "SELLER_ACKNOWLEDGED", "seller", seller.id, {"seed": True})
    db.add(PaymentIntent(payer_user_id=buyer.id, payee_user_id=seller.id, purpose="escrow_deposit",
                         purpose_ref_id=escrow.id, amount=escrow.amount, currency="NGN",
                         provider="mock", status="success", initiated_by="user"))
    escrow_transition(db, escrow, "BUYER_FUNDED", "buyer", buyer.id, {"seed": True, "funded": True})

    std = StandardDeal(buyer_id=tenant.id, seller_id=landlord.id, property_id=property_rows[3].id, amount=2_400_000)
    db.add(std)
    db.flush()
    standard_transition(db, std, "CONFIRMED", "buyer", tenant.id, {"seed": True})

    # ------------------------------------------------------------------
    # 6. Chat + call demo records
    # ------------------------------------------------------------------
    room = ChatRoom(type="direct", created_by_user_id=buyer.id, is_property_linked=True,
                    property_id=property_rows[0].id, deal_id=escrow.id)
    db.add(room)
    db.flush()
    db.add_all([
        ChatParticipant(chat_room_id=room.id, user_id=buyer.id, role_at_join="buyer", is_admin=True),
        ChatParticipant(chat_room_id=room.id, user_id=agent_u.id, role_at_join="agent"),
    ])
    db.add_all([
        ChatMessage(chat_room_id=room.id, sender_user_id=agent_u.id, message_type="text",
                    body="Hello Chiamaka! I can arrange a site inspection for the Lekki duplex this weekend."),
        ChatMessage(chat_room_id=room.id, sender_user_id=buyer.id, message_type="text",
                    body="Perfect, Saturday morning works for me."),
    ])

    call = CallSession(type="1v1_video", initiator_user_id=buyer.id, initiator_role="buyer",
                       status="ended", chat_room_id=room.id, property_id=property_rows[0].id,
                       deal_id=escrow.id, provider="mock", duration=725,
                       started_at=datetime.utcnow(),
                       ended_at=datetime.utcnow())
    db.add(call)
    db.flush()
    db.add_all([
        CallParticipant(call_session_id=call.id, user_id=buyer.id, user_role="buyer"),
        CallParticipant(call_session_id=call.id, user_id=agent_u.id, user_role="agent"),
    ])

    # ------------------------------------------------------------------
    # 7. Commissions, plans, beta, flags
    # ------------------------------------------------------------------
    db.add_all([
        CommissionRule(applies_to="escrow", payer="both", rate_type="percentage", value=5.0, description="Standard escrow commission"),
        CommissionRule(applies_to="listing", payer="seller", rate_type="percentage", value=3.0, description="Listing fee"),
        CommissionRule(applies_to="subscription", payer="agent", rate_type="fixed", value=50_000, description="Agent annual subscription"),
    ])
    db.add_all([
        SubscriptionPlan(role="Agent", duration=12, price=50_000, name="Agent Pro"),
        SubscriptionPlan(role="Landlord", duration=12, price=0, name="Landlord Free"),
        SubscriptionPlan(role="Buyer", duration=12, price=0, name="Buyer Free"),
    ])
    db.add_all([
        BetaUser(phone_number=buyer.phone, email=buyer.email, cohort="alpha", status="active", invite_code="VH-ALPHA001"),
        BetaUser(phone_number=tenant.phone, email=tenant.email, cohort="beta", status="active", invite_code="VH-BETA002"),
    ])
    ensure_default_flags(db)

    db.commit()

    print("Seed complete.")
    print("  Admins (email / password):")
    for email, name, role, phone in admins:
        print(f"    {email}  /  Admin@123   ({role})")
    print("  Demo users (phone -> OTP mock code '123456'):")
    print("    Buyer   +2348012345678  Chiamaka Eze")
    print("    Seller  +2348098765432  Ibrahim Musa")
    print("    Tenant  +2348111222333  David Adeleke")
    print("    Landlord +2348022223333 Ngozi Okonkwo")
    print("    Agent   +2348076543210  Aisha Bello")
    db.close()


if __name__ == "__main__":
    seed()
