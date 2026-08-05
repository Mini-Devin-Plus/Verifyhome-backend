import { EscrowDeal, StandardDeal, DealStateTransition } from '../types/database';
import { DealStateMachine } from './DealStateMachine';

export interface ExpiryCheckResult {
  dealId: string;
  wasExpired: boolean;
  newState?: string;
  sellerDefaulted?: boolean;
  refundEligible?: boolean;
  transitionId?: string;
}

export interface RefundEligibility {
  isEligible: boolean;
  reason: string;
  amount?: number;
  recipient?: 'buyer' | 'seller';
}

export class SystemAutomationService {

  // Check and handle expired deals (system-only)
  static async processExpiredDeals(): Promise<ExpiryCheckResult[]> {
    const results: ExpiryCheckResult[] = [];
    
    try {
      // Get all active deals (mock - would fetch from database)
      const activeDeals = await this.getActiveDeals();
      
      for (const deal of activeDeals) {
        const result = await this.checkDealExpiry(deal);
        if (result.wasExpired) {
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      console.error('[SYSTEM] Expiry processing failed:', error);
      return [];
    }
  }

  // Check individual deal expiry
  static async checkDealExpiry(deal: EscrowDeal | StandardDeal): Promise<ExpiryCheckResult> {
    const now = new Date();
    let isExpired = false;
    let targetState: string | undefined;
    let sellerDefaulted = false;

    if (deal.type === 'escrow') {
      const escrowDeal = deal as EscrowDeal;
      
      // Check 7-day expiry from BUYER_CONFIRMED
      if (escrowDeal.state === 'BUYER_CONFIRMED' && escrowDeal.buyerConfirmedAt) {
        const expiryTime = new Date(escrowDeal.buyerConfirmedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (now > expiryTime) {
          isExpired = true;
          targetState = 'SELLER_DEFAULTED';
          sellerDefaulted = true;
        }
      }
    } else {
      const standardDeal = deal as StandardDeal;
      
      // Check 24-hour expiry from PENDING_CONFIRMATION
      if (standardDeal.state === 'PENDING_CONFIRMATION') {
        const expiryTime = new Date(standardDeal.createdAt.getTime() + 24 * 60 * 60 * 1000);
        if (now > expiryTime) {
          isExpired = true;
          targetState = 'EXPIRED';
        }
      }
    }

    const result: ExpiryCheckResult = {
      dealId: deal.id,
      wasExpired: isExpired,
      sellerDefaulted
    };

    // Process expiry if needed
    if (isExpired && targetState) {
      const transitionResult = await this.executeSystemTransition(
        deal, 
        targetState, 
        'system_expiry',
        { 
          expiredAt: now,
          sellerDefaulted,
          originalState: deal.state
        }
      );
      
      if (transitionResult.success) {
        result.newState = targetState;
        result.transitionId = transitionResult.transitionId;
        result.refundEligible = this.determineRefundEligibility(deal, targetState).isEligible;
      }
    }

    return result;
  }

  // Tag seller as defaulted (NO penalty enforcement yet)
  static async tagSellerDefault(dealId: string, reason: string): Promise<{
    success: boolean;
    defaultTagged?: boolean;
    error?: string;
  }> {
    try {
      const deal = await this.getDeal(dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      // Tag seller default in deal metadata
      const defaultTag = {
        sellerDefaulted: true,
        defaultReason: reason,
        defaultedAt: new Date(),
        // NOTE: No penalty enforcement yet - just tracking
        penaltyTracked: true,
        penaltyEnforced: false
      };

      // Update deal with default tag (mock - would update database)
      await this.updateDealMetadata(dealId, { defaultTag });

      console.log(`[SYSTEM] Seller defaulted tagged for deal ${dealId}: ${reason}`);
      
      return { success: true, defaultTagged: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Default tagging failed' 
      };
    }
  }

  // Determine refund eligibility (NO execution)
  static determineRefundEligibility(deal: EscrowDeal | StandardDeal, currentState: string): RefundEligibility {
    if (deal.type === 'escrow') {
      const escrowDeal = deal as EscrowDeal;
      
      switch (currentState) {
        case 'SELLER_DEFAULTED':
          return {
            isEligible: true,
            reason: 'Seller failed to deliver within 7 days',
            amount: escrowDeal.amount,
            recipient: 'buyer'
          };
          
        case 'ADMIN_REJECTED':
          return {
            isEligible: true,
            reason: 'Deal rejected by admin',
            amount: escrowDeal.amount,
            recipient: 'buyer'
          };
          
        case 'DISPUTED':
          return {
            isEligible: true,
            reason: 'Deal under dispute - pending resolution',
            amount: escrowDeal.amount,
            recipient: 'buyer' // Default to buyer, admin can override
          };
          
        default:
          return {
            isEligible: false,
            reason: 'Deal not in refundable state'
          };
      }
    } else {
      const standardDeal = deal as StandardDeal;
      
      switch (currentState) {
        case 'EXPIRED':
          return {
            isEligible: false,
            reason: 'Standard deals do not involve escrow funds'
          };
          
        case 'ADMIN_REJECTED':
          return {
            isEligible: false,
            reason: 'No funds held for standard deals'
          };
          
        default:
          return {
            isEligible: false,
            reason: 'Standard deals do not hold funds'
          };
      }
    }
  }

  // Execute system-only state transition
  private static async executeSystemTransition(
    deal: EscrowDeal | StandardDeal,
    targetState: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<{ success: boolean; transitionId?: string; error?: string }> {
    try {
      // Validate transition
      const canTransition = DealStateMachine.canTransition(deal.type, deal.state, targetState);
      if (!canTransition) {
        return { success: false, error: 'Invalid system transition' };
      }

      // Create system transition
      const transition: DealStateTransition = {
        id: `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: deal.id,
        fromState: deal.state,
        toState: targetState,
        triggeredBy: 'system',
        userRole: 'system',
        transitionedAt: new Date(),
        metadata: {
          action,
          automated: true,
          ...metadata
        }
      };

      // Update deal state (mock - would update database)
      await this.updateDealState(deal.id, targetState, transition);

      console.log(`[SYSTEM] Automated transition: ${deal.id} ${deal.state} -> ${targetState}`);

      return { success: true, transitionId: transition.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'System transition failed' 
      };
    }
  }

  // Mock methods (would integrate with database)
  private static async getActiveDeals(): Promise<(EscrowDeal | StandardDeal)[]> {
    // Mock implementation - would fetch active deals from database
    throw new Error('Database integration required');
  }

  private static async getDeal(dealId: string): Promise<EscrowDeal | StandardDeal | null> {
    // Mock implementation - would fetch from database
    throw new Error('Database integration required');
  }

  private static async updateDealState(
    dealId: string, 
    newState: string, 
    transition: DealStateTransition
  ): Promise<void> {
    // Mock implementation - would update database
    console.log(`[SYSTEM] Deal ${dealId} updated to ${newState}`);
  }

  private static async updateDealMetadata(dealId: string, metadata: Record<string, any>): Promise<void> {
    // Mock implementation - would update database
    console.log(`[SYSTEM] Deal ${dealId} metadata updated:`, metadata);
  }
}