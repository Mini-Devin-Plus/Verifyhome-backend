// Database Schema Types for VerifyHome MVP

// IMPORTANT: OwnershipContext enables auditability and trust enforcement
// Required for future dispute resolution and fraud prevention
export interface OwnershipContext {
  ownerType: 'agent' | 'landlord' | 'seller';
  ownerId: string;
  managedByAgentId?: string; // For landlord properties managed by agents
}

// Agent-Landlord relationship model for future trust enforcement
export interface AgentLandlordLink {
  agentId: string;
  landlordId: string;
  status: 'active' | 'revoked';
}

// OTP Authentication - NO PASSWORDS ALLOWED
export interface OTPSession {
  id: string;
  phoneNumber: string; // Primary identifier
  otpHash: string; // Hashed OTP, never store plaintext
  purpose: 'login' | 'signup' | 'escrow_confirmation' | 'admin_approval' | 'sensitive_action';
  attempts: number;
  maxAttempts: number; // 3-5 attempts
  expiresAt: Date; // 2-5 minutes
  isVerified: boolean;
  createdAt: Date;
  verifiedAt?: Date;
  ipAddress?: string; // For rate limiting
}

// OTP Audit Log - MANDATORY for compliance
export interface OTPAuditLog {
  id: string;
  phoneNumber: string;
  purpose: OTPSession['purpose'];
  action: 'sent' | 'verified' | 'failed' | 'expired' | 'rate_limited';
  attempts: number;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorReason?: string;
  timestamp: Date;
}

