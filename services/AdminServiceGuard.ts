import { AdminAuditService } from './AdminAuditService';

export class AdminServiceGuard {
  private static blockedAttempts: Map<string, number> = new Map();

  static enforceAdminAccess(
    userId: string,
    userRole: string,
    action: string,
    clientInfo: { ipAddress: string; userAgent: string }
  ): { allowed: boolean; reason?: string } {
    // Check if user has admin role
    const adminRoles = ['ADMIN', 'SENIOR_ADMIN', 'SUPER_ADMIN'];
    if (!adminRoles.includes(userRole)) {
      this.logBlockedAttempt(userId, userRole, action, clientInfo, 'non_admin_access_attempt');
      return { allowed: false, reason: 'Admin access required' };
    }

    // Check for excessive blocked attempts
    const attemptKey = `${userId}_${action}`;
    const attempts = this.blockedAttempts.get(attemptKey) || 0;
    if (attempts > 5) {
      this.logBlockedAttempt(userId, userRole, action, clientInfo, 'excessive_blocked_attempts');
      return { allowed: false, reason: 'Too many failed attempts' };
    }

    return { allowed: true };
  }

  static enforceOTPRequirement(
    sessionId: string,
    action: string,
    otpVerified: boolean
  ): { allowed: boolean; reason?: string } {
    const sensitiveActions = [
      'suspend_user',
      'activate_user', 
      'freeze_deal',
      'terminate_call',
      'toggle_feature',
      'emergency_shutdown',
      'trigger_refund'
    ];

    if (sensitiveActions.includes(action) && !otpVerified) {
      return { allowed: false, reason: 'OTP verification required for sensitive action' };
    }

    return { allowed: true };
  }

  private static logBlockedAttempt(
    userId: string,
    userRole: string,
    action: string,
    clientInfo: { ipAddress: string; userAgent: string },
    reason: string
  ): void {
    // Log to admin audit
    AdminAuditService.logAdminAction(
      userId,
      userRole,
      'blocked_access_attempt',
      'system',
      { action, reason },
      clientInfo,
      false,
      undefined,
      undefined,
      reason
    );

    // Track blocked attempts
    const attemptKey = `${userId}_${action}`;
    const currentAttempts = this.blockedAttempts.get(attemptKey) || 0;
    this.blockedAttempts.set(attemptKey, currentAttempts + 1);

    // Security alert
    console.warn('[ADMIN SECURITY VIOLATION]', {
      userId: userId.replace(/(.{4}).*(.{4})/, '$1***$2'),
      userRole,
      action,
      reason,
      attempts: currentAttempts + 1,
      timestamp: new Date().toISOString()
    });
  }

  static resetBlockedAttempts(userId: string, action: string): void {
    const attemptKey = `${userId}_${action}`;
    this.blockedAttempts.delete(attemptKey);
  }
}