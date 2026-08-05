import { Property, OwnershipContext } from '../types/database';
import { RoleCapabilities, UserRole } from '../utils/RoleCapabilities';
import { SubscriptionService } from './SubscriptionService';
import { PaymentService } from './PaymentService';

// Mock property data
const mockProperties: Property[] = [
  {
    id: 'prop-1',
    title: 'Luxury 3 Bedroom Apartment',
    type: 'rent',
    price: 2500000,
    location: 'Victoria Island, Lagos',
    size: '120 sqm',
    bedrooms: 3,
    bathrooms: 2,
    verifiedStatus: 'Verified',
    agentId: 'agent-1',
    description: 'Modern apartment with ocean view and premium amenities',
    images: ['image1.jpg', 'image2.jpg', 'image3.jpg'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: 'prop-2',
    title: 'Executive 4 Bedroom House',
    type: 'sale',
    price: 85000000,
    location: 'Ikoyi, Lagos',
    size: '200 sqm',
    bedrooms: 4,
    bathrooms: 3,
    verifiedStatus: 'Verified',
    agentId: 'agent-2',
    description: 'Spacious family home with garden and parking',
    images: ['image4.jpg', 'image5.jpg'],
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20')
  },
  {
    id: 'prop-3',
    title: '2 Bedroom Flat',
    type: 'rent',
    price: 1800000,
    location: 'Lekki Phase 1, Lagos',
    size: '85 sqm',
    bedrooms: 2,
    bathrooms: 2,
    verifiedStatus: 'Verified',
    agentId: 'agent-3',
    description: 'Affordable apartment in serene environment',
    images: ['image6.jpg', 'image7.jpg'],
    createdAt: new Date('2024-01-25'),
    updatedAt: new Date('2024-01-25')
  },
  {
    id: 'prop-4',
    title: '5 Bedroom Duplex',
    type: 'sale',
    price: 120000000,
    location: 'Garki District, Abuja',
    size: '300 sqm',
    bedrooms: 5,
    bathrooms: 4,
    verifiedStatus: 'Pending',
    agentId: 'agent-1',
    description: 'Luxury duplex with modern facilities',
    images: ['image8.jpg', 'image9.jpg', 'image10.jpg'],
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01')
  },
  {
    id: 'prop-5',
    title: 'Studio Apartment',
    type: 'rent',
    price: 900000,
    location: 'Surulere, Lagos',
    size: '45 sqm',
    bedrooms: 1,
    bathrooms: 1,
    verifiedStatus: 'Verified',
    agentId: 'agent-2',
    description: 'Compact and affordable studio for young professionals',
    images: ['image11.jpg'],
    createdAt: new Date('2024-02-05'),
    updatedAt: new Date('2024-02-05')
  },
  {
    id: 'prop-6',
    title: '3 Bedroom House by Owner',
    type: 'sale',
    price: 75000000,
    location: 'Magodo, Lagos',
    size: '180 sqm',
    bedrooms: 3,
    bathrooms: 2,
    verifiedStatus: 'Verified',
    agentId: '4', // Seller ID
    description: 'Beautiful family home sold directly by owner',
    images: ['image12.jpg', 'image13.jpg'],
    createdAt: new Date('2024-02-08'),
    updatedAt: new Date('2024-02-08')
  }
];

// Agent trust levels mapping
const agentTrustLevels: Record<string, 'Bronze' | 'Silver' | 'Gold'> = {
  'agent-1': 'Gold',
  'agent-2': 'Silver',
  'agent-3': 'Bronze',
  '4': 'Silver' // Seller user
};

export class PropertyService {
  // Returns all properties
  static async getProperties(): Promise<Property[]> {
    return Promise.resolve(mockProperties);
  }

  // Returns property by ID
  static async getPropertyById(id: string): Promise<Property | null> {
    const property = mockProperties.find(p => p.id === id);
    return Promise.resolve(property || null);
  }

  // Returns all properties listed by a specific agent
  static async getPropertiesByAgent(agentId: string): Promise<Property[]> {
    const properties = mockProperties.filter(p => p.agentId === agentId);
    return Promise.resolve(properties);
  }

  // Returns properties filtered by agent trust level
  static async getPropertiesByTrustLevel(level: 'Bronze' | 'Silver' | 'Gold'): Promise<Property[]> {
    const properties = mockProperties.filter(p => agentTrustLevels[p.agentId] === level);
    return Promise.resolve(properties);
  }

  // Filters properties by title, location, or type
  static async searchProperties(query: string): Promise<Property[]> {
    const lowerQuery = query.toLowerCase();
    const properties = mockProperties.filter(p => 
      p.title.toLowerCase().includes(lowerQuery) ||
      p.location.toLowerCase().includes(lowerQuery) ||
      p.type.toLowerCase().includes(lowerQuery)
    );
    return Promise.resolve(properties);
  }

  // Creates a new property listing (service-level permission check)
  static async createProperty(propertyData: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>, userRole: UserRole, userId: string): Promise<Property> {
    // Service-level permission enforcement
    if (!RoleCapabilities.canListProperty(userRole)) {
      throw new Error(RoleCapabilities.getUnauthorizedMessage(userRole, 'list_property'));
    }

    // Generate property ID for payment reference
    const propertyId = `prop_${Date.now()}`;

    // Service-level subscription OR listing fee enforcement
    if (RoleCapabilities.requiresActiveSubscription(userRole)) {
      const hasActiveSubscription = await SubscriptionService.isSubscriptionActive(userId);
      
      if (!hasActiveSubscription) {
        // Check if listing fee has been paid
        const hasValidListingFee = await PaymentService.hasValidListingFeePayment(userId, propertyId);
        
        if (!hasValidListingFee) {
          throw new Error(`Subscription or listing fee required. Subscribe or pay ₦${PaymentService.getListingFeeAmount()} listing fee.`);
        }
      }
    }

    // IMPORTANT: OwnershipContext enables auditability and trust enforcement
    // Automatically infer ownership context based on user role
    const ownershipContext: OwnershipContext = {
      ownerType: userRole.toLowerCase() as 'agent' | 'landlord' | 'seller',
      ownerId: userId
    };

    const newProperty: Property = {
      ...propertyData,
      id: propertyId,
      ownershipContext,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Mock adding to array (in real app, this would be API call)
    mockProperties.push(newProperty);
    return Promise.resolve(newProperty);
  }

  // Create listing fee payment intent
  static async createListingFeePayment(userId: string, propertyId: string): Promise<string> {
    const paymentIntent = await PaymentService.createPaymentIntent(
      userId,
      'listing_fee',
      propertyId,
      PaymentService.getListingFeeAmount()
    );
    
    // Mock payment success (in real app, this would be external payment flow)
    await PaymentService.markAsSuccess(paymentIntent.id);
    
    return paymentIntent.id;
  }
}