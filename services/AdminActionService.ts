import { EscrowDeal, StandardDeal, DealStateTransition, OTPCheckpoint } from '../types/database';
import { DealStateMachine } from './DealStateMachine';
import { OTPService } from './OTPService';

export interface AdminActionRequest {
  dealId: string;
  action: 'approve' | 'reject' | 'escalate';
  adminUserId: string;
  adminPhoneNumber: string;
  otpSessionId: string;
  otp: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface AdminActionResult {
  success: boolean;
  newState?: string;
  error?: string;
  requiresOTP?: boolean;
  transitionId?: string;
}

export class AdminActionService {
  
  // Admin approve deal (with OTP verification)
  static async approveDeal(request: AdminActionRequest): Promise<AdminActionResult> {
    try {
      // Verify admin OTP first
      const otpResult = await OTPService.verifyOTP(request.otpSessionId, request.otp);
      if (!otpResult.success || otpResult.phoneNumber !== request.adminPhoneNumber) {
        return { success: false, error: 'Invalid OTP verification', requiresOTP: true };
      }

      // Get deal (mock - would fetch from database)
      const deal = await this.getDeal(request.dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      // Determine target state based on deal type and current state
      let targetState: string;
      if (deal.type === 'escrow') {
        const escrowDeal = deal as EscrowDeal;
        if (escrowDeal.state === 'PENDING_ADMIN_APPROVAL') {
          targetState = 'APPROVED';
        } else {
          return { success: false, error: 'Deal not in approvable state' };
        }
      } else {
        const standardDeal = deal as StandardDeal;
        if (standardDeal.state === 'PENDING_ADMIN_APPROVAL') {
          targetState = 'APPROVED';
        } else {
          return { success: false, error: 'Deal not in approvable state' };
        }
      }

      // Validate state transition
      const canTransition = DealStateMachine.canTransition(deal.type, deal.state, targetState);
      if (!canTransition) {
        return { success: false, error: 'Invalid state transition' };
      }

      // Create transition record
      const transition: DealStateTransition = {
        id: `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        fromState: deal.state,
        toState: targetState,
        triggeredBy: request.adminUserId,
        userRole: 'admin',
        transitionedAt: new Date(),
        metadata: {
          action: 'admin_approve',
          reason: request.reason,
          ...request.metadata
        }
      };

      // Create OTP checkpoint
      const checkpoint: OTPCheckpoint = {
        id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        action: 'admin_approve',
        userId: request.adminUserId,
        userRole: 'admin',
        phoneNumber: request.adminPhoneNumber,
        verifiedAt: new Date(),
        metadata: { reason: request.reason }
      };

      // Update deal state (mock - would update database)
      await this.updateDealState(request.dealId, targetState, transition, checkpoint);

      return { 
        success: true, 
        newState: targetState,
        transitionId: transition.id
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Admin approval failed' 
      };
    }
  }

  // Admin reject deal (with OTP verification)
  static async rejectDeal(request: AdminActionRequest): Promise<AdminActionResult> {
    try {
      // Verify admin OTP first
      const otpResult = await OTPService.verifyOTP(request.otpSessionId, request.otp);
      if (!otpResult.success || otpResult.phoneNumber !== request.adminPhoneNumber) {
        return { success: false, error: 'Invalid OTP verification', requiresOTP: true };
      }

      const deal = await this.getDeal(request.dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      // Determine target state
      let targetState: string;
      if (deal.type === 'escrow') {
        targetState = 'ADMIN_REJECTED';
      } else {
        targetState = 'ADMIN_REJECTED';
      }

      // Validate transition
      const canTransition = DealStateMachine.canTransition(deal.type, deal.state, targetState);
      if (!canTransition) {
        return { success: false, error: 'Invalid state transition' };
      }

      // Create transition and checkpoint
      const transition: DealStateTransition = {
        id: `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        fromState: deal.state,
        toState: targetState,
        triggeredBy: request.adminUserId,
        userRole: 'admin',
        transitionedAt: new Date(),
        metadata: {
          action: 'admin_reject',
          reason: request.reason,
          ...request.metadata
        }
      };

      const checkpoint: OTPCheckpoint = {
        id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        action: 'admin_reject',
        userId: request.adminUserId,
        userRole: 'admin',
        phoneNumber: request.adminPhoneNumber,
        verifiedAt: new Date(),
        metadata: { reason: request.reason }
      };

      await this.updateDealState(request.dealId, targetState, transition, checkpoint);

      return { 
        success: true, 
        newState: targetState,
        transitionId: transition.id
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Admin rejection failed' 
      };
    }
  }

  // Admin escalate deal (with OTP verification)
  static async escalateDeal(request: AdminActionRequest): Promise<AdminActionResult> {
    try {
      // Verify admin OTP first
      const otpResult = await OTPService.verifyOTP(request.otpSessionId, request.otp);
      if (!otpResult.success || otpResult.phoneNumber !== request.adminPhoneNumber) {
        return { success: false, error: 'Invalid OTP verification', requiresOTP: true };
      }

      const deal = await this.getDeal(request.dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      // Escalate to disputed state
      const targetState = 'DISPUTED';

      // Validate transition
      const canTransition = DealStateMachine.canTransition(deal.type, deal.state, targetState);
      if (!canTransition) {
        return { success: false, error: 'Cannot escalate from current state' };
      }

      // Create transition and checkpoint
      const transition: DealStateTransition = {
        id: `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        fromState: deal.state,
        toState: targetState,
        triggeredBy: request.adminUserId,
        userRole: 'admin',
        transitionedAt: new Date(),
        metadata: {
          action: 'admin_escalate',
          reason: request.reason,
          ...request.metadata
        }
      };

      const checkpoint: OTPCheckpoint = {
        id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        action: 'admin_escalate',
        userId: request.adminUserId,
        userRole: 'admin',
        phoneNumber: request.adminPhoneNumber,
        verifiedAt: new Date(),
        metadata: { reason: request.reason }
      };

      await this.updateDealState(request.dealId, targetState, transition, checkpoint);

      return { 
        success: true, 
        newState: targetState,
        transitionId: transition.id
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Admin escalation failed' 
      };
    }
  }

  // Check if admin action requires OTP
  static requiresOTPForAction(action: string): boolean {
    return ['approve', 'reject', 'escalate'].includes(action);
  }

  // Mock methods (would integrate with database)
  private static async getDeal(dealId: string): Promise<EscrowDeal | StandardDeal | null> {
    // Mock implementation - would fetch from database
    throw new Error('Database integration required');
  }

  private static async updateDealState(
    dealId: string, 
    newState: string, 
    transition: DealStateTransition,
    checkpoint: OTPCheckpoint
  ): Promise<void> {
    // Mock implementation - would update database
    console.log(`[ADMIN ACTION] Deal ${dealId} transitioned to ${newState}`);
  }
}