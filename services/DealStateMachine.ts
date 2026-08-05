import { EscrowDeal, StandardDeal, EscrowStateTransition, StandardDealStateTransition } from '../types/database';

// State machine rules and validations
export class DealStateMachine {
  
  // ESCROW DEAL STATE MACHINE
  private static readonly ESCROW_STATE_TRANSITIONS: Record<EscrowDeal['status'], EscrowDeal['status'][]> = {
    'initiated': ['buyer_funded', 'cancelled'],
    'buyer_funded': ['seller_acknowledged', 'refunded', 'expired'],
    'seller_acknowledged': ['documents_pending', 'seller_defaulted'],
    'documents_pending': ['documents_submitted', 'seller_defaulted', 'expired'],
    'documents_submitted': ['documents_approved', 'seller_defaulted'],
    'documents_approved': ['inspection_pending', 'buyer_confirmation_pending'],
    'inspection_pending': ['inspection_completed', 'seller_defaulted', 'expired'],
    'inspection_completed': ['buyer_confirmation_pending', 'seller_defaulted'],
    'buyer_confirmation_pending': ['buyer_confirmed', 'disputed', 'expired'],
    'buyer_confirmed': ['admin_approval_pending'],
    'admin_approval_pending': ['funds_released', 'disputed'],
    'funds_released': [], // Terminal state
    'disputed': ['refunded', 'funds_released'], // Can be resolved either way
    'refunded': [], // Terminal state
    'expired': ['refunded'], // Can only refund after expiry
    'seller_defaulted': ['refunded'], // Can only refund after default
    'cancelled': [] // Terminal state
  };

  // STANDARD DEAL STATE MACHINE
  private static readonly STANDARD_STATE_TRANSITIONS: Record<StandardDeal['status'], StandardDeal['status'][]> = {
    'initiated': ['buyer_acknowledged', 'cancelled'],
    'buyer_acknowledged': ['cooling_off', 'cancelled'],
    'cooling_off': ['admin_reviewed', 'cancelled'],
    'admin_reviewed': ['funds_transferred', 'cancelled'],
    'funds_transferred': ['completed'],
    'completed': [], // Terminal state
    'disputed': ['refunded', 'completed'], // Limited dispute resolution
    'refunded': [], // Terminal state
    'cancelled': [] // Terminal state
  };

  // Validate escrow state transition
  static canTransitionEscrow(
    currentStatus: EscrowDeal['status'], 
    newStatus: EscrowDeal['status']
  ): boolean {
    const allowedTransitions = this.ESCROW_STATE_TRANSITIONS[currentStatus] || [];
    return allowedTransitions.includes(newStatus);
  }

  // Validate standard deal state transition
  static canTransitionStandard(
    currentStatus: StandardDeal['status'], 
    newStatus: StandardDeal['status']
  ): boolean {
    const allowedTransitions = this.STANDARD_STATE_TRANSITIONS[currentStatus] || [];
    return allowedTransitions.includes(newStatus);
  }

  // Create escrow state transition record
  static createEscrowTransition(
    fromStatus: EscrowDeal['status'],
    toStatus: EscrowDeal['status'],
    triggeredBy: 'buyer' | 'seller' | 'admin' | 'system',
    triggeredByUserId?: string,
    reason?: string,
    otpSessionId?: string,
    metadata?: Record<string, any>
  ): EscrowStateTransition {
    return {
      id: `est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromStatus,
      toStatus,
      triggeredBy,
      triggeredByUserId,
      reason,
      otpSessionId,
      metadata,
      timestamp: new Date()
    };
  }

  // Create standard deal state transition record
  static createStandardTransition(
    fromStatus: StandardDeal['status'],
    toStatus: StandardDeal['status'],
    triggeredBy: 'buyer' | 'seller' | 'admin' | 'system',
    triggeredByUserId?: string,
    reason?: string,
    otpSessionId?: string,
    metadata?: Record<string, any>
  ): StandardDealStateTransition {
    return {
      id: `sdt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromStatus,
      toStatus,
      triggeredBy,
      triggeredByUserId,
      reason,
      otpSessionId,
      metadata,
      timestamp: new Date()
    };
  }

