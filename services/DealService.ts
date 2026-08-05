import { EscrowDeal, StandardDeal, DealChoice } from '../types/database';
import { DealStateMachine } from './DealStateMachine';
import { CommissionService } from './CommissionService';

// Mock storage
const mockEscrowDeals: EscrowDeal[] = [];
const mockStandardDeals: StandardDeal[] = [];
const mockDealChoices: DealChoice[] = [];

export class DealService {
  
  // BUYER CHOICE ENFORCEMENT
  static async createDealChoice(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    dealType: 'escrow' | 'standard'
  ): Promise<DealChoice> {
    // Check if choice already exists
    const existingChoice = mockDealChoices.find(
      dc => dc.buyerId === buyerId && dc.sellerId === sellerId && dc.propertyId === propertyId
    );
    
    if (existingChoice) {
      throw new Error('Deal choice already made for this property');
    }

    const dealChoice: DealChoice = {
      id: `choice_${Date.now()}`,
      buyerId,
      sellerId,
      propertyId,
      dealType,
      buyerSelectedAt: new Date(),
      createdAt: new Date()
    };

    mockDealChoices.push(dealChoice);
    return dealChoice;
  }

  // CREATE ESCROW DEAL
  static async createEscrowDeal(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    propertyAmount: number,
    maxDurationDays: number = 25
  ): Promise<EscrowDeal> {
    // Calculate financial breakdown
    const commission = CommissionService.calculateEscrowCommission(propertyAmount);
    
    const escrowDeal: EscrowDeal = {
      id: `escrow_${Date.now()}`,
      buyerId,
      sellerId,
      propertyId,
      status: 'initiated',
      maxDurationDays,
      createdAt: new Date(),
      expiresAt: DealStateMachine.calculateEscrowExpiry(new Date(), maxDurationDays),
      // Financial tracking
      propertyAmount,
      buyerCommission: Math.round(propertyAmount * 0.015), // 1.5%
      sellerCommission: Math.round(propertyAmount * 0.015), // 1.5%
      escrowFee: Math.round(propertyAmount * 0.0075), // 0.75%
      totalBuyerAmount: commission.buyerPays,
      totalSellerAmount: commission.sellerReceives,
      // Seller requirements (default)
      documentsRequired: ['property_title', 'survey_plan', 'certificate_of_occupancy'],
      documentsSubmitted: [],
      documentsApproved: [],
      inspectionRequired: true,
      inspectionPassed: false,
      sellerWarnings: [],
      // Audit trail
      stateTransitions: [],
      updatedAt: new Date()
    };

    // Add initial state transition
    const transition = DealStateMachine.createEscrowTransition(
      'initiated',
      'initiated',
      'system',
      undefined,
      'Escrow deal created'
    );
    escrowDeal.stateTransitions.push(transition);

    mockEscrowDeals.push(escrowDeal);
    return escrowDeal;
  }

  // CREATE STANDARD DEAL
  static async createStandardDeal(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    propertyAmount: number,
    buyerAcknowledgmentText: string
  ): Promise<StandardDeal> {
    // Calculate financial breakdown
    const commission = CommissionService.calculateStandardDealCommission(propertyAmount);
    
    const standardDeal: StandardDeal = {
      id: `standard_${Date.now()}`,
      buyerId,
      sellerId,
      propertyId,
      status: 'initiated',
      createdAt: new Date(),
      // Buyer acknowledgment
      buyerAcknowledged: false,
      buyerAcknowledgmentText,
      // Financial tracking
      propertyAmount,
      buyerCommission: Math.round(propertyAmount * 0.015), // 1.5%
      sellerCommission: Math.round(propertyAmount * 0.015), // 1.5%
      totalBuyerAmount: commission.buyerPays,
      totalSellerAmount: commission.sellerReceives,
      // Audit trail
      stateTransitions: [],
      updatedAt: new Date()
    };

    // Add initial state transition
    const transition = DealStateMachine.createStandardTransition(
      'initiated',
      'initiated',
      'system',
      undefined,
      'Standard deal created'
    );
    standardDeal.stateTransitions.push(transition);

    mockStandardDeals.push(standardDeal);
    return standardDeal;
  }

  // ESCROW DEAL STATE TRANSITIONS
  static async transitionEscrowDeal(
    dealId: string,
    newStatus: EscrowDeal['status'],
    triggeredBy: 'buyer' | 'seller' | 'admin' | 'system',
    triggeredByUserId?: string,
    reason?: string,
    otpSessionId?: string,
    metadata?: Record<string, any>
  ): Promise<EscrowDeal> {
    const deal = mockEscrowDeals.find(d => d.id === dealId);
    if (!deal) {
      throw new Error('Escrow deal not found');
    }

    // Validate state transition
    if (!DealStateMachine.canTransitionEscrow(deal.status, newStatus)) {
      throw new Error(`Invalid state transition from ${deal.status} to ${newStatus}`);
    }

    // Check OTP requirements
    const requiredOTP = DealStateMachine.getEscrowOTPCheckpoints(newStatus);
    if (requiredOTP.length > 0 && !otpSessionId) {
      throw new Error(`OTP verification required for transition to ${newStatus}`);
    }

    const oldStatus = deal.status;
    deal.status = newStatus;
    deal.updatedAt = new Date();

    // Update timestamp fields based on new status
    switch (newStatus) {
      case 'buyer_funded':
        deal.fundedAt = new Date();
        break;
      case 'seller_acknowledged':
        deal.sellerAcknowledgedAt = new Date();
        break;
      case 'documents_submitted':
        deal.documentsSubmittedAt = new Date();
        break;
      case 'documents_approved':
        deal.documentsApprovedAt = new Date();
        break;
      case 'inspection_completed':
        deal.inspectionCompletedAt = new Date();
        break;
      case 'buyer_confirmed':
        deal.buyerConfirmedAt = new Date();
        deal.buyerOTPSessionId = otpSessionId;
        break;
      case 'funds_released':
        deal.adminApprovedAt = new Date();
        deal.releasedAt = new Date();
        deal.adminOTPSessionId = otpSessionId;
        break;
      case 'seller_defaulted':
        // Set default reason if provided in metadata
        if (metadata?.defaultReason) {
          deal.sellerDefaultReason = metadata.defaultReason;
        }
        break;
    }

    // Add state transition record
    const transition = DealStateMachine.createEscrowTransition(
      oldStatus,
      newStatus,
      triggeredBy,
      triggeredByUserId,
      reason,
      otpSessionId,
      metadata
    );
    deal.stateTransitions.push(transition);

    return deal;
  }

