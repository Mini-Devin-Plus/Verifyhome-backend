import { EscrowDeal, StandardDeal, ActionAttemptLog, DealStateTransition, OTPCheckpoint } from '../types/database';
import { ActionPermissionMatrix, BuyerAction, SellerAction, ActorRole, DealType } from './ActionPermissionMatrix';
import { DealStateMachine } from './DealStateMachine';
import { OTPService } from './OTPService';

export interface ActionRequest {
  dealId: string;
  action: BuyerAction | SellerAction;
  actorUserId: string;
  actorRole: ActorRole;
  otpSessionId?: string;
  otp?: string;
  metadata?: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  newState?: string;
  error?: string;
  requiresOTP?: boolean;
  transitionId?: string;
  logId: string;
}

export class BuyerSellerActionService {
  
  // Execute buyer or seller action with full validation
  static async executeAction(request: ActionRequest): Promise<ActionResult> {
    const logId = await this.logActionAttempt(request, false, 'Validation pending');
    
    try {
      // Get deal
      const deal = await this.getDeal(request.dealId);
      if (!deal) {
        await this.updateActionLog(logId, false, 'Deal not found');
        return { success: false, error: 'Deal not found', logId };
      }

      // Check if deal is expired
      if (this.isDealExpired(deal)) {
        await this.updateActionLog(logId, false, 'Deal expired');
        return { success: false, error: 'Cannot perform actions on expired deal', logId };
      }

      // Validate role-action combination
      if (!ActionPermissionMatrix.isValidRoleAction(request.action, request.actorRole, deal.type)) {
        await this.updateActionLog(logId, false, 'Invalid role-action combination');
        return { 
          success: false, 
          error: `${request.actorRole} cannot perform ${request.action}`, 
          logId 
        };
      }

      // Check if action is allowed in current state
      if (!ActionPermissionMatrix.isActionAllowed(request.action, request.actorRole, deal.type, deal.state)) {
        await this.updateActionLog(logId, false, `Action not allowed in state ${deal.state}`);
        return { 
          success: false, 
          error: `Action ${request.action} not allowed in state ${deal.state}`, 
          logId 
        };
      }

      // Check OTP requirement
      const requiresOTP = ActionPermissionMatrix.requiresOTP(request.action, request.actorRole, deal.type);
      if (requiresOTP) {
        if (!request.otpSessionId || !request.otp) {
          await this.updateActionLog(logId, false, 'OTP required but not provided');
          return { 
            success: false, 
            error: 'OTP verification required for this action', 
            requiresOTP: true,
            logId 
          };
        }

        // Verify OTP
        const otpResult = await OTPService.verifyOTP(request.otpSessionId, request.otp);
        if (!otpResult.success) {
          await this.updateActionLog(logId, false, 'OTP verification failed');
          return { 
            success: false, 
            error: 'Invalid OTP verification', 
            requiresOTP: true,
            logId 
          };
        }
      }

      // Determine target state based on action
      const targetState = this.getTargetState(deal, request.action, request.actorRole);
      if (!targetState) {
        await this.updateActionLog(logId, false, 'No target state defined for action');
        return { 
          success: false, 
          error: 'Action does not result in state change', 
          logId 
        };
      }

      // Validate state transition
      const canTransition = DealStateMachine.canTransition(deal.type, deal.state, targetState);
      if (!canTransition) {
        await this.updateActionLog(logId, false, 'Invalid state transition');
        return { 
          success: false, 
          error: 'Invalid state transition', 
          logId 
        };
      }

      // Execute action
      const result = await this.performAction(deal, request, targetState, requiresOTP);
      
      if (result.success) {
        await this.updateActionLog(logId, true, 'Action completed successfully');
        return { 
          success: true, 
          newState: targetState,
          transitionId: result.transitionId,
          logId 
        };
      } else {
        await this.updateActionLog(logId, false, result.error || 'Action execution failed');
        return { 
          success: false, 
          error: result.error, 
          logId 
        };
      }

    } catch (error) {
      await this.updateActionLog(logId, false, error instanceof Error ? error.message : 'Unknown error');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Action failed', 
        logId 
      };
    }
  }

  // Check if deal is expired
  private static isDealExpired(deal: EscrowDeal | StandardDeal): boolean {
    const now = new Date();
    
    if (deal.type === 'escrow') {
      const escrowDeal = deal as EscrowDeal;
      // Check 7-day expiry from BUYER_CONFIRMED
      if (escrowDeal.state === 'BUYER_CONFIRMED' && escrowDeal.buyerConfirmedAt) {
        const expiryTime = new Date(escrowDeal.buyerConfirmedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        return now > expiryTime;
      }
    } else {
      const standardDeal = deal as StandardDeal;
      // Check 24-hour expiry from PENDING_CONFIRMATION
      if (standardDeal.state === 'PENDING_CONFIRMATION') {
        const expiryTime = new Date(standardDeal.createdAt.getTime() + 24 * 60 * 60 * 1000);
        return now > expiryTime;
      }
    }
    
    return false;
  }

  // Determine target state based on action
  private static getTargetState(
    deal: EscrowDeal | StandardDeal, 
    action: BuyerAction | SellerAction, 
    role: ActorRole
  ): string | null {
    if (deal.type === 'escrow') {
      switch (action) {
        case 'acknowledge_deal':
          return role === 'buyer' ? 'BUYER_ACKNOWLEDGED' : 'SELLER_ACKNOWLEDGED';
        case 'submit_documents':
          return 'DOCUMENTS_SUBMITTED';
        case 'confirm_documents_received':
          return 'DOCUMENTS_APPROVED';
        case 'schedule_inspection':
          return 'INSPECTION_SCHEDULED';
        case 'confirm_inspection':
          return 'INSPECTION_COMPLETED';
        case 'confirm_purchase':
          return 'BUYER_CONFIRMED';
        case 'confirm_delivery':
          return 'PENDING_ADMIN_APPROVAL';
        case 'raise_dispute':
          return 'DISPUTED';
        default:
          return null;
      }
    } else {
      switch (action) {
        case 'acknowledge_deal':
          return role === 'buyer' ? 'CONFIRMED' : 'SELLER_ACKNOWLEDGED';
        case 'confirm_purchase':
          return 'COMPLETED';
        case 'acknowledge_payment_intent':
          return 'PAYMENT_RECEIVED';
        case 'confirm_delivery':
          return 'COMPLETED';
        case 'raise_dispute':
          return 'DISPUTED';
        default:
          return null;
      }
    }
  }

  // Perform the actual action
  private static async performAction(
    deal: EscrowDeal | StandardDeal,
    request: ActionRequest,
    targetState: string,
    requiresOTP: boolean
  ): Promise<{ success: boolean; transitionId?: string; error?: string }> {
    try {
      // Create state transition
      const transition: DealStateTransition = {
        id: `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dealId: request.dealId,
        fromState: deal.state,
        toState: targetState,
        triggeredBy: request.actorUserId,
        userRole: request.actorRole,
        transitionedAt: new Date(),
        metadata: {
          action: request.action,
          ...request.metadata
        }
      };

      // Create OTP checkpoint if required
      let checkpoint: OTPCheckpoint | undefined;
      if (requiresOTP && request.otpSessionId) {
        checkpoint = {
          id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          dealId: request.dealId,
          action: request.action,
          userId: request.actorUserId,
          userRole: request.actorRole,
          phoneNumber: 'mock_phone', // Would get from user context
          verifiedAt: new Date(),
          metadata: request.metadata
        };
      }

      // Update deal state (mock - would update database)
      await this.updateDealState(request.dealId, targetState, transition, checkpoint);

      return { success: true, transitionId: transition.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Action execution failed' 
      };
    }
  }

  // Log action attempt
  private static async logActionAttempt(
    request: ActionRequest,
    success: boolean,
    failureReason?: string
  ): Promise<string> {
    const log: ActionAttemptLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionType: request.action,
      actorRole: request.actorRole,
      actorUserId: request.actorUserId,
      dealId: request.dealId,
      otpSessionId: request.otpSessionId,
      success,
      failureReason,
      timestamp: new Date(),
      metadata: request.metadata
    };

    // Store log (mock - would save to database)
    console.log(`[ACTION LOG] ${request.actorRole} ${request.action} on ${request.dealId}: ${success ? 'SUCCESS' : failureReason}`);
    
    return log.id;
  }

  // Update existing action log
  private static async updateActionLog(
    logId: string,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    // Mock implementation - would update database
    console.log(`[ACTION LOG UPDATE] ${logId}: ${success ? 'SUCCESS' : failureReason}`);
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
    checkpoint?: OTPCheckpoint
  ): Promise<void> {
    // Mock implementation - would update database
    console.log(`[DEAL UPDATE] ${dealId} -> ${newState}`);
  }
}