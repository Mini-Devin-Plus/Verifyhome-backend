interface AdminAuditEntry {
  id: string;
  adminUserId: string;
  adminRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  otpSessionId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export class AdminAuditService {
  private static auditLog: AdminAuditEntry[] = [];
  private static readonly MAX_LOG_SIZE = 50000;

  static logAdminAction(
    adminUserId: string,
    adminRole: string,
    action: string,
    resource: string,
    details: Record<string, any>,
    clientInfo: { ipAddress: string; userAgent: string },
    success: boolean = true,
    resourceId?: string,
    otpSessionId?: string,
    errorMessage?: string
  ): void {
    const entry: AdminAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      adminUserId: this.sanitizeUserId(adminUserId),
      adminRole,
      action,
      resource,
      resourceId,
      details: this.sanitizeDetails(details),
      otpSessionId,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      timestamp: new Date(),
      success,
      errorMessage
    };

    this.auditLog.push(entry);

    // Maintain log size
    if (this.auditLog.length > this.MAX_LOG_SIZE) {
      this.auditLog.splice(0, this.auditLog.length - this.MAX_LOG_SIZE);
    }

    // Console log for immediate visibility (production would use proper logging)
    console.log('[ADMIN AUDIT]', {
      admin: entry.adminUserId,
      role: entry.adminRole,
      action: entry.action,
      resource: entry.resource,
      success: entry.success,
      timestamp: entry.timestamp.toISOString()
    });

    // Alert on critical actions
    if (this.isCriticalAction(action)) {
      console.warn('[CRITICAL ADMIN ACTION]', {
        admin: entry.adminUserId,
        action: entry.action,
        timestamp: entry.timestamp.toISOString()
      });
    }
  }

  static getAuditLog(
    limit: number = 100,
    adminUserId?: string,
    action?: string,
    startDate?: Date,
    endDate?: Date
  ): AdminAuditEntry[] {
    let filtered = [...this.auditLog];

    if (adminUserId) {
      filtered = filtered.filter(entry => entry.adminUserId === this.sanitizeUserId(adminUserId));
    }

    if (action) {
      filtered = filtered.filter(entry => entry.action === action);
    }

    if (startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= endDate);
    }

    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  static getAdminActionSummary(adminUserId: string, days: number = 7): {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    criticalActions: number;
    actionsByType: Record<string, number>;
  } {
    const sanitizedUserId = this.sanitizeUserId(adminUserId);
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const userActions = this.auditLog.filter(entry => 
      entry.adminUserId === sanitizedUserId && entry.timestamp >= cutoffDate
    );

    const actionsByType: Record<string, number> = {};
    let criticalActions = 0;

    userActions.forEach(entry => {
      actionsByType[entry.action] = (actionsByType[entry.action] || 0) + 1;
      if (this.isCriticalAction(entry.action)) {
        criticalActions++;
      }
    });

    return {
      totalActions: userActions.length,
      successfulActions: userActions.filter(entry => entry.success).length,
      failedActions: userActions.filter(entry => !entry.success).length,
      criticalActions,
      actionsByType
    };
  }

  static detectSuspiciousActivity(adminUserId: string): {
    suspicious: boolean;
    reasons: string[];
    riskScore: number;
  } {
    const sanitizedUserId = this.sanitizeUserId(adminUserId);
    const recentActions = this.getAuditLog(1000, sanitizedUserId);
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for rapid successive actions
    const last10Actions = recentActions.slice(0, 10);
    if (last10Actions.length >= 10) {
      const timeSpan = last10Actions[0].timestamp.getTime() - last10Actions[9].timestamp.getTime();
      if (timeSpan < 60000) { // 10 actions in less than 1 minute
        reasons.push('Rapid successive actions detected');
        riskScore += 0.3;
      }
    }

    // Check for unusual IP patterns
    const recentIPs = new Set(recentActions.slice(0, 50).map(entry => entry.ipAddress));
    if (recentIPs.size > 5) {
      reasons.push('Multiple IP addresses used recently');
      riskScore += 0.2;
    }

    // Check for high failure rate
    const recent100 = recentActions.slice(0, 100);
    if (recent100.length >= 20) {
      const failureRate = recent100.filter(entry => !entry.success).length / recent100.length;
      if (failureRate > 0.3) {
        reasons.push('High failure rate in recent actions');
        riskScore += 0.4;
      }
    }

    // Check for off-hours activity (basic implementation)
    const offHoursActions = recentActions.slice(0, 50).filter(entry => {
      const hour = entry.timestamp.getHours();
      return hour < 6 || hour > 22; // Outside 6 AM - 10 PM
    });
    
    if (offHoursActions.length > 10) {
      reasons.push('Significant off-hours activity');
      riskScore += 0.2;
    }

    return {
      suspicious: riskScore > 0.5,
      reasons,
      riskScore: Math.min(riskScore, 1.0)
    };
  }

  private static sanitizeUserId(userId: string): string {
    // Mask user ID for privacy (show first 4 and last 4 characters)
    if (userId.length <= 8) return userId;
    return `${userId.substring(0, 4)}***${userId.substring(userId.length - 4)}`;
  }

  private static sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized = { ...details };
    
    // Remove sensitive information
    const sensitiveKeys = ['password', 'otp', 'token', 'secret', 'key'];
    sensitiveKeys.forEach(key => {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private static isCriticalAction(action: string): boolean {
    const criticalActions = [
      'suspend_user',
      'freeze_deal',
      'terminate_call',
      'disable_feature',
      'emergency_shutdown',
      'promote_admin',
      'demote_admin',
      'trigger_refund'
    ];
    
    return criticalActions.includes(action);
  }

  // Export audit log for external systems (production would use proper export)
  static exportAuditLog(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.auditLog, null, 2);
    }
    
    // CSV format
    const headers = 'ID,Admin,Role,Action,Resource,Success,Timestamp\n';
    const rows = this.auditLog.map(entry => 
      `${entry.id},${entry.adminUserId},${entry.adminRole},${entry.action},${entry.resource},${entry.success},${entry.timestamp.toISOString()}`
    ).join('\n');
    
    return headers + rows;
  }
}