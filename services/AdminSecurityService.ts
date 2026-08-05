import { User } from '../types/database';
import { EnhancedOTPService } from './EnhancedOTPService';
import { AdminAuditService } from './AdminAuditService';

export interface AdminRole {
  name: string;
  permissions: AdminPermission[];
  level: number; // 1=basic admin, 2=senior admin, 3=super admin
}

export interface AdminPermission {
  resource: 'calls' | 'chat' | 'deals' | 'users' | 'payments' | 'system';
  actions: ('read' | 'write' | 'delete' | 'moderate' | 'terminate')[];
}

export interface AdminSession {
  id: string;
  userId: string;
  role: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  otpVerified: boolean;
  sensitiveActionsEnabled: boolean;
  expiresAt: Date;
}

export interface AdminAuditLog {
  id: string;
  sessionId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  otpSessionId?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export class AdminSecurityService {
  private static adminRoles: Map<string, AdminRole> = new Map();
  private static activeSessions: Map<string, AdminSession> = new Map();
  private static auditLogs: AdminAuditLog[] = [];
  
  static {
    // Initialize default admin roles
    this.initializeDefaultRoles();
  }

  // Initialize role-based access control
  private static initializeDefaultRoles(): void {
    // Basic Admin - Limited permissions
    this.adminRoles.set('ADMIN', {
      name: 'ADMIN',
      level: 1,
      permissions: [
        { resource: 'calls', actions: ['read', 'moderate'] },
        { resource: 'chat', actions: ['read', 'moderate'] },
        { resource: 'deals', actions: ['read'] },
        { resource: 'users', actions: ['read'] }
      ]
    });

    // Senior Admin - Extended permissions
    this.adminRoles.set('SENIOR_ADMIN', {
      name: 'SENIOR_ADMIN',
      level: 2,
      permissions: [
        { resource: 'calls', actions: ['read', 'moderate', 'terminate'] },
        { resource: 'chat', actions: ['read', 'moderate', 'delete'] },
        { resource: 'deals', actions: ['read', 'moderate'] },
        { resource: 'users', actions: ['read', 'moderate'] },
        { resource: 'payments', actions: ['read'] }
      ]
    });

    // Super Admin - Full permissions
    this.adminRoles.set('SUPER_ADMIN', {
      name: 'SUPER_ADMIN',
      level: 3,
      permissions: [
        { resource: 'calls', actions: ['read', 'write', 'moderate', 'terminate', 'delete'] },
        { resource: 'chat', actions: ['read', 'write', 'moderate', 'delete'] },
        { resource: 'deals', actions: ['read', 'write', 'moderate', 'delete'] },
        { resource: 'users', actions: ['read', 'write', 'moderate', 'delete'] },
        { resource: 'payments', actions: ['read', 'moderate'] },
        { resource: 'system', actions: ['read', 'write', 'moderate'] }
      ]
    });
  }

  // Enhanced admin authentication with session management
  static async authenticateAdmin(
    user: User,
    clientMetadata: {
      ipAddress: string;
      userAgent: string;
      deviceId?: string;
    }
  ): Promise<{ success: boolean; sessionId?: string; requiresOTP?: boolean; error?: string }> {
    try {
      // Verify user has admin role
      if (!this.isAdminRole(user.role)) {
        this.logSecurityEvent('admin_auth_denied', user.id, {
          reason: 'insufficient_role',
          role: user.role,
          ...clientMetadata
        });
        return { success: false, error: 'Access denied: insufficient permissions' };
      }

      // Check for suspicious login patterns
      const securityCheck = this.performLoginSecurityCheck(user.id, clientMetadata);
      if (!securityCheck.allowed) {
        return { success: false, error: securityCheck.reason };
      }

      // Create admin session
      const sessionId = `admin_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const session: AdminSession = {
        id: sessionId,
        userId: user.id,
        role: user.role,
        ipAddress: clientMetadata.ipAddress,
        userAgent: clientMetadata.userAgent,
        createdAt: new Date(),
        lastActivity: new Date(),
        otpVerified: false,
        sensitiveActionsEnabled: false,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
      };

      this.activeSessions.set(sessionId, session);

      this.logAuditEvent(sessionId, user.id, 'admin_login', 'session', sessionId, clientMetadata, {
        role: user.role,
        deviceId: clientMetadata.deviceId
      });

      return { 
        success: true, 
        sessionId, 
        requiresOTP: true // Always require OTP for sensitive actions
      };
    } catch (error) {
      console.error('[ADMIN SECURITY] Authentication failed:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  // OTP verification for sensitive admin actions
  static async verifySensitiveAction(
    sessionId: string,
    otpCode: string,
    action: string,
    resource: string,
    clientMetadata: { ipAddress: string; userAgent: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session || !this.isSessionValid(session)) {
        return { success: false, error: 'Invalid or expired session' };
      }

      // Verify OTP
      const otpResult = await EnhancedOTPService.verifyOTP(
        `admin_${session.userId}`,
        otpCode,
        clientMetadata.ipAddress
      );

      if (!otpResult.success) {
        this.logAuditEvent(sessionId, session.userId, 'otp_verification_failed', resource, '', clientMetadata, {
          action,
          error: otpResult.error
        });
        return { success: false, error: otpResult.error };
      }

      // Enable sensitive actions for this session
      session.otpVerified = true;
      session.sensitiveActionsEnabled = true;
      session.lastActivity = new Date();

      this.logAuditEvent(sessionId, session.userId, 'otp_verified', 'session', sessionId, clientMetadata, {
        action,
        otpSessionId: otpResult.session?.id
      });

      return { success: true };
    } catch (error) {
      console.error('[ADMIN SECURITY] OTP verification failed:', error);
      return { success: false, error: 'OTP verification failed' };
    }
  }

  // Permission checking
  static hasPermission(
    sessionId: string,
    resource: string,
    action: string
  ): { allowed: boolean; reason?: string } {
    const session = this.activeSessions.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return { allowed: false, reason: 'Invalid or expired session' };
    }

    const role = this.adminRoles.get(session.role);
    if (!role) {
      return { allowed: false, reason: 'Invalid admin role' };
    }

    const permission = role.permissions.find(p => p.resource === resource);
    if (!permission) {
      return { allowed: false, reason: `No permissions for resource: ${resource}` };
    }

    if (!permission.actions.includes(action as any)) {
      return { allowed: false, reason: `Action '${action}' not permitted for resource '${resource}'` };
    }

    // Sensitive actions require OTP verification
    const sensitiveActions = ['terminate', 'delete', 'moderate'];
    if (sensitiveActions.includes(action) && !session.sensitiveActionsEnabled) {
      return { allowed: false, reason: 'OTP verification required for sensitive actions' };
    }

    return { allowed: true };
  }

  // Execute admin action with full audit trail
  static async executeAdminAction(
    sessionId: string,
    action: string,
    resource: string,
    resourceId: string,
    clientMetadata: { ipAddress: string; userAgent: string },
    actionMetadata: Record<string, any> = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check permissions
      const permissionCheck = this.hasPermission(sessionId, resource, action);
      if (!permissionCheck.allowed) {
        this.logAuditEvent(sessionId, '', 'action_denied', resource, resourceId, clientMetadata, {
          action,
          reason: permissionCheck.reason,
          ...actionMetadata
        });
        return { success: false, error: permissionCheck.reason };
      }

      const session = this.activeSessions.get(sessionId)!;
      
      // Update session activity
      session.lastActivity = new Date();

      // Log successful action
      this.logAuditEvent(sessionId, session.userId, action, resource, resourceId, clientMetadata, actionMetadata);

      // Disable sensitive actions after use (require new OTP)
      const sensitiveActions = ['terminate', 'delete'];
      if (sensitiveActions.includes(action)) {
        session.sensitiveActionsEnabled = false;
      }

      return { success: true };
    } catch (error) {
      console.error('[ADMIN SECURITY] Action execution failed:', error);
      return { success: false, error: 'Action execution failed' };
    }
  }

  // Session management
  static updateSessionActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session && this.isSessionValid(session)) {
      session.lastActivity = new Date();
    }
  }

  static invalidateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.logAuditEvent(sessionId, session.userId, 'admin_logout', 'session', sessionId, {
        ipAddress: session.ipAddress,
        userAgent: session.userAgent
      }, {});
    }
    this.activeSessions.delete(sessionId);
  }

  // Security checks
  private static performLoginSecurityCheck(
    userId: string,
    clientMetadata: { ipAddress: string; userAgent: string }
  ): { allowed: boolean; reason?: string } {
    // Check for multiple concurrent sessions
    const userSessions = Array.from(this.activeSessions.values())
      .filter(s => s.userId === userId && this.isSessionValid(s));
    
    if (userSessions.length >= 3) {
      return { allowed: false, reason: 'Too many active admin sessions' };
    }

    // Check for suspicious IP patterns (basic implementation)
    const recentLogins = this.auditLogs
      .filter(log => 
        log.userId === userId && 
        log.action === 'admin_login' && 
        log.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

    const uniqueIPs = new Set(recentLogins.map(log => log.ipAddress));
    if (uniqueIPs.size > 5) {
      return { allowed: false, reason: 'Suspicious login pattern detected' };
    }

    return { allowed: true };
  }

  private static isSessionValid(session: AdminSession): boolean {
    const now = new Date();
    
    // Check expiration
    if (now > session.expiresAt) {
      return false;
    }

    // Check inactivity (30 minutes)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    if (session.lastActivity < thirtyMinutesAgo) {
      return false;
    }

    return true;
  }

  private static isAdminRole(role: string): boolean {
    return this.adminRoles.has(role);
  }

  // Audit logging
  private static logAuditEvent(
    sessionId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    clientMetadata: { ipAddress: string; userAgent: string },
    metadata: Record<string, any>
  ): void {
    const session = this.activeSessions.get(sessionId);
    const adminRole = session?.role || 'UNKNOWN';
    
    AdminAuditService.logAdminAction(
      userId,
      adminRole,
      action,
      resource,
      metadata,
      clientMetadata,
      true,
      resourceId,
      metadata.otpSessionId
    );

    const auditLog: AdminAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      userId,
      action,
      resource,
      resourceId,
      ipAddress: clientMetadata.ipAddress,
      userAgent: clientMetadata.userAgent,
      metadata,
      timestamp: new Date()
    };

    this.auditLogs.push(auditLog);

    // Keep only last 10000 audit logs
    if (this.auditLogs.length > 10000) {
      this.auditLogs.splice(0, this.auditLogs.length - 10000);
    }

    console.log('[ADMIN AUDIT]', {
      action,
      resource,
      userId: userId.replace(/(.{4}).*(.{4})/, '$1***$2'),
      timestamp: auditLog.timestamp.toISOString()
    });
  }

  private static logSecurityEvent(
    event: string,
    userId: string,
    metadata: Record<string, any>
  ): void {
    console.warn(`[ADMIN SECURITY] ${event}:`, {
      userId: userId.replace(/(.{4}).*(.{4})/, '$1***$2'),
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  // Cleanup expired sessions
  static cleanupExpiredSessions(): void {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (!this.isSessionValid(session)) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Admin methods for monitoring
  static getActiveSessions(): AdminSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => this.isSessionValid(session));
  }

  static getAuditLogs(limit: number = 100): AdminAuditLog[] {
    return this.auditLogs.slice(-limit);
  }

  static getAdminRoles(): AdminRole[] {
    return Array.from(this.adminRoles.values());
  }
}