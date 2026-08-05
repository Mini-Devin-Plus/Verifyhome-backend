import { BuyOffer } from '../types/database';

// Mock buy offer data
const mockBuyOffers: BuyOffer[] = [
  {
    id: 'offer-1',
    propertyId: 'prop-2',
    buyerId: '2',
    offerAmount: 80000000,
    escrowStatus: 'Deposited',
    createdAt: new Date('2024-01-22'),
    updatedAt: new Date('2024-01-22')
  },
  {
    id: 'offer-2',
    propertyId: 'prop-4',
    buyerId: '1',
    offerAmount: 115000000,
    escrowStatus: 'Pending',
    createdAt: new Date('2024-02-02'),
    updatedAt: new Date('2024-02-02')
  },
  {
    id: 'offer-3',
    propertyId: 'prop-2',
    buyerId: '1',
    offerAmount: 82000000,
    escrowStatus: 'Rejected',
    createdAt: new Date('2024-01-28'),
    updatedAt: new Date('2024-01-30')
  }
];

export class BuyPropertyService {
  // Returns all buy offers
  static async getBuyOffers(): Promise<BuyOffer[]> {
    return Promise.resolve(mockBuyOffers);
  }

  // Returns offer by ID
  static async getOfferById(id: string): Promise<BuyOffer | null> {
    const offer = mockBuyOffers.find(o => o.id === id);
    return Promise.resolve(offer || null);
  }

  // Returns all offers for a specific property
  static async getOffersByProperty(propertyId: string): Promise<BuyOffer[]> {
    const offers = mockBuyOffers.filter(o => o.propertyId === propertyId);
    return Promise.resolve(offers);
  }

  // Creates a new offer and returns it (mocked)
  static async makeOffer(userId: string, propertyId: string, amount: number): Promise<BuyOffer> {
    const newOffer: BuyOffer = {
      id: `offer-${Date.now()}`,
      propertyId,
      buyerId: userId,
      offerAmount: amount,
      escrowStatus: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Mock adding to array (in real app, this would be API call)
    mockBuyOffers.push(newOffer);
    return Promise.resolve(newOffer);
  }
}