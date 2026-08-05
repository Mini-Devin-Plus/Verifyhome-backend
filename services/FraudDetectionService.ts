export interface FraudDetectionRule {
  id: string;
  name: string;
  type: 'velocity' | 'pattern' | 'amount' | 'behavior' | 'device';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  threshold: number;
  description: string;
}

export interface FraudAlert {
  id: string;
  type: 'deal_fraud' | 'payment_fraud' | 'account_fraud' | 'communication_fraud';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  resourceId: string; // dealId, paymentId, etc.
  riskScore: number; // 0-100
  triggeredRules: string[];
  description: string;
  status: 'pending' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface UserBehaviorProfile {
  userId: string;
  dealPatterns: {
    averageAmount: number;
    frequencyPerWeek: number;
    preferredDealType: 'escrow' | 'standard';
    timeOfDayPattern: number[]; // 24-hour array
  };
  communicationPatterns: {
    messagesPerDay: number;
    callsPerWeek: number;
    responseTimeMinutes: number;
  };
  deviceFingerprint: {
    deviceIds: string[];
    ipAddresses: string[];
    userAgents: string[];
  };
  riskFactors: {
    accountAge: number; // days
    verificationLevel: number; // 0-100
    complaintCount: number;
    successfulDeals: number;
  };
  lastUpdated: Date;
}

export class FraudDetectionService {
  private static detectionRules: Map<string, FraudDetectionRule> = new Map();
  private static fraudAlerts: FraudAlert[] = [];
  private static userProfiles: Map<string, UserBehaviorProfile> = new Map();
  
  static {
    this.initializeDetectionRules();
  }

  // Initialize ML-based fraud detection rules
  private static initializeDetectionRules(): void {
    const rules: FraudDetectionRule[] = [
      {
        id: 'velocity_deals',
        name: 'High Deal Velocity',
        type: 'velocity',
        severity: 'medium',
        enabled: true,
        threshold: 5, // More than 5 deals per day
        description: 'User creating unusually high number of deals'
      },
      {
        id: 'amount_anomaly',
        name: 'Amount Anomaly',
        type: 'amount',
        severity: 'high',
        enabled: true,
        threshold: 10, // 10x higher than average
        description: 'Deal amount significantly higher than user pattern'
      },
      {
        id: 'new_device_high_value',
        name: 'New Device High Value',
        type: 'device',
        severity: 'high',
        enabled: true,
        threshold: 1000000, // ₦1M+ from new device
        description: 'High-value transaction from unrecognized device'
      },
      {
        id: 'rapid_communication',
        name: 'Rapid Communication Pattern',
        type: 'behavior',
        severity: 'medium',
        enabled: true,
        threshold: 100, // More than 100 messages per hour
        description: 'Unusually rapid communication suggesting automation'
      },
      {
        id: 'off_hours_activity',
        name: 'Off-Hours Activity',
        type: 'pattern',
        severity: 'low',
        enabled: true,
        threshold: 3, // Activity between 2-5 AM
        description: 'Suspicious activity during unusual hours'
      },
      {
        id: 'multiple_failed_payments',
        name: 'Multiple Failed Payments',
        type: 'pattern',
        severity: 'high',
        enabled: true,
        threshold: 3, // 3+ failed payments in 1 hour
        description: 'Multiple payment failures suggesting card testing'
      }
    ];

    rules.forEach(rule => this.detectionRules.set(rule.id, rule));
  }

  // Main fraud detection analysis
  static async analyzeActivity(
    userId: string,
    activityType: 'deal_creation' | 'payment' | 'communication' | 'login',
    activityData: Record<string, any>
  ): Promise<{ riskScore: number; alerts: FraudAlert[]; blocked: boolean }> {
    try {
      // Get or create user behavior profile
      const profile = await this.getUserProfile(userId);
      
      // Run fraud detection rules
      const ruleResults = await this.runDetectionRules(userId, activityType, activityData, profile);
      
      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(ruleResults);
      
      // Generate alerts for high-risk activities
      const alerts = await this.generateAlerts(userId, activityType, activityData, ruleResults, riskScore);
      
      // Update user profile with new activity
      await this.updateUserProfile(userId, activityType, activityData);
      
      // Determine if activity should be blocked
      const blocked = riskScore >= 80 || alerts.some(alert => alert.severity === 'critical');
      
      if (blocked) {
        this.logSecurityEvent('activity_blocked', userId, {
          activityType,
          riskScore,
          alertCount: alerts.length,
          triggeredRules: ruleResults.filter(r => r.triggered).map(r => r.ruleId)
        });
      }
      
      return { riskScore, alerts, blocked };
    } catch (error) {
      console.error('[FRAUD DETECTION] Analysis failed:', error);
      return { riskScore: 0, alerts: [], blocked: false };
    }
  }

