import { PaymentIntent } from '../types/database';
import { FeatureFlagService } from './FeatureFlagService';

export interface PaymentProvider {
  name: 'flutterwave' | 'paystack';
  available: boolean;
  lastCheck: Date;
  failureCount: number;
}

export interface PaymentSecurityCheck {
  transactionId: string;
  riskScore: number; // 0-100
  flags: string[];
  approved: boolean;
  reason?: string;
}

export interface PaymentAnomalyAlert {
  id: string;
  type: 'duplicate' | 'velocity' | 'amount_anomaly' | 'geo_anomaly' | 'device_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  transactionId: string;
  description: string;
  createdAt: Date;
}

export class PaymentSecurityService {
  private static providers: Map<string, PaymentProvider> = new Map([
    ['flutterwave', { name: 'flutterwave', available: true, lastCheck: new Date(), failureCount: 0 }],
    ['paystack', { name: 'paystack', available: true, lastCheck: new Date(), failureCount: 0 }]
  ]);
  
  private static recentTransactions: Map<string, PaymentIntent[]> = new Map();
  private static anomalyAlerts: PaymentAnomalyAlert[] = [];

  // Enhanced payment processing with failover
  static async processPayment(
    paymentIntent: PaymentIntent,
    userMetadata: {
      userId: string;
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ success: boolean; provider?: string; securityCheck?: PaymentSecurityCheck; error?: string }> {
    try {
      // Pre-payment security checks
      const securityCheck = await this.performSecurityChecks(paymentIntent, userMetadata);
      
      if (!securityCheck.approved) {
        this.logSecurityEvent('payment_blocked', userMetadata.userId, {
          transactionId: paymentIntent.id,
          reason: securityCheck.reason,
          riskScore: securityCheck.riskScore
        });
        return { 
          success: false, 
          error: securityCheck.reason || 'Payment blocked for security reasons',
          securityCheck 
        };
      }

      // Attempt payment with primary provider (Flutterwave)
      let result = await this.attemptPayment('flutterwave', paymentIntent);
      
      // Failover to Paystack if enabled and Flutterwave fails
      if (!result.success && FeatureFlagService.getFlags().paystackFallback) {
        console.log('[PAYMENT] Flutterwave failed, attempting Paystack failover');
        result = await this.attemptPayment('paystack', paymentIntent);
      }

      if (result.success) {
        // Track successful transaction
        this.trackTransaction(userMetadata.userId, paymentIntent);
        
        this.logSecurityEvent('payment_success', userMetadata.userId, {
          transactionId: paymentIntent.id,
          provider: result.provider,
          amount: paymentIntent.amount,
          riskScore: securityCheck.riskScore
        });
      } else {
        this.logSecurityEvent('payment_failed', userMetadata.userId, {
          transactionId: paymentIntent.id,
          error: result.error,
          riskScore: securityCheck.riskScore
        });
      }

      return { ...result, securityCheck };
    } catch (error) {
      console.error('[PAYMENT SECURITY] Processing failed:', error);
      return { success: false, error: 'Payment processing failed' };
    }
  }

  // Security checks for fraud prevention
  private static async performSecurityChecks(
    paymentIntent: PaymentIntent,
    userMetadata: { userId: string; deviceId?: string; ipAddress?: string }
  ): Promise<PaymentSecurityCheck> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check for duplicate transactions
    const duplicateCheck = this.checkDuplicateTransaction(paymentIntent, userMetadata.userId);
    if (duplicateCheck.isDuplicate) {
      flags.push('duplicate_transaction');
      riskScore += 50;
    }

    // Check transaction velocity (too many transactions in short time)
    const velocityCheck = this.checkTransactionVelocity(userMetadata.userId);
    if (velocityCheck.suspicious) {
      flags.push('high_velocity');
      riskScore += 30;
    }

    // Check amount anomalies
    const amountCheck = this.checkAmountAnomaly(paymentIntent, userMetadata.userId);
    if (amountCheck.anomalous) {
      flags.push('amount_anomaly');
      riskScore += 25;
    }

    // Device/IP checks (basic implementation)
    if (userMetadata.deviceId && this.isNewDevice(userMetadata.userId, userMetadata.deviceId)) {
      flags.push('new_device');
      riskScore += 15;
    }

    // Generate alerts for high-risk transactions
    if (riskScore >= 70) {
      await this.createAnomalyAlert({
        type: 'velocity',
        severity: riskScore >= 90 ? 'critical' : 'high',
        userId: userMetadata.userId,
        transactionId: paymentIntent.id,
        description: `High-risk transaction detected. Flags: ${flags.join(', ')}`
      });
    }

    return {
      transactionId: paymentIntent.id,
      riskScore,
      flags,
      approved: riskScore < 80, // Block transactions with risk score >= 80
      reason: riskScore >= 80 ? 'Transaction blocked due to high fraud risk' : undefined
    };
  }

