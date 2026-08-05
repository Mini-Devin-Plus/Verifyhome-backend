import { OTPSession, OTPAuditLog } from '../types/database';

// Mock storage for OTP sessions and audit logs
const mockOTPSessions: OTPSession[] = [];
const mockOTPAuditLogs: OTPAuditLog[] = [];

// Rate limiting storage (phone + IP)
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

// OTP Configuration
const OTP_CONFIG = {
  length: 6,
  expiryMinutes: 3, // 3 minutes
  maxAttempts: 5,
  rateLimitWindow: 60000, // 1 minute
  maxRequestsPerWindow: 3,
};

// TERMII Configuration (mock for now)
const TERMII_CONFIG = {
  apiKey: 'mock_termii_api_key',
  senderId: 'VerifyHome',
  baseUrl: 'https://api.ng.termii.com/api',
};

export class OTPService {
  
  // Generate OTP (6-digit numeric)
  private static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hash OTP for secure storage
  private static hashOTP(otp: string): string {
    // Simple hash for demo - in production use proper crypto
    let hash = 0;
    for (let i = 0; i < otp.length; i++) {
      const char = otp.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Rate limiting check
  private static checkRateLimit(phoneNumber: string, ipAddress?: string): boolean {
    const key = `${phoneNumber}:${ipAddress || 'unknown'}`;
    const now = Date.now();
    const limit = rateLimitStore.get(key);

    if (!limit || now > limit.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + OTP_CONFIG.rateLimitWindow });
      return true;
    }

    if (limit.count >= OTP_CONFIG.maxRequestsPerWindow) {
      return false;
    }

    limit.count++;
    return true;
  }

  // Send OTP via Termii (mock implementation)
  private static async sendOTPViTermii(phoneNumber: string, otp: string): Promise<boolean> {
    // Mock Termii API call - SHOW OTP FOR TESTING
    console.log(`\n🔐 [MOCK OTP] Phone: ${phoneNumber}`);
    console.log(`🔐 [MOCK OTP] Code: ${otp}`);
    console.log(`🔐 [MOCK OTP] Use this code to verify\n`);
    
    // In real implementation:
    // const response = await fetch(`${TERMII_CONFIG.baseUrl}/sms/send`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     to: phoneNumber,
    //     from: TERMII_CONFIG.senderId,
    //     sms: `Your VerifyHome OTP is: ${otp}. Valid for ${OTP_CONFIG.expiryMinutes} minutes.`,
    //     type: 'plain',
    //     api_key: TERMII_CONFIG.apiKey,
    //   }),
    // });
    
    // Mock success
    return Promise.resolve(true);
  }

  // Audit log OTP events
  private static async logOTPEvent(
    phoneNumber: string,
    purpose: OTPSession['purpose'],
    action: OTPAuditLog['action'],
    success: boolean,
    attempts: number = 0,
    errorReason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const auditLog: OTPAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phoneNumber,
      purpose,
      action,
      attempts,
      ipAddress,
      userAgent,
      success,
      errorReason,
      timestamp: new Date(),
    };

    mockOTPAuditLogs.push(auditLog);
    console.log(`[OTP AUDIT] ${action} - ${phoneNumber} - ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  // Send OTP
  static async sendOTP(
    phoneNumber: string,
    purpose: OTPSession['purpose'],
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    console.log(`[OTP DEBUG] Starting sendOTP for ${phoneNumber}, purpose: ${purpose}`);
    
    try {
      // Rate limiting check
      if (!this.checkRateLimit(phoneNumber, ipAddress)) {
        console.log(`[OTP DEBUG] Rate limit exceeded for ${phoneNumber}`);
        await this.logOTPEvent(phoneNumber, purpose, 'rate_limited', false, 0, 'Rate limit exceeded', ipAddress, userAgent);
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }

      // Generate OTP
      const otp = this.generateOTP();
      console.log(`[OTP DEBUG] Generated OTP: ${otp}`);
      
      const otpHash = this.hashOTP(otp);
      console.log(`[OTP DEBUG] OTP hash: ${otpHash}`);

      // Create OTP session
      const session: OTPSession = {
        id: `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        phoneNumber,
        otpHash,
        purpose,
        attempts: 0,
        maxAttempts: OTP_CONFIG.maxAttempts,
        expiresAt: new Date(Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000),
        isVerified: false,
        createdAt: new Date(),
        ipAddress,
      };
      
      console.log(`[OTP DEBUG] Created session: ${session.id}`);

      // Send OTP via Termii
      const sent = await this.sendOTPViTermii(phoneNumber, otp);
      console.log(`[OTP DEBUG] Termii send result: ${sent}`);
      
      if (!sent) {
        console.log(`[OTP DEBUG] SMS delivery failed`);
        await this.logOTPEvent(phoneNumber, purpose, 'failed', false, 0, 'SMS delivery failed', ipAddress, userAgent);
        return { success: false, error: 'Failed to send OTP. Please try again.' };
      }

      // Store session
      mockOTPSessions.push(session);
      console.log(`[OTP DEBUG] Session stored. Total sessions: ${mockOTPSessions.length}`);

      // Log success
      await this.logOTPEvent(phoneNumber, purpose, 'sent', true, 0, undefined, ipAddress, userAgent);
      console.log(`[OTP DEBUG] Success! SessionId: ${session.id}`);