  // Check if escrow deal is expired
  static isEscrowExpired(deal: EscrowDeal): boolean {
    return new Date() > deal.expiresAt;
  }

  // Check if standard deal cooling-off period is over
  static isCoolingOffOver(deal: StandardDeal): boolean {
    if (!deal.coolingOffEndsAt) return true;
    return new Date() > deal.coolingOffEndsAt;
  }

  // Get required OTP checkpoints for escrow deal
  static getEscrowOTPCheckpoints(status: EscrowDeal['status']): ('buyer' | 'admin')[] {
    switch (status) {
      case 'buyer_confirmation_pending':
        return ['buyer'];
      case 'admin_approval_pending':
        return ['admin'];
      default:
        return [];
    }
  }

  // Get required OTP checkpoints for standard deal
  static getStandardOTPCheckpoints(status: StandardDeal['status']): ('buyer')[] {
    switch (status) {
      case 'buyer_acknowledged':
        return ['buyer'];
      default:
        return [];
    }
  }

  // Check if seller can be marked as defaulted
  static canMarkSellerDefault(
    deal: EscrowDeal,
    reason: 'fake_documents' | 'inspection_failure' | 'deadline_exceeded' | 'material_misrepresentation'
  ): boolean {
    const validStatesForDefault = [
      'seller_acknowledged',
      'documents_pending',
      'documents_submitted',
      'inspection_pending',
      'inspection_completed'
    ];
    
    if (!validStatesForDefault.includes(deal.status)) {
      return false;
    }

    // Additional validation based on reason
    switch (reason) {
      case 'fake_documents':
        return deal.status === 'documents_submitted';
      case 'inspection_failure':
        return deal.status === 'inspection_completed' && !deal.inspectionPassed;
      case 'deadline_exceeded':
        return this.isEscrowExpired(deal);
      case 'material_misrepresentation':
        return true; // Can happen at any stage
      default:
        return false;
    }
  }

  // Get next required actions for escrow deal
  static getEscrowNextActions(deal: EscrowDeal): string[] {
    switch (deal.status) {
      case 'initiated':
        return ['Buyer must fund escrow'];
      case 'buyer_funded':
        return ['Seller must acknowledge escrow terms'];
      case 'seller_acknowledged':
        return ['System will set document requirements'];
      case 'documents_pending':
        return ['Seller must submit required documents'];
      case 'documents_submitted':
        return ['Admin must review and approve documents'];
      case 'documents_approved':
        return deal.inspectionRequired 
          ? ['Inspection must be scheduled and completed']
          : ['Buyer can confirm release'];
      case 'inspection_pending':
        return ['Inspection must be completed'];
      case 'inspection_completed':
        return ['Buyer can confirm release'];
      case 'buyer_confirmation_pending':
        return ['Buyer must confirm release with OTP'];
      case 'buyer_confirmed':
        return ['Admin must give final approval with OTP'];
      case 'admin_approval_pending':
        return ['Admin must approve final release'];
      default:
        return [];
    }
  }

  // Get next required actions for standard deal
  static getStandardNextActions(deal: StandardDeal): string[] {
    switch (deal.status) {
      case 'initiated':
        return ['Buyer must acknowledge standard deal terms'];
      case 'buyer_acknowledged':
        return ['Cooling-off period in progress'];
      case 'cooling_off':
        return ['Admin review in progress'];
      case 'admin_reviewed':
        return ['Funds will be transferred'];
      case 'funds_transferred':
        return ['Deal will be marked as completed'];
      default:
        return [];
    }
  }

  // Calculate escrow expiry date
  static calculateEscrowExpiry(createdAt: Date, maxDurationDays: number): Date {
    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + maxDurationDays);
    return expiryDate;
  }

  // Calculate standard deal cooling-off end
  static calculateCoolingOffEnd(acknowledgedAt: Date, coolingOffMinutes: number = 30): Date {
    const endDate = new Date(acknowledgedAt);
    endDate.setMinutes(endDate.getMinutes() + coolingOffMinutes);
    return endDate;
  }
}