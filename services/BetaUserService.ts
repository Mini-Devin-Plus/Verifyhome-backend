import { EventLogger } from './EventLogger';

export interface BetaUser {
  id: string;
  userId: string;
  email: string;
  phone: string; // Masked for privacy
  role: string;
  invitedAt: Date;
  activatedAt?: Date;
  isActive: boolean;
  invitedBy: string; // Admin who invited
  cohort: 'alpha' | 'beta' | 'early_access';
}

export interface BetaMetrics {
  totalUsers: number;
  activeUsers: number;
  usersByRole: Record<string, number>;
  usersByCohort: Record<string, number>;
  averageSessionDuration: number;
  retentionRate: number;
}

export class BetaUserService {
  private static betaUsers: BetaUser[] = [];
  private static readonly MAX_BETA_USERS = 100;
  private static readonly MAX_ALPHA_USERS = 50;

  // Initialize with pre-approved beta users
  static initialize(): void {
    // Pre-populate with initial beta users (would come from backend)
    const initialBetaUsers: BetaUser[] = [
      {
        id: 'beta_001',
        userId: 'user_test_admin',
        email: 'admin@verifyhome.com',
        phone: '+234801***5678',
        role: 'SUPER_ADMIN',
        invitedAt: new Date(),
        activatedAt: new Date(),
        isActive: true,
        invitedBy: 'system',
        cohort: 'alpha'
      }
    ];

    this.betaUsers.push(...initialBetaUsers);
    
    EventLogger.logEvent(
      'beta_service_initialized',
      'system',
      'info',
      { initialUserCount: initialBetaUsers.length }
    );
  }

  static isBetaUser(userId: string): boolean {
    const betaUser = this.betaUsers.find(u => u.userId === userId && u.isActive);
    return !!betaUser;
  }

  static getBetaUser(userId: string): BetaUser | null {
    return this.betaUsers.find(u => u.userId === userId) || null;
  }

  static async inviteBetaUser(
    userId: string,
    email: string,
    phone: string,
    role: string,
    cohort: 'alpha' | 'beta' | 'early_access',
    invitedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if user already invited
      if (this.betaUsers.find(u => u.userId === userId)) {
        return { success: false, error: 'User already in beta program' };
      }

      // Check capacity limits
      const currentCohortUsers = this.betaUsers.filter(u => u.cohort === cohort && u.isActive);
      const maxUsers = cohort === 'alpha' ? this.MAX_ALPHA_USERS : this.MAX_BETA_USERS;
      
      if (currentCohortUsers.length >= maxUsers) {
        return { success: false, error: `${cohort} cohort is full (${maxUsers} max)` };
      }

      const betaUser: BetaUser = {
        id: `beta_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        userId,
        email,
        phone: this.maskPhone(phone),
        role,
        invitedAt: new Date(),
        isActive: true,
        invitedBy,
        cohort
      };

      this.betaUsers.push(betaUser);

      // Log beta invitation
      await EventLogger.logEvent(
        'beta_user_invited',
        'system',
        'info',
        { 
          cohort,
          role,
          invitedBy,
          totalBetaUsers: this.betaUsers.filter(u => u.isActive).length
        },
        userId
      );

      return { success: true };
    } catch (error) {
      await EventLogger.logEvent(
        'beta_invitation_failed',
        'system',
        'error',
        { error: 'system_error' }
      );
      return { success: false, error: 'Failed to invite beta user' };
    }
  }

  static async activateBetaUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const betaUser = this.betaUsers.find(u => u.userId === userId);
      if (!betaUser) {
        return { success: false, error: 'User not found in beta program' };
      }

      if (betaUser.isActive) {
        return { success: false, error: 'User already active' };
      }

      betaUser.isActive = true;
      betaUser.activatedAt = new Date();

      await EventLogger.logEvent(
        'beta_user_activated',
        'system',
        'info',
        { cohort: betaUser.cohort, role: betaUser.role },
        userId
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to activate beta user' };
    }
  }

  static async deactivateBetaUser(userId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      const betaUser = this.betaUsers.find(u => u.userId === userId);
      if (!betaUser) {
        return { success: false, error: 'User not found in beta program' };
      }

      betaUser.isActive = false;

      await EventLogger.logEvent(
        'beta_user_deactivated',
        'system',
        'warning',
        { cohort: betaUser.cohort, role: betaUser.role, reason },
        userId
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to deactivate beta user' };
    }
  }

  static getBetaMetrics(): BetaMetrics {
    const activeUsers = this.betaUsers.filter(u => u.isActive);
    
    const usersByRole: Record<string, number> = {};
    const usersByCohort: Record<string, number> = {};
    
    activeUsers.forEach(user => {
      usersByRole[user.role] = (usersByRole[user.role] || 0) + 1;
      usersByCohort[user.cohort] = (usersByCohort[user.cohort] || 0) + 1;
    });

    return {
      totalUsers: this.betaUsers.length,
      activeUsers: activeUsers.length,
      usersByRole,
      usersByCohort,
      averageSessionDuration: 0, // Would calculate from session data
      retentionRate: 0 // Would calculate from usage data
    };
  }

  static getAllBetaUsers(): BetaUser[] {
    return [...this.betaUsers];
  }

  static getActiveBetaUsers(): BetaUser[] {
    return this.betaUsers.filter(u => u.isActive);
  }

  static getBetaUsersByCohort(cohort: 'alpha' | 'beta' | 'early_access'): BetaUser[] {
    return this.betaUsers.filter(u => u.cohort === cohort && u.isActive);
  }

  static isAtCapacity(cohort: 'alpha' | 'beta' | 'early_access'): boolean {
    const currentUsers = this.getBetaUsersByCohort(cohort).length;
    const maxUsers = cohort === 'alpha' ? this.MAX_ALPHA_USERS : this.MAX_BETA_USERS;
    return currentUsers >= maxUsers;
  }

  static getCapacityInfo(): {
    alpha: { current: number; max: number; available: number };
    beta: { current: number; max: number; available: number };
  } {
    const alphaUsers = this.getBetaUsersByCohort('alpha').length;
    const betaUsers = this.getBetaUsersByCohort('beta').length;
    
    return {
      alpha: {
        current: alphaUsers,
        max: this.MAX_ALPHA_USERS,
        available: this.MAX_ALPHA_USERS - alphaUsers
      },
      beta: {
        current: betaUsers,
        max: this.MAX_BETA_USERS,
        available: this.MAX_BETA_USERS - betaUsers
      }
    };
  }

  private static maskPhone(phone: string): string {
    if (phone.length <= 8) return phone;
    return `${phone.substring(0, 4)}***${phone.substring(phone.length - 4)}`;
  }

  // Beta feedback collection
  static async submitBetaFeedback(
    userId: string,
    category: 'bug' | 'feature_request' | 'general',
    message: string,
    severity: 'low' | 'medium' | 'high'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const betaUser = this.getBetaUser(userId);
      if (!betaUser) {
        return { success: false, error: 'Not a beta user' };
      }

      await EventLogger.logEvent(
        'beta_feedback_submitted',
        'system',
        severity === 'high' ? 'warning' : 'info',
        { 
          category,
          severity,
          cohort: betaUser.cohort,
          messageLength: message.length
        },
        userId
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to submit feedback' };
    }
  }
}