  // Run individual detection rules
  private static async runDetectionRules(
    userId: string,
    activityType: string,
    activityData: Record<string, any>,
    profile: UserBehaviorProfile
  ): Promise<Array<{ ruleId: string; triggered: boolean; score: number; reason?: string }>> {
    const results: Array<{ ruleId: string; triggered: boolean; score: number; reason?: string }> = [];
    
    for (const [ruleId, rule] of this.detectionRules.entries()) {
      if (!rule.enabled) continue;
      
      let triggered = false;
      let score = 0;
      let reason = '';
      
      switch (rule.id) {
        case 'velocity_deals':
          if (activityType === 'deal_creation') {
            const todayDeals = this.countTodayActivity(userId, 'deal_creation');
            triggered = todayDeals >= rule.threshold;
            score = Math.min((todayDeals / rule.threshold) * 30, 50);
            reason = `${todayDeals} deals created today`;
          }
          break;
          
        case 'amount_anomaly':
          if (activityType === 'deal_creation' && activityData.amount) {
            const avgAmount = profile.dealPatterns.averageAmount || 100000;
            const ratio = activityData.amount / avgAmount;
            triggered = ratio >= rule.threshold;
            score = Math.min(ratio * 5, 40);
            reason = `Amount ${ratio.toFixed(1)}x higher than average`;
          }
          break;
          
        case 'new_device_high_value':
          if (activityData.deviceId && activityData.amount >= rule.threshold) {
            const isNewDevice = !profile.deviceFingerprint.deviceIds.includes(activityData.deviceId);
            triggered = isNewDevice;
            score = triggered ? 35 : 0;
            reason = 'High-value transaction from new device';
          }
          break;
          
        case 'rapid_communication':
          if (activityType === 'communication') {
            const hourlyMessages = this.countHourlyActivity(userId, 'communication');
            triggered = hourlyMessages >= rule.threshold;
            score = Math.min((hourlyMessages / rule.threshold) * 25, 35);
            reason = `${hourlyMessages} messages in past hour`;
          }
          break;
          
        case 'off_hours_activity':
          const hour = new Date().getHours();
          triggered = hour >= 2 && hour <= 5;
          score = triggered ? 15 : 0;
          reason = 'Activity during off-hours (2-5 AM)';
          break;
          
        case 'multiple_failed_payments':
          if (activityType === 'payment' && activityData.failed) {
            const failedPayments = this.countHourlyActivity(userId, 'failed_payment');
            triggered = failedPayments >= rule.threshold;
            score = Math.min((failedPayments / rule.threshold) * 40, 50);
            reason = `${failedPayments} failed payments in past hour`;
          }
          break;
      }
      
      results.push({ ruleId, triggered, score, reason });
    }
    
    return results;
  }

  // Calculate overall risk score using weighted algorithm
  private static calculateRiskScore(
    ruleResults: Array<{ ruleId: string; triggered: boolean; score: number }>
  ): number {
    const totalScore = ruleResults.reduce((sum, result) => sum + result.score, 0);
    const triggeredCount = ruleResults.filter(r => r.triggered).length;
    
    // Base score from individual rules
    let riskScore = Math.min(totalScore, 100);
    
    // Bonus for multiple triggered rules (compound risk)
    if (triggeredCount > 1) {
      riskScore += triggeredCount * 5;
    }
    
    return Math.min(riskScore, 100);
  }

  // Generate fraud alerts
  private static async generateAlerts(
    userId: string,
    activityType: string,
    activityData: Record<string, any>,
    ruleResults: Array<{ ruleId: string; triggered: boolean; score: number; reason?: string }>,
    riskScore: number
  ): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];
    const triggeredRules = ruleResults.filter(r => r.triggered);
    
    if (triggeredRules.length === 0) {
      return alerts;
    }
    
    // Determine alert type and severity
    let alertType: FraudAlert['type'] = 'account_fraud';
    let severity: FraudAlert['severity'] = 'low';
    
    if (activityType === 'deal_creation') alertType = 'deal_fraud';
    else if (activityType === 'payment') alertType = 'payment_fraud';
    else if (activityType === 'communication') alertType = 'communication_fraud';
    
    if (riskScore >= 90) severity = 'critical';
    else if (riskScore >= 70) severity = 'high';
    else if (riskScore >= 40) severity = 'medium';
    
