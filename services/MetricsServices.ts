import { EventLogger } from './EventLogger';

interface MetricSummary {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  trend: 'up' | 'down' | 'stable';
}

interface TimeSeriesData {
  timestamp: Date;
  value: number;
}

export class AuthMetricsService {
  static getOTPMetrics(timeframe: 'day' | 'week' = 'day'): MetricSummary {
    const events = EventLogger.getEvents(1000, 'auth');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeframe === 'day' ? 1 : 7));
    
    const recentEvents = events.filter(e => e.timestamp >= cutoff);
    const otpSent = recentEvents.filter(e => e.type === 'otp_sent').length;
    const otpVerified = recentEvents.filter(e => e.type === 'otp_verified').length;
    const otpFailed = recentEvents.filter(e => e.type === 'otp_failed').length;
    
    const total = otpSent;
    const success = otpVerified;
    const failure = otpFailed;
    const successRate = total > 0 ? (success / total) * 100 : 0;
    
    return {
      total,
      success,
      failure,
      successRate,
      trend: this.calculateTrend(successRate, timeframe)
    };
  }

  static getLoginAttempts(timeframe: 'day' | 'week' = 'day'): MetricSummary {
    const events = EventLogger.getEvents(1000, 'auth');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeframe === 'day' ? 1 : 7));
    
    const recentEvents = events.filter(e => e.timestamp >= cutoff);
    const loginAttempts = recentEvents.filter(e => e.type === 'login_attempt').length;
    const loginSuccess = recentEvents.filter(e => e.type === 'login_success').length;
    const loginFailed = recentEvents.filter(e => e.type === 'login_failed').length;
    
    return {
      total: loginAttempts,
      success: loginSuccess,
      failure: loginFailed,
      successRate: loginAttempts > 0 ? (loginSuccess / loginAttempts) * 100 : 0,
      trend: 'stable'
    };
  }

  private static calculateTrend(currentRate: number, timeframe: 'day' | 'week'): 'up' | 'down' | 'stable' {
    // Simple trend calculation - in production would compare with previous period
    if (currentRate > 85) return 'up';
    if (currentRate < 70) return 'down';
    return 'stable';
  }
}

export class DealMetricsService {
  static getDealMetrics(timeframe: 'day' | 'week' = 'day'): {
    created: number;
    completed: number;
    cancelled: number;
    escrowVsStandard: { escrow: number; standard: number };
  } {
    const events = EventLogger.getEvents(1000, 'deal');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeframe === 'day' ? 1 : 7));
    
    const recentEvents = events.filter(e => e.timestamp >= cutoff);
    
    return {
      created: recentEvents.filter(e => e.type === 'deal_created').length,
      completed: recentEvents.filter(e => e.type === 'deal_completed').length,
      cancelled: recentEvents.filter(e => e.type === 'deal_cancelled').length,
      escrowVsStandard: {
        escrow: recentEvents.filter(e => e.type === 'deal_created' && e.metadata.dealType === 'escrow').length,
        standard: recentEvents.filter(e => e.type === 'deal_created' && e.metadata.dealType === 'standard').length
      }
    };
  }

  static getDealStateTransitions(): Record<string, number> {
    const events = EventLogger.getEvents(500, 'deal');
    const transitions: Record<string, number> = {};
    
    events.forEach(event => {
      if (event.type === 'deal_state_change') {
        const transition = `${event.metadata.fromState}_to_${event.metadata.toState}`;
        transitions[transition] = (transitions[transition] || 0) + 1;
      }
    });
    
    return transitions;
  }
}

