export type BuyerAction = 
  | 'acknowledge_deal'
  | 'confirm_documents_received'
  | 'confirm_inspection'
  | 'confirm_purchase'
  | 'request_refund'
  | 'raise_dispute';

export type SellerAction = 
  | 'acknowledge_deal'
  | 'submit_documents'
  | 'schedule_inspection'
  | 'acknowledge_payment_intent'
  | 'confirm_delivery'
  | 'respond_to_dispute';

export type DealType = 'escrow' | 'standard';
export type ActorRole = 'buyer' | 'seller';

export interface ActionPermission {
  action: BuyerAction | SellerAction;
  role: ActorRole;
  dealType: DealType;
  allowedStates: string[];
  requiresOTP: boolean;
  description: string;
}

export class ActionPermissionMatrix {
  private static permissions: ActionPermission[] = [
    // BUYER ACTIONS - ESCROW DEALS
    {
      action: 'acknowledge_deal',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['INITIATED'],
      requiresOTP: false,
      description: 'Buyer acknowledges escrow deal terms'
    },
    {
      action: 'confirm_documents_received',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['DOCUMENTS_SUBMITTED'],
      requiresOTP: false,
      description: 'Buyer confirms receipt of seller documents'
    },
    {
      action: 'confirm_inspection',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['INSPECTION_SCHEDULED'],
      requiresOTP: false,
      description: 'Buyer confirms property inspection completed'
    },
    {
      action: 'confirm_purchase',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['BUYER_CONFIRMED'],
      requiresOTP: true,
      description: 'Buyer confirms purchase completion (OTP required)'
    },
    {
      action: 'request_refund',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['SELLER_DEFAULTED', 'ADMIN_REJECTED'],
      requiresOTP: true,
      description: 'Buyer requests refund (OTP required)'
    },
    {
      action: 'raise_dispute',
      role: 'buyer',
      dealType: 'escrow',
      allowedStates: ['DOCUMENTS_SUBMITTED', 'INSPECTION_COMPLETED', 'BUYER_CONFIRMED'],
      requiresOTP: true,
      description: 'Buyer raises dispute (OTP required)'
    },

    // BUYER ACTIONS - STANDARD DEALS
    {
      action: 'acknowledge_deal',
      role: 'buyer',
      dealType: 'standard',
      allowedStates: ['PENDING_CONFIRMATION'],
      requiresOTP: true,
      description: 'Buyer acknowledges standard deal terms (OTP required)'
    },
    {
      action: 'confirm_purchase',
      role: 'buyer',
      dealType: 'standard',
      allowedStates: ['CONFIRMED'],
      requiresOTP: true,
      description: 'Buyer confirms purchase completion (OTP required)'
    },
    {
      action: 'raise_dispute',
      role: 'buyer',
      dealType: 'standard',
      allowedStates: ['CONFIRMED', 'COMPLETED'],
      requiresOTP: true,
      description: 'Buyer raises dispute (OTP required)'
    },

    // SELLER ACTIONS - ESCROW DEALS
    {
      action: 'acknowledge_deal',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['BUYER_FUNDED'],
      requiresOTP: false,
      description: 'Seller acknowledges escrow deal'
    },
    {
      action: 'submit_documents',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['SELLER_ACKNOWLEDGED'],
      requiresOTP: false,
      description: 'Seller submits required documents'
    },
    {
      action: 'schedule_inspection',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['DOCUMENTS_APPROVED'],
      requiresOTP: false,
      description: 'Seller schedules property inspection'
    },
    {
      action: 'acknowledge_payment_intent',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['APPROVED'],
      requiresOTP: false,
      description: 'Seller acknowledges payment release intent'
    },
    {
      action: 'confirm_delivery',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['BUYER_CONFIRMED'],
      requiresOTP: true,
      description: 'Seller confirms delivery completion (OTP required)'
    },
    {
      action: 'respond_to_dispute',
      role: 'seller',
      dealType: 'escrow',
      allowedStates: ['DISPUTED'],
      requiresOTP: false,
      description: 'Seller responds to buyer dispute'
    },

    // SELLER ACTIONS - STANDARD DEALS
    {
      action: 'acknowledge_deal',
      role: 'seller',
      dealType: 'standard',
      allowedStates: ['PENDING_CONFIRMATION'],
      requiresOTP: false,
      description: 'Seller acknowledges standard deal'
    },
    {
      action: 'acknowledge_payment_intent',
      role: 'seller',
      dealType: 'standard',
      allowedStates: ['CONFIRMED'],
      requiresOTP: false,
      description: 'Seller acknowledges payment intent'
    },
    {
      action: 'confirm_delivery',
      role: 'seller',
      dealType: 'standard',
      allowedStates: ['PAYMENT_RECEIVED'],
      requiresOTP: true,
      description: 'Seller confirms delivery completion (OTP required)'
    },
    {
      action: 'respond_to_dispute',
      role: 'seller',
      dealType: 'standard',
      allowedStates: ['DISPUTED'],
      requiresOTP: false,
      description: 'Seller responds to buyer dispute'
    }
  ];

  // Check if action is allowed for role, deal type, and current state
  static isActionAllowed(
    action: BuyerAction | SellerAction,
    role: ActorRole,
    dealType: DealType,
    currentState: string
  ): boolean {
    const permission = this.permissions.find(p => 
      p.action === action && 
      p.role === role && 
      p.dealType === dealType
    );

    if (!permission) {
      return false;
    }

    return permission.allowedStates.includes(currentState);
  }

  // Check if action requires OTP
  static requiresOTP(
    action: BuyerAction | SellerAction,
    role: ActorRole,
    dealType: DealType
  ): boolean {
    const permission = this.permissions.find(p => 
      p.action === action && 
      p.role === role && 
      p.dealType === dealType
    );

    return permission?.requiresOTP || false;
  }

  // Get all allowed actions for role and deal type in current state
  static getAllowedActions(
    role: ActorRole,
    dealType: DealType,
    currentState: string
  ): ActionPermission[] {
    return this.permissions.filter(p => 
      p.role === role && 
      p.dealType === dealType && 
      p.allowedStates.includes(currentState)
    );
  }

  // Get permission details for specific action
  static getPermission(
    action: BuyerAction | SellerAction,
    role: ActorRole,
    dealType: DealType
  ): ActionPermission | null {
    return this.permissions.find(p => 
      p.action === action && 
      p.role === role && 
      p.dealType === dealType
    ) || null;
  }

  // Validate role can perform action (regardless of state)
  static isValidRoleAction(
    action: BuyerAction | SellerAction,
    role: ActorRole,
    dealType: DealType
  ): boolean {
    return this.permissions.some(p => 
      p.action === action && 
      p.role === role && 
      p.dealType === dealType
    );
  }
}