// User Session - OTP-based only
export interface UserSession {
  id: string;
  userId: string;
  phoneNumber: string;
  otpSessionId: string; // Link to OTP verification
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Payment Foundation - INTENT ONLY, NO MONEY HANDLING
export interface PaymentIntent {
  id: string;
  payerUserId: string;
  payeeUserId?: string; // For escrow release
  purpose: 'subscription' | 'listing_fee' | 'escrow_deposit' | 'escrow_release' | 'commission' | 'standard_deal';
  purposeRefId: string; // subscriptionId, propertyId, escrowCaseId, etc.
  amount: number; // NGN
  currency: 'NGN';
  provider: 'mock' | 'flutterwave';
  providerRef?: string;
  status: 'initiated' | 'pending' | 'success' | 'failed' | 'cancelled';
  initiatedBy?: 'user' | 'system'; // Audit clarity for trust enforcement
  commissionSnapshot?: CommissionBreakdown; // Read-only commission info
  createdAt: Date;
}

// Enhanced Escrow Deal - FULL STATE MACHINE
export interface EscrowDeal {
  id: string;
  type: 'escrow';
  buyerId: string;
  sellerId: string;
  propertyId: string;
  amount: number;
  // State machine
  state: 'INITIATED' | 'BUYER_ACKNOWLEDGED' | 'SELLER_ACKNOWLEDGED' | 'BUYER_FUNDED' | 'DOCUMENTS_SUBMITTED' | 'DOCUMENTS_APPROVED' | 'INSPECTION_SCHEDULED' | 'INSPECTION_COMPLETED' | 'BUYER_CONFIRMED' | 'PENDING_ADMIN_APPROVAL' | 'APPROVED' | 'DISPUTED' | 'SELLER_DEFAULTED' | 'ADMIN_REJECTED' | 'REFUNDED' | 'COMPLETED';
  // Time tracking
  createdAt: Date;
  buyerConfirmedAt?: Date;
  disputedAt?: Date;
  disputeReason?: string;
  // Audit trail
  transitions: DealStateTransition[];
  otpCheckpoints: OTPCheckpoint[];
}

// Standard Deal - DIRECT TRANSFER
export interface StandardDeal {
  id: string;
  type: 'standard';
  buyerId: string;
  sellerId: string;
  propertyId: string;
  amount: number;
  // State machine
  state: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'SELLER_ACKNOWLEDGED' | 'PAYMENT_RECEIVED' | 'COMPLETED' | 'DISPUTED' | 'EXPIRED' | 'PENDING_ADMIN_APPROVAL';
  // Time tracking
  createdAt: Date;
  disputedAt?: Date;
  disputeReason?: string;
  // Audit trail
  transitions: DealStateTransition[];
  otpCheckpoints: OTPCheckpoint[];
}

// Deal State Transition (unified for both deal types)
export interface DealStateTransition {
  id: string;
  dealId: string;
  fromState: string;
  toState: string;
  triggeredBy: string;
  userRole: 'buyer' | 'seller' | 'admin' | 'system';
  transitionedAt: Date;
  metadata?: Record<string, any>;
}

// OTP Checkpoint (for deal state transitions)

// Action Attempt Audit Log
export interface ActionAttemptLog {
  id: string;
  actionType: string;
  actorRole: 'buyer' | 'seller';
  actorUserId: string;
  dealId: string;
  otpSessionId?: string;
  success: boolean;
  failureReason?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// OTP Checkpoint (for deal state transitions)
export interface OTPCheckpoint {
  id: string;
  dealId: string;
  action: string;
  userId: string;
  userRole: 'buyer' | 'seller' | 'admin';
  phoneNumber: string;
  verifiedAt: Date;
  metadata?: Record<string, any>;
}

// Deal choice enforcement
export interface DealChoice {
  id: string;
  buyerId: string;
  sellerId: string;
  propertyId: string;
  dealType: 'escrow' | 'standard';
  buyerSelectedAt: Date;
  sellerAcknowledgedAt?: Date;
  escrowDealId?: string;
  standardDealId?: string;
  createdAt: Date;
}

// Commission Foundation - CALCULATION ONLY, NO MONEY HANDLING
// IMPORTANT: Commission is calculated, not collected by this app
// Funds are handled externally (Flutterwave escrow)
export interface CommissionRule {
  id: string;
  appliesTo: 'subscription' | 'listing' | 'escrow';
  payer: 'buyer' | 'seller' | 'both';
  rateType: 'percentage' | 'flat';
  value: number; // Percentage (0-100) or flat amount in NGN
  isActive: boolean;
  effectiveFrom: Date;
  description: string;
}

// Commission calculation result - READ-ONLY, INFORMATIONAL ONLY
export interface CommissionBreakdown {
  grossAmount: number; // Original amount
  platformCommission: number; // Commission amount
  sellerReceives: number; // Amount seller receives after commission
  buyerPays: number; // Total amount buyer pays
  commissionRuleId: string; // Reference to rule used
  calculatedAt: Date;
  // IMPORTANT: This is informational only - actual deduction handled externally
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string; // PRIMARY IDENTIFIER - required for OTP auth
  role: 'Tenant' | 'Buyer' | 'Agent' | 'Seller' | 'Landlord';
  bvn?: string; // Optional for tenants
  nin?: string; // Optional for tenants
  verificationStatus: 'Pending' | 'Verified' | 'Rejected';
  // OTP Authentication - NO PASSWORDS
  phoneVerified: boolean; // Must be true for active users
  lastOTPVerification?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent extends User {
  role: 'Agent' | 'Seller' | 'Landlord';
  officeAddress: string;
  cacNumber: string;
  trustLevel: 'Bronze' | 'Silver' | 'Gold';
  yearsActive: number;
  totalProperties: number;
  averageRating: number;
}

export interface Property {
  id: string;
  title: string;
  type: 'rent' | 'sale';
  price: number;
  location: string;
  size: string;
  bedrooms: number;
  bathrooms: number;
  verifiedStatus: 'Pending' | 'Verified' | 'Rejected';
  agentId: string;
  description: string;
  images: string[];
  // IMPORTANT: OwnershipContext enables auditability and trust enforcement
  ownershipContext?: OwnershipContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentNowPlan {
  id: string;
  propertyId: string;
  months: number;
  installmentAmount: number;
  eligibilityRequired: boolean;
  createdAt: Date;
}

export interface BuyOffer {
  id: string;
  propertyId: string;
  buyerId: string;
  offerAmount: number;
  escrowStatus: 'Pending' | 'Deposited' | 'Released' | 'Refunded';
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  agentId: string;
  userId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Date;
}

// Database Relations
export interface PropertyWithAgent extends Property {
  agent: Agent;
}

export interface AgentWithReviews extends Agent {
  reviews: Review[];
}

export interface PropertyWithRentPlan extends Property {
  rentPlan?: RentNowPlan;
}

// Subscription Models
export interface SubscriptionPlan {
  id: string;
  role: User['role'];
  duration: number; // months
  price: number; // in Naira
  name: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'expired' | 'none';
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
}