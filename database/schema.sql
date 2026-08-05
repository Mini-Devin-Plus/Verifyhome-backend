-- VerifyHome MVP Database Schema (PostgreSQL)

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role VARCHAR(10) CHECK (role IN ('Tenant', 'Buyer', 'Agent')) NOT NULL,
    bvn VARCHAR(11), -- Optional for tenants
    nin VARCHAR(11), -- Optional for tenants
    verification_status VARCHAR(10) CHECK (verification_status IN ('Pending', 'Verified', 'Rejected')) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agents table (extends users)
CREATE TABLE agents (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    office_address TEXT NOT NULL,
    cac_number VARCHAR(50) NOT NULL,
    trust_level VARCHAR(10) CHECK (trust_level IN ('Bronze', 'Silver', 'Gold')) DEFAULT 'Bronze',
    years_active INTEGER DEFAULT 0,
    total_properties INTEGER DEFAULT 0,
    average_rating DECIMAL(2,1) DEFAULT 0.0
);

-- Properties table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('rent', 'sale')) NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    size VARCHAR(50) NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    verified_status VARCHAR(10) CHECK (verified_status IN ('Pending', 'Verified', 'Rejected')) DEFAULT 'Pending',
    agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    images TEXT[], -- Array of image URLs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RentNow Plans table
CREATE TABLE rent_now_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    months INTEGER NOT NULL,
    installment_amount DECIMAL(15,2) NOT NULL,
    eligibility_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Buy Offers table
CREATE TABLE buy_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    offer_amount DECIMAL(15,2) NOT NULL,
    escrow_status VARCHAR(10) CHECK (escrow_status IN ('Pending', 'Deposited', 'Released', 'Refunded')) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_properties_agent_id ON properties(agent_id);
CREATE INDEX idx_properties_type ON properties(type);
CREATE INDEX idx_properties_location ON properties(location);
CREATE INDEX idx_rent_now_plans_property_id ON rent_now_plans(property_id);
CREATE INDEX idx_buy_offers_property_id ON buy_offers(property_id);
CREATE INDEX idx_buy_offers_buyer_id ON buy_offers(buyer_id);
CREATE INDEX idx_reviews_agent_id ON reviews(agent_id);
CREATE INDEX idx_users_role ON users(role);