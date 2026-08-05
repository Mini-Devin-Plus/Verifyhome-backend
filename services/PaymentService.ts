import { PaymentIntent } from '../types/database';
import { CommissionService } from './CommissionService';

// Mock payment intents storage
const mockPaymentIntents: PaymentIntent[] = [];

// LISTING FEE PRICING (centralized)
const LISTING_FEE_AMOUNT = 2999; // NGN

export class PaymentService {
  
  // Create payment intent (INTENT ONLY - NO MONEY HANDLING)
  static async createPaymentIntent(
    payerUserId: string,
    purpose: PaymentIntent['purpose'],
    purposeRefId: string,
    amount: number,
    payeeUserId?: string
  ): Promise<PaymentIntent> {
    // OPTIONAL: Calculate commission snapshot for informational purposes
    let commissionSnapshot;
    try {
      if (purpose === 'subscription') {
        commissionSnapshot = CommissionService.calculateSubscriptionCommission(amount);
      } else if (purpose === 'listing_fee') {
        commissionSnapshot = CommissionService.calculateListingCommission(amount);
      } else if (purpose === 'escrow_deposit') {
        commissionSnapshot = CommissionService.calculateEscrowCommission(amount);
      } else if (purpose === 'standard_deal') {
        commissionSnapshot = CommissionService.calculateStandardDealCommission(amount);
      }
    } catch (error) {
      // Commission calculation is optional - don't fail payment intent creation
      console.warn('Commission calculation failed:', error);
    }

    const paymentIntent: PaymentIntent = {
      id: `pi_${Date.now()}`,
      payerUserId,
      payeeUserId,
      purpose,
      purposeRefId,
      amount,
      currency: 'NGN',
      provider: 'mock',
      status: 'initiated',
      initiatedBy: payerUserId === 'system' ? 'system' : 'user', // Audit clarity
      commissionSnapshot, // Optional informational data
      createdAt: new Date()
    };

    mockPaymentIntents.push(paymentIntent);
    return Promise.resolve(paymentIntent);
  }

  // Mock payment success (NO MONEY MOVEMENT)
  static async markAsSuccess(paymentIntentId: string): Promise<PaymentIntent> {
    const intent = mockPaymentIntents.find(pi => pi.id === paymentIntentId);
    if (!intent) {
      throw new Error('Payment intent not found');
    }
    
    intent.status = 'success';
    return Promise.resolve(intent);
  }

  // Mock payment failure (NO MONEY MOVEMENT)
  static async markAsFailed(paymentIntentId: string): Promise<PaymentIntent> {
    const intent = mockPaymentIntents.find(pi => pi.id === paymentIntentId);
    if (!intent) {
      throw new Error('Payment intent not found');
    }
    
    intent.status = 'failed';
    return Promise.resolve(intent);
  }

  // Get payment intent by ID
  static async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
    const intent = mockPaymentIntents.find(pi => pi.id === paymentIntentId);
    return Promise.resolve(intent || null);
  }

  // Get listing fee amount (centralized pricing)
  static getListingFeeAmount(): number {
    return LISTING_FEE_AMOUNT;
  }

  // Check if user has paid listing fee for property
  static async hasValidListingFeePayment(userId: string, propertyId: string): Promise<boolean> {
    const intent = mockPaymentIntents.find(pi => 
      pi.payerUserId === userId &&
      pi.purpose === 'listing_fee' &&
      pi.purposeRefId === propertyId &&
      pi.status === 'success'
    );
    return Promise.resolve(!!intent);
  }
}