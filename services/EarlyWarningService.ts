import { EventLogger } from './EventLogger';
import { AuthMetricsService, CallMetricsService, PaymentMetricsService, FraudMetricsService } from './MetricsServices';

export interface WarningThreshold {
  name: string;
  category: 'auth' | 'call' | 'payment' | 'fraud' | 'system';
  severity: 'warning' | 'critical';
  threshold: number;
  unit: 'percentage' | 'count' | 'rate';
  description: string;
}

export interface SystemWarning {
  id: string;
  threshold: WarningThreshold;
  currentValue: number;
  triggered: boolean;
  timestamp: Date;
  metadata: Record<string, any>;
}

export class EarlyWarningService {
  // WARNING THRESHOLDS (CONSTANTS ONLY - NO AUTOMATION)
  private static readonly THRESHOLDS: WarningThreshold[] = [
    {
      name: 'otp_failure_spike',
      category: 'auth',
      severity: 'warning',
      threshold: 30, // 30% failure rate
      unit: 'percentage',
      description: 'OTP failure rate exceeds normal levels'
    },
    {
      name: 'otp_failure_critical',
      category: 'auth', 
      severity: 'critical',
      threshold: 50, // 50% failure rate
      unit: 'percentage',
      description: 'Critical OTP failure rate - possible system issue'
    },
    {
      name: 'call_drop_rate_high',
      category: 'call',
      severity: 'warning',
      threshold: 20, // 20% drop rate
      unit: 'percentage',
      description: 'Call drop rate higher than normal'
    },
    {
      name: 'call_abuse_surge',
      category: 'call',
      severity: 'warning',
      threshold: 10, // 10 flagged calls
      unit: 'count',
      description: 'Unusual number of flagged calls'
    },
    {
      name: 'payment_failure_surge',
      category: 'payment',
      severity: 'critical',
      threshold: 40, // 40% failure rate
      unit: 'percentage',
      description: 'Payment failure rate critically high'
    },
    {
      name: 'fraud_score_clustering',
      category: 'fraud',
      severity: 'warning',
      threshold: 15, // 15 high-risk users
      unit: 'count',
      description: 'Unusual clustering of high fraud risk scores'
    },
    {
      name: 'system_error_spike',
      category: 'system',
      severity: 'critical',
      threshold: 50, // 50 errors
      unit: 'count',
      description: 'System error count exceeds normal levels'
    }
  ];

  private static warnings: SystemWarning[] = [];

  static checkAllThresholds(): SystemWarning[] {
    const currentWarnings: SystemWarning[] = [];

    this.THRESHOLDS.forEach(threshold => {
      const warning = this.checkThreshold(threshold);
      if (warning) {
        currentWarnings.push(warning);
      }
    });

    // Store warnings for history
    this.warnings.push(...currentWarnings);

    // Keep only last 1000 warnings
    if (this.warnings.length > 1000) {
      this.warnings.splice(0, this.warnings.length - 1000);
    }

    return currentWarnings;
  }