  // STANDARD DEAL STATE TRANSITIONS
  static async transitionStandardDeal(
    dealId: string,
    newStatus: StandardDeal['status'],
    triggeredBy: 'buyer' | 'seller' | 'admin' | 'system',
    triggeredByUserId?: string,
    reason?: string,
    otpSessionId?: string,
    metadata?: Record<string, any>
  ): Promise<StandardDeal> {
    const deal = mockStandardDeals.find(d => d.id === dealId);
    if (!deal) {
      throw new Error('Standard deal not found');
    }

    // Validate state transition
    if (!DealStateMachine.canTransitionStandard(deal.status, newStatus)) {
      throw new Error(`Invalid state transition from ${deal.status} to ${newStatus}`);
    }

    // Check OTP requirements
    const requiredOTP = DealStateMachine.getStandardOTPCheckpoints(newStatus);
    if (requiredOTP.length > 0 && !otpSessionId) {
      throw new Error(`OTP verification required for transition to ${newStatus}`);
    }

    const oldStatus = deal.status;
    deal.status = newStatus;
    deal.updatedAt = new Date();

    // Update timestamp fields based on new status
    switch (newStatus) {
      case 'buyer_acknowledged':
        deal.buyerAcknowledged = true;
        deal.buyerAcknowledgedAt = new Date();
        deal.buyerOTPSessionId = otpSessionId;
        deal.coolingOffEndsAt = DealStateMachine.calculateCoolingOffEnd(new Date());
        break;
      case 'admin_reviewed':
        deal.adminReviewedAt = new Date();
        break;
      case 'funds_transferred':
        deal.transferredAt = new Date();
        break;
      case 'completed':
        deal.completedAt = new Date();
        break;
    }

    // Add state transition record
    const transition = DealStateMachine.createStandardTransition(
      oldStatus,
      newStatus,
      triggeredBy,
      triggeredByUserId,
      reason,
      otpSessionId,
      metadata
    );
    deal.stateTransitions.push(transition);

    return deal;
  }

  // GET DEALS
  static async getEscrowDeal(dealId: string): Promise<EscrowDeal | null> {
    const deal = mockEscrowDeals.find(d => d.id === dealId);
    return Promise.resolve(deal || null);
  }

  static async getStandardDeal(dealId: string): Promise<StandardDeal | null> {
    const deal = mockStandardDeals.find(d => d.id === dealId);
    return Promise.resolve(deal || null);
  }

  static async getDealChoice(buyerId: string, propertyId: string): Promise<DealChoice | null> {
    const choice = mockDealChoices.find(dc => dc.buyerId === buyerId && dc.propertyId === propertyId);
    return Promise.resolve(choice || null);
  }

  // GET DEALS BY USER
  static async getEscrowDealsByBuyer(buyerId: string): Promise<EscrowDeal[]> {
    const deals = mockEscrowDeals.filter(d => d.buyerId === buyerId);
    return Promise.resolve(deals);
  }

  static async getEscrowDealsBySeller(sellerId: string): Promise<EscrowDeal[]> {
    const deals = mockEscrowDeals.filter(d => d.sellerId === sellerId);
    return Promise.resolve(deals);
  }

  static async getStandardDealsByBuyer(buyerId: string): Promise<StandardDeal[]> {
    const deals = mockStandardDeals.filter(d => d.buyerId === buyerId);
    return Promise.resolve(deals);
  }

  static async getStandardDealsBySeller(sellerId: string): Promise<StandardDeal[]> {
    const deals = mockStandardDeals.filter(d => d.sellerId === sellerId);
    return Promise.resolve(deals);
  }

  // DEAL LIFECYCLE CHECKS
  static async checkExpiredEscrowDeals(): Promise<EscrowDeal[]> {
    const expiredDeals = mockEscrowDeals.filter(deal => 
      DealStateMachine.isEscrowExpired(deal) && 
      !['funds_released', 'refunded', 'cancelled', 'expired'].includes(deal.status)
    );

    // Auto-transition expired deals
    for (const deal of expiredDeals) {
      await this.transitionEscrowDeal(
        deal.id,
        'expired',
        'system',
        undefined,
        'Deal expired due to timeout'
      );
    }

    return expiredDeals;
  }

  static async checkCoolingOffStandardDeals(): Promise<StandardDeal[]> {
    const readyDeals = mockStandardDeals.filter(deal => 
      deal.status === 'cooling_off' && 
      DealStateMachine.isCoolingOffOver(deal)
    );

    // Auto-transition deals out of cooling-off
    for (const deal of readyDeals) {
      await this.transitionStandardDeal(
        deal.id,
        'admin_reviewed',
        'system',
        undefined,
        'Cooling-off period completed'
      );
    }

    return readyDeals;
  }
}