  // Attempt payment with specific provider
  private static async attemptPayment(
    providerName: 'flutterwave' | 'paystack',
    paymentIntent: PaymentIntent
  ): Promise<{ success: boolean; provider?: string; error?: string }> {
    try {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.available) {
        return { success: false, error: `${providerName} unavailable` };
      }

      // Mock payment processing
      console.log(`[${providerName.toUpperCase()}] Processing payment:`, paymentIntent.id);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate provider-specific success rates
      const successRate = providerName === 'flutterwave' ? 0.95 : 0.92;
      const success = Math.random() < successRate;
      
      if (success) {
        provider.failureCount = 0;
        provider.lastCheck = new Date();
        return { success: true, provider: providerName };
      } else {
        provider.failureCount++;
        provider.lastCheck = new Date();
        
        // Mark provider as unavailable after 3 consecutive failures
        if (provider.failureCount >= 3) {
          provider.available = false;
          console.warn(`[PAYMENT] ${providerName} marked as unavailable`);
        }
        
        return { success: false, error: `${providerName} processing failed` };
      }
    } catch (error) {
      return { success: false, error: `${providerName} error: ${error}` };
    }
  }

  // Fraud detection checks
  private static checkDuplicateTransaction(
    paymentIntent: PaymentIntent,
    userId: string
  ): { isDuplicate: boolean; originalTransaction?: string } {
    const userTransactions = this.recentTransactions.get(userId) || [];
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const duplicate = userTransactions.find(tx => 
      tx.amount === paymentIntent.amount &&
      tx.dealId === paymentIntent.dealId &&
      tx.createdAt > fiveMinutesAgo
    );
    
    return {
      isDuplicate: !!duplicate,
      originalTransaction: duplicate?.id
    };
  }

  private static checkTransactionVelocity(userId: string): { suspicious: boolean; count: number } {
    const userTransactions = this.recentTransactions.get(userId) || [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentCount = userTransactions.filter(tx => tx.createdAt > oneHourAgo).length;
    
    return {
      suspicious: recentCount >= 5, // More than 5 transactions in 1 hour
      count: recentCount
    };
  }

  private static checkAmountAnomaly(
    paymentIntent: PaymentIntent,
    userId: string
  ): { anomalous: boolean; reason?: string } {
    const userTransactions = this.recentTransactions.get(userId) || [];
    
    if (userTransactions.length === 0) {
      return { anomalous: false };
    }
    
    const avgAmount = userTransactions.reduce((sum, tx) => sum + tx.amount, 0) / userTransactions.length;
    const deviation = Math.abs(paymentIntent.amount - avgAmount) / avgAmount;
    
    // Flag if amount is 5x higher than average
    if (deviation > 4) {
      return { 
        anomalous: true, 
        reason: `Amount significantly higher than user's average (${deviation.toFixed(1)}x)` 
      };
    }
    
    return { anomalous: false };
  }

  private static isNewDevice(userId: string, deviceId: string): boolean {
    // Simple check - in production, maintain device history
    return Math.random() < 0.1; // 10% chance of new device
  }

  // Transaction tracking
  private static trackTransaction(userId: string, paymentIntent: PaymentIntent): void {
    const userTransactions = this.recentTransactions.get(userId) || [];
    userTransactions.push(paymentIntent);
    
    // Keep only last 50 transactions per user
    if (userTransactions.length > 50) {
      userTransactions.splice(0, userTransactions.length - 50);
    }
    
    this.recentTransactions.set(userId, userTransactions);
  }

  // Anomaly alert system
  private static async createAnomalyAlert(alert: Omit<PaymentAnomalyAlert, 'id' | 'createdAt'>): Promise<void> {
    const anomalyAlert: PaymentAnomalyAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      ...alert
    };
    
    this.anomalyAlerts.push(anomalyAlert);
    
    // Keep only last 1000 alerts
    if (this.anomalyAlerts.length > 1000) {
      this.anomalyAlerts.splice(0, this.anomalyAlerts.length - 1000);
    }
    
    console.warn('[PAYMENT ANOMALY]', anomalyAlert);
    
    // In production, send to monitoring system
    if (anomalyAlert.severity === 'critical') {
      console.error('[CRITICAL PAYMENT ALERT]', anomalyAlert);
    }
  }

  // Provider health monitoring
  static async checkProviderHealth(): Promise<void> {
    for (const [name, provider] of this.providers.entries()) {
      if (!provider.available) {
        // Try to restore provider after 30 minutes
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        if (provider.lastCheck < thirtyMinutesAgo) {
          provider.available = true;
          provider.failureCount = 0;
          console.log(`[PAYMENT] Restored ${name} provider`);
        }
      }
    }
  }

  // Security event logging
  private static logSecurityEvent(
    event: string,
    userId: string,
    metadata: Record<string, any>
  ): void {
    console.log(`[PAYMENT SECURITY] ${event}:`, {
      userId: userId.replace(/(.{4}).*(.{4})/, '$1***$2'), // Mask user ID
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  // Admin methods
  static getAnomalyAlerts(severity?: string): PaymentAnomalyAlert[] {
    if (severity) {
      return this.anomalyAlerts.filter(alert => alert.severity === severity);
    }
    return [...this.anomalyAlerts];
  }

  static getProviderStatus(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }
}