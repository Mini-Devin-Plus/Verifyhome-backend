import { UserRole } from '../utils/RoleCapabilities';
import { PaymentService } from './PaymentService';

export interface SubscriptionPlan {
  id: string;
  role: UserRole;
  duration: number; // months
  price: number; // in Naira
  name: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'expired' | 'none';
  paymentIntentId?: string; // Link to payment
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
}

// Centralized pricing (STRICT - no hardcoding in screens)
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  // Agent Plans
  { id: 'agent_1m', role: 'Agent', duration: 1, price: 5999, name: 'Agent Monthly' },
  { id: 'agent_3m', role: 'Agent', duration: 3, price: 15999, name: 'Agent 3 Months' },
  { id: 'agent_6m', role: 'Agent', duration: 6, price: 28999, name: 'Agent 6 Months' },
  { id: 'agent_12m', role: 'Agent', duration: 12, price: 51999, name: 'Agent 12 Months' },
  
  // Seller Plans
  { id: 'seller_1m', role: 'Seller', duration: 1, price: 7999, name: 'Seller Monthly' },
  { id: 'seller_3m', role: 'Seller', duration: 3, price: 21999, name: 'Seller 3 Months' },
  { id: 'seller_6m', role: 'Seller', duration: 6, price: 39999, name: 'Seller 6 Months' },
  { id: 'seller_12m', role: 'Seller', duration: 12, price: 71999, name: 'Seller 12 Months' },
  
  // Landlord Plans
  { id: 'landlord_1m', role: 'Landlord', duration: 1, price: 10999, name: 'Landlord Monthly' },
  { id: 'landlord_3m', role: 'Landlord', duration: 3, price: 30999, name: 'Landlord 3 Months' },
  { id: 'landlord_6m', role: 'Landlord', duration: 6, price: 58999, name: 'Landlord 6 Months' },
  { id: 'landlord_12m', role: 'Landlord', duration: 12, price: 109999, name: 'Landlord 12 Months' },
];

// Mock user subscriptions
const mockUserSubscriptions: UserSubscription[] = [
  {
    id: 'sub_1',
    userId: '3', // Mike Agent
    planId: 'agent_12m',
    status: 'active',
    startDate: new Date('2024-01-01'),
    expiryDate: new Date('2025-01-01'),
    createdAt: new Date('2024-01-01')
  }
];

export class SubscriptionService {
  
  // Get subscription plans by role
  static async getPlansByRole(role: UserRole): Promise<SubscriptionPlan[]> {
    const plans = SUBSCRIPTION_PLANS.filter(plan => plan.role === role);
    return Promise.resolve(plans);
  }

  // Get user's current subscription
  static async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const subscription = mockUserSubscriptions.find(sub => sub.userId === userId);
    return Promise.resolve(subscription || null);
  }

  // Check if user has active subscription
  static async isSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return false;
    
    const now = new Date();
    return subscription.status === 'active' && subscription.expiryDate > now;
  }

  // Start new subscription (PAYMENT-GATED)
  static async startSubscription(userId: string, planId: string): Promise<UserSubscription> {
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) {
      throw new Error('Invalid subscription plan');
    }

    // Create payment intent first
    const paymentIntent = await PaymentService.createPaymentIntent(
      userId,
      'subscription',
      planId,
      plan.price
    );

    // Mock payment success (in real app, this would be external payment flow)
    await PaymentService.markAsSuccess(paymentIntent.id);

    // Only activate subscription after successful payment
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + plan.duration);

    const newSubscription: UserSubscription = {
      id: `sub_${Date.now()}`,
      userId,
      planId,
      status: 'active',
      paymentIntentId: paymentIntent.id,
      startDate,
      expiryDate,
      createdAt: new Date()
    };

    // Mock adding to array (in real app, this would be API call)
    mockUserSubscriptions.push(newSubscription);
    return Promise.resolve(newSubscription);
  }

  // Cancel subscription (mock)
  static async cancelSubscription(userId: string): Promise<void> {
    const subscriptionIndex = mockUserSubscriptions.findIndex(sub => sub.userId === userId);
    if (subscriptionIndex !== -1) {
      mockUserSubscriptions[subscriptionIndex].status = 'expired';
    }
    return Promise.resolve();
  }
}