export class CallMetricsService {
  static getCallMetrics(timeframe: 'day' | 'week' = 'day'): {
    totalCalls: number;
    completedCalls: number;
    droppedCalls: number;
    averageDuration: number;
    dropRate: number;
    flaggedCalls: number;
  } {
    const events = EventLogger.getEvents(1000, 'call');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeframe === 'day' ? 1 : 7));
    
    const recentEvents = events.filter(e => e.timestamp >= cutoff);
    
    const totalCalls = recentEvents.filter(e => e.type === 'call_started').length;
    const completedCalls = recentEvents.filter(e => e.type === 'call_ended').length;
    const droppedCalls = recentEvents.filter(e => e.type === 'call_dropped').length;
    const flaggedCalls = recentEvents.filter(e => e.type === 'call_flagged').length;
    
    // Calculate average duration from completed calls
    const durationEvents = recentEvents.filter(e => e.type === 'call_ended' && e.metadata.duration);
    const totalDuration = durationEvents.reduce((sum, e) => sum + (e.metadata.duration || 0), 0);
    const averageDuration = durationEvents.length > 0 ? totalDuration / durationEvents.length : 0;
    
    return {
      totalCalls,
      completedCalls,
      droppedCalls,
      averageDuration,
      dropRate: totalCalls > 0 ? (droppedCalls / totalCalls) * 100 : 0,
      flaggedCalls
    };
  }

  static getCallTypeDistribution(): Record<string, number> {
    const events = EventLogger.getEvents(500, 'call');
    const distribution: Record<string, number> = {};
    
    events.forEach(event => {
      if (event.type === 'call_started' && event.metadata.callType) {
        const callType = event.metadata.callType;
        distribution[callType] = (distribution[callType] || 0) + 1;
      }
    });
    
    return distribution;
  }
}

export class PaymentMetricsService {
  static getPaymentMetrics(timeframe: 'day' | 'week' = 'day'): {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    successRate: number;
    providerHealth: { flutterwave: number; paystack: number };
  } {
    const events = EventLogger.getEvents(1000, 'payment');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (timeframe === 'day' ? 1 : 7));
    
    const recentEvents = events.filter(e => e.timestamp >= cutoff);
    
    const totalTransactions = recentEvents.filter(e => e.type === 'payment_initiated').length;
    const successfulTransactions = recentEvents.filter(e => e.type === 'payment_success').length;
    const failedTransactions = recentEvents.filter(e => e.type === 'payment_failed').length;
    
    // Provider health (success rate per provider)
    const flutterwaveEvents = recentEvents.filter(e => e.metadata.provider === 'flutterwave');
    const paystackEvents = recentEvents.filter(e => e.metadata.provider === 'paystack');
    
    const flutterwaveSuccess = flutterwaveEvents.filter(e => e.type === 'payment_success').length;
    const paystackSuccess = paystackEvents.filter(e => e.type === 'payment_success').length;
    
    return {
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      successRate: totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0,
      providerHealth: {
        flutterwave: flutterwaveEvents.length > 0 ? (flutterwaveSuccess / flutterwaveEvents.length) * 100 : 0,
        paystack: paystackEvents.length > 0 ? (paystackSuccess / paystackEvents.length) * 100 : 0
      }
    };
  }
}

export class FraudMetricsService {
  static getFraudMetrics(): {
    riskDistribution: { low: number; medium: number; high: number };
    flaggedUsers: number;
    suspiciousActivities: number;
    ruleTriggered: Record<string, number>;
  } {
    const events = EventLogger.getEvents(1000, 'fraud');
    
    const riskDistribution = { low: 0, medium: 0, high: 0 };
    const ruleTriggered: Record<string, number> = {};
    
    events.forEach(event => {
      if (event.type === 'risk_score_updated' && event.metadata.riskLevel) {
        const level = event.metadata.riskLevel as keyof typeof riskDistribution;
        if (level in riskDistribution) {
          riskDistribution[level]++;
        }
      }
      
      if (event.type === 'fraud_rule_triggered' && event.metadata.ruleName) {
        const rule = event.metadata.ruleName;
        ruleTriggered[rule] = (ruleTriggered[rule] || 0) + 1;
      }
    });
    
    return {
      riskDistribution,
      flaggedUsers: events.filter(e => e.type === 'user_flagged').length,
      suspiciousActivities: events.filter(e => e.severity === 'warning' || e.severity === 'error').length,
      ruleTriggered
    };
  }
}