    const alert: FraudAlert = {
      id: `fraud_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: alertType,
      severity,
      userId,
      resourceId: activityData.resourceId || activityData.dealId || activityData.paymentId || '',
      riskScore,
      triggeredRules: triggeredRules.map(r => r.ruleId),
      description: `Fraud risk detected: ${triggeredRules.map(r => r.reason).join(', ')}`,
      status: 'pending',
      createdAt: new Date()
    };
    
    alerts.push(alert);
    this.fraudAlerts.push(alert);
    
    // Keep only last 5000 alerts
    if (this.fraudAlerts.length > 5000) {
      this.fraudAlerts.splice(0, this.fraudAlerts.length - 5000);
    }
    
    // Log critical alerts immediately
    if (severity === 'critical') {
      console.error('[CRITICAL FRAUD ALERT]', alert);
    }
    
    return alerts;
  }

  // User behavior profiling
  private static async getUserProfile(userId: string): Promise<UserBehaviorProfile> {
    let profile = this.userProfiles.get(userId);
    
    if (!profile) {
      profile = {
        userId,
        dealPatterns: {
          averageAmount: 0,
          frequencyPerWeek: 0,
          preferredDealType: 'escrow',
          timeOfDayPattern: new Array(24).fill(0)
        },
        communicationPatterns: {
          messagesPerDay: 0,
          callsPerWeek: 0,
          responseTimeMinutes: 0
        },
        deviceFingerprint: {
          deviceIds: [],
          ipAddresses: [],
          userAgents: []
        },
        riskFactors: {
          accountAge: 0,
          verificationLevel: 50,
          complaintCount: 0,
          successfulDeals: 0
        },
        lastUpdated: new Date()
      };
      
      this.userProfiles.set(userId, profile);
    }
    
    return profile;
  }

  private static async updateUserProfile(
    userId: string,
    activityType: string,
    activityData: Record<string, any>
  ): Promise<void> {
    const profile = await this.getUserProfile(userId);
    const hour = new Date().getHours();
    
    switch (activityType) {
      case 'deal_creation':
        if (activityData.amount) {
          const currentAvg = profile.dealPatterns.averageAmount;
          profile.dealPatterns.averageAmount = currentAvg === 0 
            ? activityData.amount 
            : (currentAvg + activityData.amount) / 2;
        }
        profile.dealPatterns.timeOfDayPattern[hour]++;
        break;
        
      case 'communication':
        profile.communicationPatterns.messagesPerDay++;
        break;
    }
    
    // Update device fingerprint
    if (activityData.deviceId && !profile.deviceFingerprint.deviceIds.includes(activityData.deviceId)) {
      profile.deviceFingerprint.deviceIds.push(activityData.deviceId);
    }
    if (activityData.ipAddress && !profile.deviceFingerprint.ipAddresses.includes(activityData.ipAddress)) {
      profile.deviceFingerprint.ipAddresses.push(activityData.ipAddress);
    }
    
    profile.lastUpdated = new Date();
  }

  // Activity counting helpers
  private static countTodayActivity(userId: string, activityType: string): number {
    // Mock implementation - in production, query actual database
    return Math.floor(Math.random() * 3); // 0-2 activities today
  }

  private static countHourlyActivity(userId: string, activityType: string): number {
    // Mock implementation - in production, query actual database
    return Math.floor(Math.random() * 10); // 0-9 activities this hour
  }

  // Alert management
  static resolveAlert(
    alertId: string,
    resolvedBy: string,
    status: 'resolved' | 'false_positive'
  ): boolean {
    const alert = this.fraudAlerts.find(a => a.id === alertId);
    if (!alert) return false;
    
    alert.status = status;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;
    
    this.logSecurityEvent('fraud_alert_resolved', alert.userId, {
      alertId,
      status,
      resolvedBy,
      riskScore: alert.riskScore
    });
    
    return true;
  }

  // Security event logging
  private static logSecurityEvent(
    event: string,
    userId: string,
    metadata: Record<string, any>
  ): void {
    console.log(`[FRAUD DETECTION] ${event}:`, {
      userId: userId.replace(/(.{4}).*(.{4})/, '$1***$2'),
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  // Admin methods
  static getFraudAlerts(status?: string, severity?: string): FraudAlert[] {
    let alerts = [...this.fraudAlerts];
    
    if (status) {
      alerts = alerts.filter(alert => alert.status === status);
    }
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    return alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  static getFraudStatistics(): {
    totalAlerts: number;
    alertsBySeverity: Record<string, number>;
    alertsByType: Record<string, number>;
    resolvedAlerts: number;
  } {
    const totalAlerts = this.fraudAlerts.length;
    const alertsBySeverity: Record<string, number> = {};
    const alertsByType: Record<string, number> = {};
    let resolvedAlerts = 0;
    
    this.fraudAlerts.forEach(alert => {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
      alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
      if (alert.status === 'resolved') resolvedAlerts++;
    });
    
    return { totalAlerts, alertsBySeverity, alertsByType, resolvedAlerts };
  }

  static getDetectionRules(): FraudDetectionRule[] {
    return Array.from(this.detectionRules.values());
  }

  static updateDetectionRule(ruleId: string, updates: Partial<FraudDetectionRule>): boolean {
    const rule = this.detectionRules.get(ruleId);
    if (!rule) return false;
    
    Object.assign(rule, updates);
    return true;
  }
}