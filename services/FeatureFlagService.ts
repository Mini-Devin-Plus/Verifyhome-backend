// Centralized Feature Flags for MVP Launch Control
export interface MVPFeatureFlags {
  // Core Deal Features (ON for MVP)
  escrowDeals: boolean;
  standardDeals: boolean;
  
  // Communication Features (ON for MVP)
  chat: boolean;
  audioCalls: boolean;
  videoCalls: boolean;
  callScheduling: boolean;
  
  // Enhanced Features (OFF for MVP)
  screenSharing: boolean;
  callRecording: boolean;
  presentationMode: boolean;
  enhancedModeration: boolean;
  schedulingReminders: boolean;
  
  // Fallback Features (OFF for MVP)
  emailOTPFallback: boolean;
  paystackFallback: boolean;
  
  // Observability (ON for MVP)
  observability: boolean;
  
  // Kill Switches (Emergency Controls)
  killSwitches: {
    calls: boolean;
    chat: boolean;
    dealCreation: boolean;
    globalEmergency: boolean;
  };
}

// MVP-Safe Default Configuration
export const MVP_FEATURE_FLAGS: MVPFeatureFlags = {
  // Core features enabled
  escrowDeals: true,
  standardDeals: true,
  
  // Communication enabled
  chat: true,
  audioCalls: true,
  videoCalls: true,
  callScheduling: true,
  
  // Enhanced features disabled for MVP safety
  screenSharing: false,
  callRecording: false,
  presentationMode: false,
  enhancedModeration: false,
  schedulingReminders: false,
  
  // Fallback features disabled
  emailOTPFallback: false,
  paystackFallback: false,
  
  // Observability enabled
  observability: true,
  
  // Kill switches inactive
  killSwitches: {
    calls: false,
    chat: false,
    dealCreation: false,
    globalEmergency: false,
  }
};

// Environment-aware configuration
export class FeatureFlagService {
  private static flags: MVPFeatureFlags = MVP_FEATURE_FLAGS;
  private static environment: 'dev' | 'staging' | 'prod' = 'prod';

  static initialize(env: 'dev' | 'staging' | 'prod' = 'prod'): void {
    this.environment = env;
    
    // Environment-specific overrides
    if (env === 'dev') {
      // Development can enable more features for testing
      this.flags = {
        ...MVP_FEATURE_FLAGS,
        screenSharing: true,
        enhancedModeration: true,
      };
    } else if (env === 'staging') {
      // Staging mirrors production but allows testing
      this.flags = { ...MVP_FEATURE_FLAGS };
    } else {
      // Production uses strict MVP flags
      this.flags = { ...MVP_FEATURE_FLAGS };
    }
    
    console.log(`[FEATURE FLAGS] Initialized for ${env} environment`);
  }

  // Core feature checks
  static isEscrowDealsEnabled(): boolean {
    return this.flags.escrowDeals && !this.flags.killSwitches.globalEmergency;
  }

  static isStandardDealsEnabled(): boolean {
    return this.flags.standardDeals && !this.flags.killSwitches.globalEmergency;
  }

  static isChatEnabled(): boolean {
    return this.flags.chat && !this.flags.killSwitches.chat && !this.flags.killSwitches.globalEmergency;
  }

  static isCallsEnabled(): boolean {
    return (this.flags.audioCalls || this.flags.videoCalls) && 
           !this.flags.killSwitches.calls && 
           !this.flags.killSwitches.globalEmergency;
  }

  static isCallSchedulingEnabled(): boolean {
    return this.flags.callScheduling && this.isCallsEnabled();
  }

  // Enhanced feature checks (MVP disabled)
  static isScreenSharingEnabled(): boolean {
    return this.flags.screenSharing && this.isCallsEnabled();
  }

  static isCallRecordingEnabled(): boolean {
    return this.flags.callRecording && this.isCallsEnabled();
  }

  // Kill switch controls
  static activateKillSwitch(type: keyof MVPFeatureFlags['killSwitches'], adminRole?: string): void {
    // Enforce SUPER_ADMIN requirement for kill switches
    if (adminRole !== 'SUPER_ADMIN') {
      console.error('[KILL SWITCH] Unauthorized kill switch attempt:', { type, adminRole });
      throw new Error('SUPER_ADMIN role required for kill switch control');
    }

    this.flags.killSwitches[type] = true;
    console.warn(`[KILL SWITCH] Activated: ${type} by ${adminRole}`);
  }

