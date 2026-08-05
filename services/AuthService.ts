import { User, UserSession } from '../types/database';
import { OTPService } from './OTPService';
import { EventLogger } from './EventLogger';

// Pure interface - no platform-specific code
export interface StorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Mock user storage
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

// Mock user sessions
const mockUserSessions: UserSession[] = [];

export class AuthService {
  private static storage: StorageInterface;

  static setStorage(storage: StorageInterface): void {
    this.storage = storage;
  }

  // STEP 1: Send OTP for login/signup
  static async sendLoginOTP(
    phoneNumber: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; sessionId?: string; isNewUser?: boolean; error?: string }> {
    try {
      // Check if user exists
      const existingUser = mockUsers.find(u => u.phone === phoneNumber);
      const purpose = existingUser ? 'login' : 'signup';
      
      const result = await OTPService.sendOTP(phoneNumber, purpose, ipAddress, userAgent);
      
      if (result.success) {
        // Log successful OTP send (no PII)
        await EventLogger.logEvent(
          'otp_sent',
          'auth',
          'info',
          { purpose, isNewUser: !existingUser },
          existingUser?.id
        );
        
        return {
          success: true,
          sessionId: result.sessionId,
          isNewUser: !existingUser
        };
      } else {
        // Log OTP send failure
        await EventLogger.logEvent(
          'otp_send_failed',
          'auth',
          'error',
          { purpose, error: result.error }
        );
      }
      
      return { success: false, error: result.error };
    } catch (error) {
      await EventLogger.logEvent(
        'otp_send_failed',
        'auth',
        'error',
        { purpose: 'login', error: 'system_error' }
      );
      return { success: false, error: 'Failed to send OTP' };
    }
  }

  // STEP 2: Verify OTP and complete login/signup
  static async verifyLoginOTP(
    sessionId: string,
    otp: string,
    userData?: Omit<User, 'id' | 'phone' | 'phoneVerified' | 'createdAt' | 'updatedAt'>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; user?: User; sessionToken?: string; error?: string }> {
    try {
      const otpResult = await OTPService.verifyOTP(sessionId, otp, ipAddress, userAgent);
      
      if (!otpResult.success || !otpResult.phoneNumber) {
        return { success: false, error: otpResult.error };
      }

      const phoneNumber = otpResult.phoneNumber;
      let user = mockUsers.find(u => u.phone === phoneNumber);

      // If user doesn't exist, create new user (signup)
      if (!user) {
        if (!userData) {
          return { success: false, error: 'User data required for signup' };
        }

        user = {
          id: `user_${Date.now()}`,
          phone: phoneNumber,
          phoneVerified: true,
          lastOTPVerification: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...userData
        };

        mockUsers.push(user);
      } else {
        // Update last OTP verification
        user.lastOTPVerification = new Date();
        user.phoneVerified = true;
        user.updatedAt = new Date();
      }

      // Create user session
      const userSession: UserSession = {
        id: `session_${Date.now()}`,
        userId: user.id,
        phoneNumber: user.phone,
        otpSessionId: sessionId,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        createdAt: new Date(),
        lastActivityAt: new Date(),
        ipAddress,
        userAgent
      };

      mockUserSessions.push(userSession);

      // Store session token
      if (this.storage) {
        await this.storage.setItem('userSessionToken', userSession.id);
        await this.storage.setItem('currentUserId', user.id);
      }

      return {
        success: true,
        user,
        sessionToken: userSession.id
      };
    } catch (error) {
      return { success: false, error: 'Authentication failed' };
    }
  }

  // Get current user ID from storage
  static async getCurrentUserId(): Promise<string | null> {
    try {
      if (!this.storage) return null;
      
      const sessionToken = await this.storage.getItem('userSessionToken');
      if (!sessionToken) return null;

      const session = mockUserSessions.find(s => s.id === sessionToken && s.isActive);
      if (!session || new Date() > session.expiresAt) {
        await this.logout();
        return null;
      }

      // Update last activity
      session.lastActivityAt = new Date();
      
      return session.userId;
    } catch (error) {
      return null;
    }
  }

  // Logout
  static async logout(): Promise<void> {
    try {
      if (!this.storage) return;
      
      const sessionToken = await this.storage.getItem('userSessionToken');
      if (sessionToken) {
        const session = mockUserSessions.find(s => s.id === sessionToken);
        if (session) {
          session.isActive = false;
        }
      }
      
      await this.storage.removeItem('userSessionToken');
      await this.storage.removeItem('currentUserId');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // Send OTP for sensitive actions (escrow confirmation, admin approval)
  static async sendSensitiveActionOTP(
    phoneNumber: string,
    purpose: 'escrow_confirmation' | 'admin_approval' | 'sensitive_action',
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    return await OTPService.sendOTP(phoneNumber, purpose, ipAddress, userAgent);
  }

  // Verify sensitive action OTP
  static async verifySensitiveActionOTP(
    sessionId: string,
    otp: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
    return await OTPService.verifyOTP(sessionId, otp, ipAddress, userAgent);
  }

  // Validate user session
  static async validateSession(sessionToken: string): Promise<{ valid: boolean; user?: User }> {
    try {
      const session = mockUserSessions.find(s => s.id === sessionToken && s.isActive);
      if (!session || new Date() > session.expiresAt) {
        return { valid: false };
      }

      const user = mockUsers.find(u => u.id === session.userId);
      if (!user || !user.phoneVerified) {
        return { valid: false };
      }

      // Update last activity
      session.lastActivityAt = new Date();
      
      return { valid: true, user };
    } catch (error) {
      return { valid: false };
    }
  }
}