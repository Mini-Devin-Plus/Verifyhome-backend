import { RentNowPlan } from '../types/database';

// Mock RentNow plan data
const mockRentPlans: RentNowPlan[] = [
  {
    id: 'rent-plan-1',
    propertyId: 'prop-1',
    months: 12,
    installmentAmount: 208333, // 2.5M / 12 months
    eligibilityRequired: true,
    createdAt: new Date('2024-01-15')
  },
  {
    id: 'rent-plan-2',
    propertyId: 'prop-3',
    months: 6,
    installmentAmount: 300000, // 1.8M / 6 months
    eligibilityRequired: false,
    createdAt: new Date('2024-01-25')
  },
  {
    id: 'rent-plan-3',
    propertyId: 'prop-5',
    months: 24,
    installmentAmount: 37500, // 900K / 24 months
    eligibilityRequired: true,
    createdAt: new Date('2024-02-05')
  }
];

export class RentNowService {
  // Returns all RentNow plans
  static async getRentPlans(): Promise<RentNowPlan[]> {
    return Promise.resolve(mockRentPlans);
  }

  // Returns plan by ID
  static async getRentPlanById(id: string): Promise<RentNowPlan | null> {
    const plan = mockRentPlans.find(p => p.id === id);
    return Promise.resolve(plan || null);
  }

  // Returns all plans for a specific property
  static async getPlansByProperty(propertyId: string): Promise<RentNowPlan[]> {
    const plans = mockRentPlans.filter(p => p.propertyId === propertyId);
    return Promise.resolve(plans);
  }

  // Returns eligibility status for user and property (mocked)
  static async checkEligibility(userId: string, propertyId: string): Promise<boolean> {
    // Mock eligibility logic - returns true for verified users
    const isEligible = userId === '1' || userId === '2'; // Mock verified users
    return Promise.resolve(isEligible);
  }
}