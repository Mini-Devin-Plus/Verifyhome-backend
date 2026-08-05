import { User } from '../types/database';

// Mock users (same as AuthService for consistency)
const mockUsers: User[] = [
  {
    id: '1',
    name: 'John Tenant',
    email: 'john@example.com',
    phone: '+2348012345678',
    role: 'Tenant',
    verificationStatus: 'Verified',
    phoneVerified: true,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10')
  },
  {
    id: '2',
    name: 'Sarah Buyer',
    email: 'sarah@example.com',
    phone: '+2348012345679',
    role: 'Buyer',
    verificationStatus: 'Verified',
    phoneVerified: true,
    createdAt: new Date('2024-01-12'),
    updatedAt: new Date('2024-01-12')
  },
  {
    id: '3',
    name: 'Mike Agent',
    email: 'mike@example.com',
    phone: '+2348012345680',
    role: 'Agent',
    verificationStatus: 'Verified',
    phoneVerified: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: '4',
    name: 'David Seller',
    email: 'david@example.com',
    phone: '+2348012345681',
    role: 'Seller',
    verificationStatus: 'Verified',
    phoneVerified: true,
    createdAt: new Date('2024-01-18'),
    updatedAt: new Date('2024-01-18')
  },
  {
    id: '5',
    name: 'Grace Landlord',
    email: 'grace@example.com',
    phone: '+2348012345682',
    role: 'Landlord',
    verificationStatus: 'Verified',
    phoneVerified: true,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20')
  }
];

export class UserService {
  
  // Get user by ID
  static async getUserById(userId: string): Promise<User | null> {
    const user = mockUsers.find(u => u.id === userId);
    return Promise.resolve(user || null);
  }

  // Get user by phone number (primary identifier)
  static async getUserByPhone(phoneNumber: string): Promise<User | null> {
    const user = mockUsers.find(u => u.phone === phoneNumber);
    return Promise.resolve(user || null);
  }

  // Update user (only for verified phone users)
  static async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return null;
    }

    const user = mockUsers[userIndex];
    
    // Only allow updates for phone-verified users
    if (!user.phoneVerified) {
      throw new Error('User phone not verified');
    }

    // Prevent updating critical fields
    const { id, phone, phoneVerified, createdAt, ...allowedUpdates } = updates;
    
    mockUsers[userIndex] = {
      ...user,
      ...allowedUpdates,
      updatedAt: new Date()
    };

    return mockUsers[userIndex];
  }

  // Get all users (admin only)
  static async getAllUsers(): Promise<User[]> {
    return Promise.resolve([...mockUsers]);
  }

  // Search users by name or email
  static async searchUsers(query: string): Promise<User[]> {
    const lowerQuery = query.toLowerCase();
    const users = mockUsers.filter(u => 
      u.name.toLowerCase().includes(lowerQuery) ||
      u.email.toLowerCase().includes(lowerQuery)
    );
    return Promise.resolve(users);
  }

  // Check if phone number is already registered
  static async isPhoneRegistered(phoneNumber: string): Promise<boolean> {
    const user = mockUsers.find(u => u.phone === phoneNumber);
    return Promise.resolve(!!user);
  }

  // Verify user phone (called after OTP verification)
  static async verifyUserPhone(userId: string): Promise<boolean> {
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return false;
    }

    mockUsers[userIndex].phoneVerified = true;
    mockUsers[userIndex].lastOTPVerification = new Date();
    mockUsers[userIndex].updatedAt = new Date();
    
    return true;
  }
}