      return { success: true, sessionId: session.id };
    } catch (error) {
      console.log(`[OTP DEBUG] Error in sendOTP:`, error);
      await this.logOTPEvent(phoneNumber, purpose, 'failed', false, 0, error instanceof Error ? error.message : 'Unknown error', ipAddress, userAgent);
      return { success: false, error: 'Failed to send OTP. Please try again.' };
    }
  }

  // Verify OTP
  static async verifyOTP(
    sessionId: string,
    otp: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
    console.log(`[OTP VERIFY DEBUG] Starting verification for sessionId: ${sessionId}, otp: ${otp}`);
    console.log(`[OTP VERIFY DEBUG] Total sessions in storage: ${mockOTPSessions.length}`);
    
    try {
      const session = mockOTPSessions.find(s => s.id === sessionId);
      console.log(`[OTP VERIFY DEBUG] Found session:`, session ? 'YES' : 'NO');
      
      if (!session) {
        console.log(`[OTP VERIFY DEBUG] Available session IDs:`, mockOTPSessions.map(s => s.id));
        return { success: false, error: 'Invalid session' };
      }

      console.log(`[OTP VERIFY DEBUG] Session details:`, {
        id: session.id,
        phoneNumber: session.phoneNumber,
        isVerified: session.isVerified,
        attempts: session.attempts,
        maxAttempts: session.maxAttempts,
        expiresAt: session.expiresAt,
        now: new Date()
      });

      // Check if already verified
      if (session.isVerified) {
        console.log(`[OTP VERIFY DEBUG] Session already verified`);
        return { success: false, error: 'OTP already verified' };
      }

      // Check expiry
      if (new Date() > session.expiresAt) {
        console.log(`[OTP VERIFY DEBUG] Session expired`);
        await this.logOTPEvent(session.phoneNumber, session.purpose, 'expired', false, session.attempts, 'OTP expired', ipAddress, userAgent);
        return { success: false, error: 'OTP expired' };
      }

      // Check max attempts
      if (session.attempts >= session.maxAttempts) {
        console.log(`[OTP VERIFY DEBUG] Max attempts exceeded`);
        await this.logOTPEvent(session.phoneNumber, session.purpose, 'failed', false, session.attempts, 'Max attempts exceeded', ipAddress, userAgent);
        return { success: false, error: 'Maximum attempts exceeded' };
      }

      // Increment attempts
      session.attempts++;
      console.log(`[OTP VERIFY DEBUG] Incremented attempts to: ${session.attempts}`);

      // Verify OTP
      const otpHash = this.hashOTP(otp);
      console.log(`[OTP VERIFY DEBUG] Input OTP hash: ${otpHash}`);
      console.log(`[OTP VERIFY DEBUG] Stored OTP hash: ${session.otpHash}`);
      console.log(`[OTP VERIFY DEBUG] Hashes match:`, otpHash === session.otpHash);
      
      if (otpHash !== session.otpHash) {
        console.log(`[OTP VERIFY DEBUG] Invalid OTP - hashes don't match`);
        await this.logOTPEvent(session.phoneNumber, session.purpose, 'failed', false, session.attempts, 'Invalid OTP', ipAddress, userAgent);
        return { success: false, error: 'Invalid OTP' };
      }

      // Mark as verified
      session.isVerified = true;
      session.verifiedAt = new Date();
      console.log(`[OTP VERIFY DEBUG] Session marked as verified`);

      // Log success
      await this.logOTPEvent(session.phoneNumber, session.purpose, 'verified', true, session.attempts, undefined, ipAddress, userAgent);
      console.log(`[OTP VERIFY DEBUG] Verification successful for phone: ${session.phoneNumber}`);

      return { success: true, phoneNumber: session.phoneNumber };
    } catch (error) {
      console.log(`[OTP VERIFY DEBUG] Exception in verifyOTP:`, error);
      return { success: false, error: 'Verification failed. Please try again.' };
    }
  }

  // Get OTP session
  static async getOTPSession(sessionId: string): Promise<OTPSession | null> {
    const session = mockOTPSessions.find(s => s.id === sessionId);
    return Promise.resolve(session || null);
  }

  // Clean expired sessions (maintenance)
  static async cleanExpiredSessions(): Promise<number> {
    const now = new Date();
    const initialCount = mockOTPSessions.length;
    
    // Remove expired sessions
    for (let i = mockOTPSessions.length - 1; i >= 0; i--) {
      if (mockOTPSessions[i].expiresAt < now) {
        mockOTPSessions.splice(i, 1);
      }
    }

    const cleaned = initialCount - mockOTPSessions.length;
    console.log(`[OTP CLEANUP] Removed ${cleaned} expired sessions`);
    return cleaned;
  }

  // Get audit logs (admin only)
  static async getAuditLogs(
    phoneNumber?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<OTPAuditLog[]> {
    let logs = [...mockOTPAuditLogs];

    if (phoneNumber) {
      logs = logs.filter(log => log.phoneNumber === phoneNumber);
    }

    if (startDate) {
      logs = logs.filter(log => log.timestamp >= startDate);
    }

    if (endDate) {
      logs = logs.filter(log => log.timestamp <= endDate);
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return logs.slice(0, limit);
  }
}