  private static checkThreshold(threshold: WarningThreshold): SystemWarning | null {
    let currentValue = 0;
    let triggered = false;
    const metadata: Record<string, any> = {};

    try {
      switch (threshold.name) {
        case 'otp_failure_spike':
        case 'otp_failure_critical':
          const otpMetrics = AuthMetricsService.getOTPMetrics('day');
          currentValue = 100 - otpMetrics.successRate; // Failure rate
          triggered = currentValue >= threshold.threshold;
          metadata.totalOTPs = otpMetrics.total;
          metadata.successRate = otpMetrics.successRate;
          break;

        case 'call_drop_rate_high':
          const callMetrics = CallMetricsService.getCallMetrics('day');
          currentValue = callMetrics.dropRate;
          triggered = currentValue >= threshold.threshold;
          metadata.totalCalls = callMetrics.totalCalls;
          metadata.droppedCalls = callMetrics.droppedCalls;
          break;

        case 'call_abuse_surge':
          const callAbuseMetrics = CallMetricsService.getCallMetrics('day');
          currentValue = callAbuseMetrics.flaggedCalls;
          triggered = currentValue >= threshold.threshold;
          metadata.flaggedCalls = callAbuseMetrics.flaggedCalls;
          break;

        case 'payment_failure_surge':
          const paymentMetrics = PaymentMetricsService.getPaymentMetrics('day');
          currentValue = 100 - paymentMetrics.successRate; // Failure rate
          triggered = currentValue >= threshold.threshold;
          metadata.totalTransactions = paymentMetrics.totalTransactions;
          metadata.successRate = paymentMetrics.successRate;
          break;

        case 'fraud_score_clustering':
          const fraudMetrics = FraudMetricsService.getFraudMetrics();
          currentValue = fraudMetrics.riskDistribution.high;
          triggered = currentValue >= threshold.threshold;
          metadata.riskDistribution = fraudMetrics.riskDistribution;
          break;

        case 'system_error_spike':
          const errorEvents = EventLogger.getEvents(1000).filter(e => 
            e.severity === 'error' || e.severity === 'critical'
          );
          const last24Hours = new Date();
          last24Hours.setDate(last24Hours.getDate() - 1);
          currentValue = errorEvents.filter(e => e.timestamp >= last24Hours).length;
          triggered = currentValue >= threshold.threshold;
          metadata.errorCount = currentValue;
          break;
      }

      if (triggered) {
        const warning: SystemWarning = {
          id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          threshold,
          currentValue,
          triggered,
          timestamp: new Date(),
          metadata
        };

        // Log warning (NO AUTOMATION - VISIBILITY ONLY)
        EventLogger.logEvent(
          'threshold_exceeded',
          'system',
          threshold.severity,
          {
            thresholdName: threshold.name,
            currentValue,
            thresholdValue: threshold.threshold,
            ...metadata
          }
        );

        console.warn(`[EARLY WARNING] ${threshold.name}: ${currentValue}${threshold.unit === 'percentage' ? '%' : ''} (threshold: ${threshold.threshold}${threshold.unit === 'percentage' ? '%' : ''})`);

        return warning;
      }
    } catch (error) {
      console.error(`[EARLY WARNING] Error checking threshold ${threshold.name}:`, error);
    }

    return null;
  }

  static getActiveWarnings(): SystemWarning[] {
    const last24Hours = new Date();
    last24Hours.setDate(last24Hours.getDate() - 1);
    
    return this.warnings.filter(warning => 
      warning.triggered && warning.timestamp >= last24Hours
    );
  }

  static getWarningHistory(limit: number = 50): SystemWarning[] {
    return this.warnings
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  static getWarningsByCategory(category: WarningThreshold['category']): SystemWarning[] {
    return this.warnings.filter(warning => warning.threshold.category === category);
  }

  static getSystemHealthScore(): {
    score: number; // 0-100
    status: 'healthy' | 'warning' | 'critical';
    activeWarnings: number;
    criticalWarnings: number;
  } {
    const activeWarnings = this.getActiveWarnings();
    const criticalWarnings = activeWarnings.filter(w => w.threshold.severity === 'critical');
    
    let score = 100;
    
    // Deduct points for warnings
    score -= activeWarnings.length * 10;
    score -= criticalWarnings.length * 20;
    
    score = Math.max(0, score);
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalWarnings.length > 0) {
      status = 'critical';
    } else if (activeWarnings.length > 0) {
      status = 'warning';
    }
    
    return {
      score,
      status,
      activeWarnings: activeWarnings.length,
      criticalWarnings: criticalWarnings.length
    };
  }

  // READ-ONLY threshold information
  static getThresholds(): WarningThreshold[] {
    return [...this.THRESHOLDS];
  }

  static getThresholdByName(name: string): WarningThreshold | undefined {
    return this.THRESHOLDS.find(t => t.name === name);
  }
}