// Mock PropertyService for MVP
export class PropertyService {
  static async getProperties() {
    return [];
  }
  
  static async getPropertyById(id: string) {
    return null;
  }
  
  static async createProperty(data: any) {
    return { success: true, id: 'mock_property_' + Date.now() };
  }
}

// Mock AgentService for MVP
export class AgentService {
  static async getAgents() {
    return [];
  }
  
  static async getAgentById(id: string) {
    return null;
  }
}

// Mock SubscriptionService for MVP
export class SubscriptionService {
  static async getSubscriptionPlans() {
    return [];
  }
  
  static async getUserSubscription(userId: string) {
    return null;
  }
}

// Mock PaymentService for MVP
export class PaymentService {
  static async createPaymentIntent(data: any) {
    return { success: true, id: 'mock_payment_' + Date.now() };
  }
}

// Mock EscrowService for MVP
export class EscrowService {
  static async createEscrowDeal(data: any) {
    return { success: true, id: 'mock_escrow_' + Date.now() };
  }
}

// Mock CommissionService for MVP
export class CommissionService {
  static calculateCommission(amount: number) {
    return {
      grossAmount: amount,
      platformCommission: amount * 0.05,
      sellerReceives: amount * 0.95,
      buyerPays: amount
    };
  }
}

// Mock ReviewService for MVP
export class ReviewService {
  static async getReviews(agentId: string) {
    return [];
  }
}

// Mock RentNowService for MVP
export class RentNowService {
  static async getRentPlans(propertyId: string) {
    return [];
  }
}

// Mock BuyPropertyService for MVP
export class BuyPropertyService {
  static async createBuyOffer(data: any) {
    return { success: true, id: 'mock_offer_' + Date.now() };
  }
}

// Mock CallService for MVP
export class CallService {
  static async getCalls() {
    return [];
  }
  
  static async scheduleCall(data: any) {
    return { success: true, id: 'mock_call_' + Date.now() };
  }
}

// Mock ChatService for MVP
export class ChatService {
  static async getChats() {
    return [];
  }
  
  static async sendMessage(data: any) {
    return { success: true, id: 'mock_message_' + Date.now() };
  }
}

// Mock CallRealtimeService for MVP
export class CallRealtimeService {
  static initialize() {}
  static cleanup() {}
}

// Mock ChatRealtimeService for MVP
export class ChatRealtimeService {
  static initialize() {}
  static cleanup() {}
}

// Mock CallEnhancementService for MVP
export class CallEnhancementService {
  static isScreenSharingEnabled() { return false; }
  static isRecordingEnabled() { return false; }
}

// Mock ChatEntryService for MVP
export class ChatEntryService {
  static createChatEntry(data: any) {
    return { success: true, id: 'mock_entry_' + Date.now() };
  }
}