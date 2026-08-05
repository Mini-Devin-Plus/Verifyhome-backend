import { EscrowDeal, StandardDeal, DealStateTransition, OTPCheckpoint, User } from '../types/database';

export interface DealTimeline {
  transitions: DealStateTransition[];
  otpCheckpoints: OTPCheckpoint[];
  currentState: string;
  createdAt: Date;
  expiryCountdown?: {
    expiresAt: Date;
    hoursRemaining: number;
    isExpired: boolean;
  };
}

export interface DealParticipants {
  buyer: User;
  seller: User;
  agent?: User;
  roles: {
    [userId: string]: 'buyer' | 'seller' | 'agent' | 'admin';
  };
}

export interface DealVisibility {
  deal: EscrowDeal | StandardDeal;
  timeline: DealTimeline;
  participants: DealParticipants;
  disputeInfo?: {
    hasDispute: boolean;
    reason?: string;
    flaggedAt?: Date;
  };
}

export class DealViewService {
  // Get complete deal visibility data
  static async getDealVisibility(dealId: string): Promise<DealVisibility | null> {
    // Implementation would fetch from database
    // This is read-only - no state changes allowed
    throw new Error('Database integration required');
  }

  // Get deal timeline with all transitions and checkpoints
  static async getDealTimeline(dealId: string): Promise<DealTimeline | null> {
    // Implementation would fetch transitions and checkpoints
    throw new Error('Database integration required');
  }

  // Calculate expiry countdown (computed, not enforced)
  static calculateExpiryCountdown(deal: EscrowDeal | StandardDeal): DealTimeline['expiryCountdown'] {
    const now = new Date();
    
    // Escrow deals: 7 days from BUYER_CONFIRMED
    if (deal.type === 'escrow') {
      const escrowDeal = deal as EscrowDeal;
      if (escrowDeal.state === 'BUYER_CONFIRMED' && escrowDeal.buyerConfirmedAt) {
        const expiresAt = new Date(escrowDeal.buyerConfirmedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
        return {
          expiresAt,
          hoursRemaining,
          isExpired: hoursRemaining === 0
        };
      }
    }

    // Standard deals: 24 hours from PENDING_CONFIRMATION
    if (deal.type === 'standard') {
      const standardDeal = deal as StandardDeal;
      if (standardDeal.state === 'PENDING_CONFIRMATION' && standardDeal.createdAt) {
        const expiresAt = new Date(standardDeal.createdAt.getTime() + 24 * 60 * 60 * 1000);
        const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
        return {
          expiresAt,
          hoursRemaining,
          isExpired: hoursRemaining === 0
        };
      }
    }

    return undefined;
  }

  // Get OTP checkpoint summary (who approved what)
  static getOTPCheckpointSummary(checkpoints: OTPCheckpoint[]): {
    [action: string]: {
      userId: string;
      userRole: string;
      verifiedAt: Date;
      phoneNumber: string;
    };
  } {
    const summary: any = {};
    
    checkpoints.forEach(checkpoint => {
      summary[checkpoint.action] = {
        userId: checkpoint.userId,
        userRole: checkpoint.userRole,
        verifiedAt: checkpoint.verifiedAt,
        phoneNumber: checkpoint.phoneNumber
      };
    });

    return summary;
  }

  // Check dispute flags (read-only)
  static getDisputeInfo(deal: EscrowDeal | StandardDeal): DealVisibility['disputeInfo'] {
    if (deal.type === 'escrow') {
      const escrowDeal = deal as EscrowDeal;
      return {
        hasDispute: escrowDeal.state === 'DISPUTED',
        reason: escrowDeal.disputeReason,
        flaggedAt: escrowDeal.disputedAt
      };
    }

    if (deal.type === 'standard') {
      const standardDeal = deal as StandardDeal;
      return {
        hasDispute: standardDeal.state === 'DISPUTED',
        reason: standardDeal.disputeReason,
        flaggedAt: standardDeal.disputedAt
      };
    }

    return { hasDispute: false };
  }

  // Get all deals for admin view (read-only)
  static async getAdminDealsList(filters?: {
    state?: string;
    type?: 'escrow' | 'standard';
    hasDispute?: boolean;
  }): Promise<DealVisibility[]> {
    // Implementation would fetch filtered deals
    throw new Error('Database integration required');
  }
}