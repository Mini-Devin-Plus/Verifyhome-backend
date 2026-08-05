import { EscrowDeal, StandardDeal } from '../types/database';
import { DealService } from './DealService';
import { DealStateMachine } from './DealStateMachine';
import { PaymentService } from './PaymentService';
import { CommissionService } from './CommissionService';

export class EscrowService {
  
  // Create escrow deal (FOUNDATION ONLY - NO PAYMENT EXECUTION)
  // AUTHORITY: Only Buyer can initiate escrow
  static async createEscrowDeal(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    propertyAmount: number,
    maxDurationDays: number = 25
  ): Promise<EscrowDeal> {
    // Create deal choice first
    await DealService.createDealChoice(buyerId, sellerId, propertyId, 'escrow');
    
    // Create escrow deal
    return await DealService.createEscrowDeal(buyerId, sellerId, propertyId, propertyAmount, maxDurationDays);
  }

  // Create standard deal (FOUNDATION ONLY - NO PAYMENT EXECUTION)
  static async createStandardDeal(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    propertyAmount: number,
    buyerAcknowledgmentText: string
  ): Promise<StandardDeal> {
    // Create deal choice first
    await DealService.createDealChoice(buyerId, sellerId, propertyId, 'standard');
    
    // Create standard deal
    return await DealService.createStandardDeal(buyerId, sellerId, propertyId, propertyAmount, buyerAcknowledgmentText);
  }

  // ESCROW DEAL LIFECYCLE METHODS (STATE MACHINE ONLY)
  
  // Buyer funds escrow (requires OTP in future)
  static async buyerFundEscrow(
    dealId: string,
    buyerId: string,
    otpSessionId?: string
  ): Promise<EscrowDeal> {
    return await DealService.transitionEscrowDeal(
      dealId,
      'buyer_funded',
      'buyer',
      buyerId,
      'Buyer funded escrow',
      otpSessionId
    );
  }

  // Seller acknowledges escrow terms
  static async sellerAcknowledgeEscrow(
    dealId: string,
    sellerId: string
  ): Promise<EscrowDeal> {
    return await DealService.transitionEscrowDeal(
      dealId,
      'seller_acknowledged',
      'seller',
      sellerId,
      'Seller acknowledged escrow terms'
    );
  }

  // Seller submits documents
  static async sellerSubmitDocuments(
    dealId: string,
    sellerId: string,
    documents: string[]
  ): Promise<EscrowDeal> {
    const deal = await DealService.getEscrowDeal(dealId);
    if (!deal || deal.sellerId !== sellerId) {
      throw new Error('Unauthorized or deal not found');
    }

    // Update documents submitted
    deal.documentsSubmitted = documents;
    
    return await DealService.transitionEscrowDeal(
      dealId,
      'documents_submitted',
      'seller',
      sellerId,
      'Documents submitted for review',
      undefined,
      { documents }
    );
  }

  // Admin approves documents
  static async adminApproveDocuments(
    dealId: string,
    adminId: string,
    approvedDocuments: string[]
  ): Promise<EscrowDeal> {
    const deal = await DealService.getEscrowDeal(dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }

    // Update approved documents
    deal.documentsApproved = approvedDocuments;
    
    return await DealService.transitionEscrowDeal(
      dealId,
      'documents_approved',
      'admin',
      adminId,
      'Documents approved by admin',
      undefined,
      { approvedDocuments }
    );
  }

  // Complete inspection
  static async completeInspection(
    dealId: string,
    inspectionPassed: boolean,
    inspectorId?: string
  ): Promise<EscrowDeal> {
    const deal = await DealService.getEscrowDeal(dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }

    // Update inspection status
    deal.inspectionPassed = inspectionPassed;
    
    return await DealService.transitionEscrowDeal(
      dealId,
      'inspection_completed',
      'system',
      inspectorId,
      `Inspection ${inspectionPassed ? 'passed' : 'failed'}`,
      undefined,
      { inspectionPassed }
    );
  }

  // Buyer confirms release (REQUIRES OTP)
  static async buyerConfirmRelease(
    dealId: string,
    buyerId: string,
    otpSessionId: string
  ): Promise<EscrowDeal> {
    return await DealService.transitionEscrowDeal(
      dealId,
      'buyer_confirmed',
      'buyer',
      buyerId,
      'Buyer confirmed fund release',
      otpSessionId
    );
  }

