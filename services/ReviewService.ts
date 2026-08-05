import { Review } from '../types/database';

// Mock review data
const mockReviews: Review[] = [
  {
    id: 'review-1',
    agentId: 'agent-1',
    userId: '1',
    rating: 5,
    comment: 'Excellent service! David was very professional and helped me find the perfect apartment.',
    createdAt: new Date('2024-01-16')
  },
  {
    id: 'review-2',
    agentId: 'agent-2',
    userId: '2',
    rating: 4,
    comment: 'Grace was helpful throughout the process. Good communication and follow-up.',
    createdAt: new Date('2024-01-21')
  },
  {
    id: 'review-3',
    agentId: 'agent-1',
    userId: '2',
    rating: 5,
    comment: 'Outstanding agent! Made the buying process smooth and stress-free.',
    createdAt: new Date('2024-01-30')
  },
  {
    id: 'review-4',
    agentId: 'agent-3',
    userId: '1',
    rating: 4,
    comment: 'Ahmed was responsive and showed me several good options within my budget.',
    createdAt: new Date('2024-02-03')
  },
  {
    id: 'review-5',
    agentId: 'agent-2',
    userId: '1',
    rating: 3,
    comment: 'Good service but could improve on response time for inquiries.',
    createdAt: new Date('2024-02-07')
  }
];

export class ReviewService {
  // Returns all reviews
  static async getReviews(): Promise<Review[]> {
    return Promise.resolve(mockReviews);
  }

  // Returns review by ID
  static async getReviewById(id: string): Promise<Review | null> {
    const review = mockReviews.find(r => r.id === id);
    return Promise.resolve(review || null);
  }

  // Returns all reviews for a specific agent
  static async getReviewsByAgent(agentId: string): Promise<Review[]> {
    const reviews = mockReviews.filter(r => r.agentId === agentId);
    return Promise.resolve(reviews);
  }

  // Creates a new review and returns it (mocked)
  static async addReview(userId: string, agentId: string, rating: number, comment: string): Promise<Review> {
    const newReview: Review = {
      id: `review-${Date.now()}`,
      agentId,
      userId,
      rating,
      comment,
      createdAt: new Date()
    };
    
    // Mock adding to array (in real app, this would be API call)
    mockReviews.push(newReview);
    return Promise.resolve(newReview);
  }
}