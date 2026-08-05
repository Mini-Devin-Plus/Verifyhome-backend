import { OTPSession } from '../types/database';
import { FeatureFlagService } from './FeatureFlagService';

// Enhanced OTP types for multi-factor authentication
export interface OTPDeliveryMethod {
  type: 'sms' | 'email';
  destination: string;
  provider: 'termii' | 'sendgrid' | 'aws_ses';
}

export interface OTPRateLimit {
  userId: string;
  attempts: number;
  lastAttempt: Date;
  blockedUntil?: Date;
}

export interface OTPFallbackConfig {
  maxSMSRetries: number;
  fallbackToEmail: boolean;
  cooldownPeriod: number; // minutes
  maxDailyAttempts: number;
}

export class EnhancedOTPService {
  private static rateLimits: Map<string, OTPRateLimit> = new Map();
  private static activeSessions: Map<string, OTPSession> = new Map();
  
  private static readonly FALLBACK_CONFIG: OTPFallbackConfig = {
    maxSMSRetries: 3,
    fallbackToEmail: true,
    cooldownPeriod: 15,
    maxDailyAttempts: 10
  };

  // Enhanced OTP generation with multi-factor support
  static async generateOTP(
    phoneNumber: string,
    email?: string,
    purpose: 'login' | 'signup' | 'admin_action' | 'deal_confirmation' = 'login'
  ): Promise<{ success: boolean; sessionId?: string; fallbackUsed?: boolean; error?: string }> {
    try {
      // Check rate limits
      const rateLimitCheck = this.checkRateLimit(phoneNumber);
      if (!rateLimitCheck.allowed) {
        return { success: false, error: rateLimitCheck.reason };
      }

      // Generate OTP code
      const otpCode = this.generateSecureOTP();
      const sessionId = `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create OTP session
      const session: OTPSession = {
        id: sessionId,
        phoneNumber,
        email,
        hashedOTP: await this.hashOTP(otpCode),
        purpose,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        attempts: 0,
        verified: false
      };

      // Try SMS delivery first
      let deliveryResult = await this.deliverSMS(phoneNumber, otpCode, purpose);
      let fallbackUsed = false;

      // Fallback to email if SMS fails and email OTP is enabled
      if (!deliveryResult.success && email && FeatureFlagService.getFlags().emailOTPFallback) {
        console.log('[OTP] SMS failed, attempting email fallback');
        deliveryResult = await this.deliverEmail(email, otpCode, purpose);
        fallbackUsed = true;
      }

      if (!deliveryResult.success) {
        this.updateRateLimit(phoneNumber, false);
        return { success: false, error: 'Failed to deliver OTP via SMS and email' };
      }

      // Store session
      this.activeSessions.set(sessionId, session);
      this.updateRateLimit(phoneNumber, true);

      // Log security event
      this.logSecurityEvent('otp_generated', phoneNumber, {
        purpose,
        fallbackUsed,
        deliveryMethod: fallbackUsed ? 'email' : 'sms'
      });

      return { success: true, sessionId, fallbackUsed };
    } catch (error) {
      console.error('[OTP] Generation failed:', error);
      return { success: false, error: 'OTP generation failed' };
    }
  }

  // Enhanced OTP verification with security checks
  static async verifyOTP(
    sessionId: string,
    otpCode: string,
    clientIP?: string
  ): Promise<{ success: boolean; session?: OTPSession; error?: string }> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        this.logSecurityEvent('otp_invalid_session', '', { sessionId, clientIP });
        return { success: false, error: 'Invalid or expired session' };
      }

      // Check expiration
      if (new Date() > session.expiresAt) {
        this.activeSessions.delete(sessionId);
        this.logSecurityEvent('otp_expired', session.phoneNumber, { sessionId, clientIP });
        return { success: false, error: 'OTP expired' };
      }

      // Check attempt limits
      if (session.attempts >= 3) {
        this.activeSessions.delete(sessionId);
        this.logSecurityEvent('otp_max_attempts', session.phoneNumber, { sessionId, clientIP });
        return { success: false, error: 'Maximum attempts exceeded' };
      }

      // Verify OTP
      session.attempts++;
      const isValid = await this.verifyHashedOTP(otpCode, session.hashedOTP);
      
      if (!isValid) {
        this.logSecurityEvent('otp_invalid_code', session.phoneNumber, { 
          sessionId, 
          clientIP, 
          attempts: session.attempts 
        });
        return { success: false, error: 'Invalid OTP code' };
      }

      // Mark as verified
      session.verified = true;
      session.verifiedAt = new Date();

      this.logSecurityEvent('otp_verified', session.phoneNumber, { 
        sessionId, 
        clientIP, 
        purpose: session.purpose 
      });

      return { success: true, session };
    } catch (error) {
      console.error('[OTP] Verification failed:', error);
      return { success: false, error: 'OTP verification failed' };
    }
  }

  // Rate limiting implementation
  private static checkRateLimit(phoneNumber: string): { allowed: boolean; reason?: string } {
    const limit = this.rateLimits.get(phoneNumber);
    const now = new Date();

    if (!limit) {
      return { allowed: true };
    }

    // Check if user is temporarily blocked
    if (limit.blockedUntil && now < limit.blockedUntil) {
      const remainingMinutes = Math.ceil((limit.blockedUntil.getTime() - now.getTime()) / 60000);
      return { 
        allowed: false, 
        reason: `Too many attempts. Try again in ${remainingMinutes} minutes` 
      };
    }

    // Check daily limit
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (limit.lastAttempt >= dayStart && limit.attempts >= this.FALLBACK_CONFIG.maxDailyAttempts) {
      return { 
        allowed: false, 
        reason: 'Daily OTP limit exceeded. Try again tomorrow' 
      };
    }

    return { allowed: true };
  }

  private static updateRateLimit(phoneNumber: string, success: boolean): void {
    const now = new Date();
    const existing = this.rateLimits.get(phoneNumber);
    
    if (!existing) {
      this.rateLimits.set(phoneNumber, {
        userId: phoneNumber,
        attempts: 1,
        lastAttempt: now
      });
      return;
    }

    // Reset daily counter if new day
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (existing.lastAttempt < dayStart) {
      existing.attempts = 1;
    } else {
      existing.attempts++;
    }

    existing.lastAttempt = now;

    // Block user if too many failed attempts
    if (!success && existing.attempts >= 5) {
      existing.blockedUntil = new Date(now.getTime() + this.FALLBACK_CONFIG.cooldownPeriod * 60000);
    }
  }

  // SMS delivery via Termii
  private static async deliverSMS(
    phoneNumber: string, 
    otpCode: string, 
    purpose: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Mock Termii SMS delivery
      console.log(`[TERMII SMS] Sending OTP ${otpCode} to ${phoneNumber} for ${purpose}`);
      
      // Simulate network delay and potential failure
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate 95% success rate
      const success = Math.random() > 0.05;
      
      if (!success) {
        return { success: false, error: 'SMS delivery failed' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'SMS service unavailable' };
    }
  }

  // Email delivery fallback
  private static async deliverEmail(
    email: string, 
    otpCode: string, 
    purpose: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!FeatureFlagService.getFlags().emailOTPFallback) {
        return { success: false, error: 'Email OTP not enabled' };
      }

      // Mock email delivery (SendGrid/AWS SES)
      console.log(`[EMAIL OTP] Sending OTP ${otpCode} to ${email} for ${purpose}`);
      
      // Simulate email delivery
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Email typically more reliable than SMS
      const success = Math.random() > 0.02;
      
      if (!success) {
        return { success: false, error: 'Email delivery failed' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Email service unavailable' };
    }
  }

  // Security utilities
  private static generateSecureOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private static async hashOTP(otp: string): Promise<string> {
    // Simple hash for React Native compatibility
    return btoa(otp + 'verifyhome_salt');
  }

  private static async verifyHashedOTP(otp: string, hash: string): Promise<boolean> {
    const expectedHash = await this.hashOTP(otp);
    return expectedHash === hash;
  }

  private static logSecurityEvent(
    event: string, 
    phoneNumber: string, 
    metadata: Record<string, any>
  ): void {
    console.log(`[SECURITY] ${event}:`, {
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), // Mask phone number
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  // Cleanup expired sessions
  static cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Get active session for admin verification
  static getActiveSession(sessionId: string): OTPSession | null {
    return this.activeSessions.get(sessionId) || null;
  }
}