  static deactivateKillSwitch(type: keyof MVPFeatureFlags['killSwitches'], adminRole?: string): void {
    // Enforce SUPER_ADMIN requirement for kill switches
    if (adminRole !== 'SUPER_ADMIN') {
      console.error('[KILL SWITCH] Unauthorized kill switch attempt:', { type, adminRole });
      throw new Error('SUPER_ADMIN role required for kill switch control');
    }

    this.flags.killSwitches[type] = false;
    console.log(`[KILL SWITCH] Deactivated: ${type} by ${adminRole}`);
  }

  // Emergency controls
  static emergencyShutdown(adminRole?: string): void {
    // Enforce SUPER_ADMIN requirement for emergency shutdown
    if (adminRole !== 'SUPER_ADMIN') {
      console.error('[EMERGENCY] Unauthorized emergency shutdown attempt:', { adminRole });
      throw new Error('SUPER_ADMIN role required for emergency shutdown');
    }

    this.flags.killSwitches.globalEmergency = true;
    console.error(`[EMERGENCY] Global kill switch activated by ${adminRole}`);
  }

  static getFlags(): MVPFeatureFlags {
    return { ...this.flags };
  }

  static getEnvironment(): string {
    return this.environment;
  }

  // Admin controls for feature flags
  static setFeatureEnabled(feature: string, enabled: boolean, adminRole?: string): void {
    // Enforce SUPER_ADMIN requirement for feature control
    if (adminRole !== 'SUPER_ADMIN') {
      console.error('[FEATURE FLAGS] Unauthorized feature control attempt:', { feature, adminRole });
      throw new Error('SUPER_ADMIN role required for feature control');
    }

    switch (feature) {
      case 'calls':
        this.flags.audioCalls = enabled;
        this.flags.videoCalls = enabled;
        break;
      case 'chat':
        this.flags.chat = enabled;
        break;
      case 'deal_creation':
        this.flags.escrowDeals = enabled;
        this.flags.standardDeals = enabled;
        break;
      case 'payments':
        // Payment flags would be handled here
        break;
      case 'property_listing':
        // Property listing flags would be handled here
        break;
      case 'user_registration':
        // User registration flags would be handled here
        break;
    }
    
    console.log(`[FEATURE FLAGS] ${feature} ${enabled ? 'enabled' : 'disabled'} by admin (${adminRole})`);
  }

  static getAllFeatureStates(): Record<string, boolean> {
    return {
      calls: this.isCallsEnabled(),
      chat: this.isChatEnabled(),
      deal_creation: this.isEscrowDealsEnabled() || this.isStandardDealsEnabled(),
      payments: true, // Mock - would check actual payment flags
      property_listing: true, // Mock - would check actual property flags
      user_registration: true, // Mock - would check actual registration flags
      screen_sharing: this.isScreenSharingEnabled(),
      call_recording: this.isCallRecordingEnabled(),
      call_scheduling: this.isCallSchedulingEnabled()
    };
  }

  // Defensive feature validation
  static validateFeatureAccess(feature: string): { allowed: boolean; reason?: string } {
    if (this.flags.killSwitches.globalEmergency) {
      return { allowed: false, reason: 'System temporarily unavailable' };
    }

    switch (feature) {
      case 'deal_creation':
        if (this.flags.killSwitches.dealCreation) {
          return { allowed: false, reason: 'Deal creation temporarily disabled' };
        }
        break;
      case 'chat':
        if (!this.isChatEnabled()) {
          return { allowed: false, reason: 'Chat temporarily unavailable' };
        }
        break;
      case 'calls':
        if (!this.isCallsEnabled()) {
          return { allowed: false, reason: 'Calls temporarily unavailable' };
        }
        break;
      case 'observability':
        if (!this.flags.observability) {
          return { allowed: false, reason: 'Observability disabled' };
        }
        break;
    }

    return { allowed: true };
  }
}