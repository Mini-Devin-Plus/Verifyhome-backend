import { CommissionRule, CommissionBreakdown } from '../types/database';

// COMMISSION GOVERNANCE SAFETY:
// - Commission is calculated, not collected by this app
// - Funds are handled externally (Flutterwave escrow)
// - Commission deduction occurs outside the app
// - App acts as orchestrator, not custodian

// Mock commission rules (configuration only)
const COMMISSION_RULES: CommissionRule[] = [
  {
    id: 'escrow_commission_2024',
    appliesTo: 'escrow',
    payer: 'both', // Split between buyer and seller
    rateType: 'percentage',
    value: 3.0, // 3% total (1.5% buyer + 1.5% seller)
    isActive: true,
    effectiveFrom: new Date('2024-01-01'),
    description: 'Standard escrow transaction commission'
  },
  {
    id: 'listing_commission_2024',
    appliesTo: 'listing',
    payer: 'seller',
    rateType: 'flat',
    value: 0, // No listing commission for MVP
    isActive: false, // Disabled for MVP
    effectiveFrom: new Date('2024-01-01'),
    description: 'Listing commission is disabled for MVP; only flat listing fees or subscriptions apply'
  },
  {
    id: 'subscription_commission_2024',
    appliesTo: 'subscription',
    payer: 'buyer',
    rateType: 'flat',
    value: 0, // No subscription commission
    isActive: false, // Disabled - subscriptions generate platform revenue
    effectiveFrom: new Date('2024-01-01'),
    description: 'Subscriptions generate platform revenue and do not incur commission'
  }
];

export class CommissionService {
  
  // PURE CALCULATION - NO MONEY HANDLING
  // Calculate subscription commission (read-only)
  // Subscriptions generate platform revenue and do not incur commission
  static calculateSubscriptionCommission(amount: number): CommissionBreakdown {
    // POLICY LOCK: Subscription commission is always 0
    return {
      grossAmount: amount,
      platformCommission: 0, // No commission on subscriptions
      sellerReceives: amount, // Subscription doesn't affect seller
      buyerPays: amount, // No additional commission
      commissionRuleId: 'subscription_commission_2024',
      calculatedAt: new Date()
    };
  }

  // PURE CALCULATION - NO MONEY HANDLING
  // Calculate listing commission (read-only)
  // Listing commission is disabled for MVP; only flat listing fees or subscriptions apply
  static calculateListingCommission(amount: number): CommissionBreakdown {
    // POLICY LOCK: Listing commission is always 0 for MVP
    return {
      grossAmount: amount,
      platformCommission: 0, // No commission on listings
      sellerReceives: amount, // Seller receives full amount
      buyerPays: amount, // Buyer pays property price only
      commissionRuleId: 'listing_commission_2024',
      calculatedAt: new Date()
    };
  }

  // PURE CALCULATION - NO MONEY HANDLING
  // Calculate escrow commission (read-only)
  // Escrow commission is informational. Funds are handled externally via Flutterwave
  static calculateEscrowCommission(amount: number): CommissionBreakdown {
    // POLICY LOCK: Escrow commission = 3% total (1.5% buyer + 1.5% seller)
    // Escrow fees: Buyer pays 0.75% escrow fee, seller's escrow fee included in platform fee
    const buyerCommissionRate = 1.5; // 1.5%
    const sellerCommissionRate = 1.5; // 1.5%
    const buyerEscrowFeeRate = 0.75; // 0.75% escrow fee
    
    const buyerCommission = Math.round(amount * (buyerCommissionRate / 100));
    const sellerCommission = Math.round(amount * (sellerCommissionRate / 100));
    const buyerEscrowFee = Math.round(amount * (buyerEscrowFeeRate / 100));
    const totalBuyerFees = buyerCommission + buyerEscrowFee; // 2.25% total
    const totalCommission = buyerCommission + sellerCommission;
    
    return {
      grossAmount: amount,
      platformCommission: totalCommission, // 3% commission total
      sellerReceives: amount - sellerCommission, // Amount minus 1.5%
      buyerPays: amount + totalBuyerFees, // Amount plus 2.25% (commission + escrow fee)
      commissionRuleId: 'escrow_commission_2024',
      calculatedAt: new Date()
    };
  }

  // PURE CALCULATION - NO MONEY HANDLING
  // Calculate standard deal commission (read-only)
  static calculateStandardDealCommission(amount: number): CommissionBreakdown {
    // Standard Deal: Same commission as escrow, no escrow fee
    const buyerCommissionRate = 1.5; // 1.5%
    const sellerCommissionRate = 1.5; // 1.5%
    
    const buyerCommission = Math.round(amount * (buyerCommissionRate / 100));
    const sellerCommission = Math.round(amount * (sellerCommissionRate / 100));
    const totalCommission = buyerCommission + sellerCommission;
    
    return {
      grossAmount: amount,
      platformCommission: totalCommission, // 3% commission total
      sellerReceives: amount - sellerCommission, // Amount minus 1.5%
      buyerPays: amount + buyerCommission, // Amount plus 1.5% (commission only)
      commissionRuleId: 'standard_deal_commission_2024',
      calculatedAt: new Date()
    };
  }

  // Get active commission rules (read-only)
  static getActiveCommissionRules(): CommissionRule[] {
    return COMMISSION_RULES.filter(rule => rule.isActive);
  }

  // Get commission rule by type (read-only)
  static getCommissionRule(appliesTo: CommissionRule['appliesTo']): CommissionRule | null {
    return COMMISSION_RULES.find(r => r.appliesTo === appliesTo && r.isActive) || null;
  }

  // Format commission for display (read-only)
  static formatCommissionDisplay(breakdown: CommissionBreakdown): string {
    if (breakdown.platformCommission === 0) {
      return 'No platform fee applies';
    }
    return `Platform fee: ₦${breakdown.platformCommission.toLocaleString()} (informational estimate)`;
  }
}