  // Admin final approval (REQUIRES OTP)
  static async adminFinalApproval(
    dealId: string,
    adminId: string,
    otpSessionId: string
  ): Promise<EscrowDeal> {
    return await DealService.transitionEscrowDeal(
      dealId,
      'funds_released',
      'admin',
      adminId,
      'Admin approved final fund release',
      otpSessionId
    );
  }

  // Mark seller as defaulted
  static async markSellerDefault(
    dealId: string,
    adminId: string,
    reason: 'fake_documents' | 'inspection_failure' | 'deadline_exceeded' | 'material_misrepresentation'
  ): Promise<EscrowDeal> {
    const deal = await DealService.getEscrowDeal(dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }

    // Validate default reason
    if (!DealStateMachine.canMarkSellerDefault(deal, reason)) {
      throw new Error(`Cannot mark seller as defaulted for reason: ${reason}`);
    }

    return await DealService.transitionEscrowDeal(
      dealId,
      'seller_defaulted',
      'admin',
      adminId,
      `Seller defaulted: ${reason}`,
      undefined,
      { defaultReason: reason }
    );
  }

  // Raise dispute
  static async raiseDispute(
    dealId: string,
    buyerId: string,
    reason: string
  ): Promise<EscrowDeal> {
    const deal = await DealService.getEscrowDeal(dealId);
    if (!deal || deal.buyerId !== buyerId) {
      throw new Error('Unauthorized or deal not found');
    }

    // Update dispute information
    deal.disputeReason = reason;
    deal.disputeRaisedAt = new Date();
    
    return await DealService.transitionEscrowDeal(
      dealId,
      'disputed',
      'buyer',
      buyerId,
      'Dispute raised by buyer',
      undefined,
      { disputeReason: reason }
    );
  }

  // STANDARD DEAL LIFECYCLE METHODS (STATE MACHINE ONLY)
  
  // Buyer acknowledges standard deal (REQUIRES OTP)
  static async buyerAcknowledgeStandardDeal(
    dealId: string,
    buyerId: string,
    otpSessionId: string
  ): Promise<StandardDeal> {
    return await DealService.transitionStandardDeal(
      dealId,
      'buyer_acknowledged',
      'buyer',
      buyerId,
      'Buyer acknowledged standard deal terms',
      otpSessionId
    );
  }

  // Admin reviews standard deal
  static async adminReviewStandardDeal(
    dealId: string,
    adminId: string
  ): Promise<StandardDeal> {
    return await DealService.transitionStandardDeal(
      dealId,
      'admin_reviewed',
      'admin',
      adminId,
      'Admin reviewed standard deal'
    );
  }

  // UTILITY METHODS
  
  // Get deal by ID (either type)
  static async getDeal(dealId: string): Promise<EscrowDeal | StandardDeal | null> {
    const escrowDeal = await DealService.getEscrowDeal(dealId);
    if (escrowDeal) return escrowDeal;
    
    const standardDeal = await DealService.getStandardDeal(dealId);
    return standardDeal;
  }

  // Get deals by user
  static async getDealsByUser(userId: string): Promise<{ escrowDeals: EscrowDeal[]; standardDeals: StandardDeal[] }> {
    const [buyerEscrowDeals, sellerEscrowDeals, buyerStandardDeals, sellerStandardDeals] = await Promise.all([
      DealService.getEscrowDealsByBuyer(userId),
      DealService.getEscrowDealsBySeller(userId),
      DealService.getStandardDealsByBuyer(userId),
      DealService.getStandardDealsBySeller(userId)
    ]);

    return {
      escrowDeals: [...buyerEscrowDeals, ...sellerEscrowDeals],
      standardDeals: [...buyerStandardDeals, ...sellerStandardDeals]
    };
  }

  // System maintenance - check expired deals
  static async performMaintenanceChecks(): Promise<{ expiredEscrow: EscrowDeal[]; readyStandard: StandardDeal[] }> {
    const [expiredEscrow, readyStandard] = await Promise.all([
      DealService.checkExpiredEscrowDeals(),
      DealService.checkCoolingOffStandardDeals()
    ]);

    return { expiredEscrow, readyStandard };
  }
}