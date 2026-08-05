import { 
  CallScheduleStatus, 
  CallScheduleReminder, 
  CallPresentationMode, 
  CallRecordingMetadata,
  CallModerationFlagEnhanced,
  CallFeatureFlags,
  DEFAULT_CALL_FEATURES
} from '../types/callEnhancements';
import { CallSchedule } from '../types/admin';
import { OTPService } from './OTPService';

export class CallEnhancementService {
  private static featureFlags: CallFeatureFlags = DEFAULT_CALL_FEATURES;
  private static scheduleReminders: CallScheduleReminder[] = [];
  private static presentationModes: Map<string, CallPresentationMode> = new Map();
  private static recordingMetadata: Map<string, CallRecordingMetadata> = new Map();
  private static enhancedFlags: CallModerationFlagEnhanced[] = [];

  // Feature flag management
  static getFeatureFlags(): CallFeatureFlags {
    return { ...this.featureFlags };
  }

  static updateFeatureFlags(flags: Partial<CallFeatureFlags>): void {
    this.featureFlags = { ...this.featureFlags, ...flags };
    console.log('[CALL ENHANCEMENTS] Feature flags updated:', this.featureFlags);
  }

  // Enhanced scheduling with reminders (foundation only)
  static async scheduleCallWithReminders(
    scheduleData: CallSchedule,
    enableReminders: boolean = false
  ): Promise<{ schedule: CallSchedule; reminders: CallScheduleReminder[] }> {
    const reminders: CallScheduleReminder[] = [];

    if (enableReminders && this.featureFlags.schedulingRemindersEnabled) {
      const scheduledTime = scheduleData.scheduledFor;
      
      // T-15 minute reminder
      const reminder15 = {
        id: `reminder_15_${Date.now()}`,
        scheduleId: scheduleData.id,
        type: 'T-15min' as const,
        scheduledFor: new Date(scheduledTime.getTime() - 15 * 60 * 1000),
        sent: false
      };

      // T-5 minute reminder
      const reminder5 = {
        id: `reminder_5_${Date.now()}`,
        scheduleId: scheduleData.id,
        type: 'T-5min' as const,
        scheduledFor: new Date(scheduledTime.getTime() - 5 * 60 * 1000),
        sent: false
      };

      // Start time reminder
      const reminderStart = {
        id: `reminder_start_${Date.now()}`,
        scheduleId: scheduleData.id,
        type: 'start_time' as const,
        scheduledFor: scheduledTime,
        sent: false
      };

      reminders.push(reminder15, reminder5, reminderStart);
      this.scheduleReminders.push(...reminders);
    }

    return { schedule: scheduleData, reminders };
  }

  static getScheduleStatus(schedule: CallSchedule): CallScheduleStatus {
    const now = new Date();
    const scheduledTime = schedule.scheduledFor;
    const fiveMinutesBefore = new Date(scheduledTime.getTime() - 5 * 60 * 1000);

    if (schedule.status === 'cancelled') return 'cancelled';
    if (now < fiveMinutesBefore) return 'scheduled';
    if (now < scheduledTime) return 'starting_soon';
    if (now < new Date(scheduledTime.getTime() + 60 * 60 * 1000)) return 'live'; // 1 hour window
    return 'expired';
  }

  // Presentation mode (foundation only)
  static async enablePresentationMode(
    callSessionId: string,
    presenterId: string,
    presenterRole: string,
    otpCode: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.featureFlags.presentationModeEnabled) {
      return { success: false, error: 'Presentation mode not enabled' };
    }

    try {
      // Verify OTP for sensitive action
      const isValidOTP = await OTPService.verifyOTP(presenterId, otpCode);
      if (!isValidOTP) {
        return { success: false, error: 'Invalid OTP code' };
      }

      const presentationMode: CallPresentationMode = {
        enabled: true,
        presenterId,
        presenterRole,
        linkedDocuments: [],
        startedAt: new Date()
      };

      this.presentationModes.set(callSessionId, presentationMode);
      console.log('[CALL ENHANCEMENTS] Presentation mode enabled for call:', callSessionId);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to enable presentation mode' };
    }
  }

  static async disablePresentationMode(callSessionId: string): Promise<void> {
    const mode = this.presentationModes.get(callSessionId);
    if (mode) {
      mode.enabled = false;
      mode.endedAt = new Date();
      console.log('[CALL ENHANCEMENTS] Presentation mode disabled for call:', callSessionId);
    }
  }

  // Recording metadata (NO ACTUAL RECORDING)
  static async requestRecordingMetadata(
    callSessionId: string,
    requestedBy: string,
    reason: string,
    otpCode: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.featureFlags.recordingMetadataEnabled) {
      return { success: false, error: 'Recording metadata not enabled' };
    }

    try {
      // Verify OTP for sensitive action
      const isValidOTP = await OTPService.verifyOTP(requestedBy, otpCode);
      if (!isValidOTP) {
        return { success: false, error: 'Invalid OTP code' };
      }

      const metadata: CallRecordingMetadata = {
        requested: true,
        requestedBy,
        requestedAt: new Date(),
        reason
      };

      this.recordingMetadata.set(callSessionId, metadata);
      console.log('[CALL ENHANCEMENTS] Recording metadata requested for call:', callSessionId);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to request recording metadata' };
    }
  }

  // Enhanced moderation flags
  static async createEnhancedModerationFlag(
    callSessionId: string,
    reportedBy: string,
    category: CallModerationFlagEnhanced['category'],
    severity: CallModerationFlagEnhanced['severity'],
    description: string
  ): Promise<CallModerationFlagEnhanced> {
    const flag: CallModerationFlagEnhanced = {
      id: `enhanced_flag_${Date.now()}`,
      callSessionId,
      reportedBy,
      category,
      severity,
      description,
      status: 'pending',
      autoEscalated: severity === 'high',
      createdAt: new Date()
    };

    this.enhancedFlags.push(flag);
    console.log('[CALL ENHANCEMENTS] Enhanced moderation flag created:', flag.id);

    return flag;
  }

  static getEnhancedModerationStats(): {
    totalFlags: number;
    flagsByCategory: Record<string, number>;
    flagsBySeverity: Record<string, number>;
  } {
    const totalFlags = this.enhancedFlags.length;
    const flagsByCategory: Record<string, number> = {};
    const flagsBySeverity: Record<string, number> = {};

    this.enhancedFlags.forEach(flag => {
      flagsByCategory[flag.category] = (flagsByCategory[flag.category] || 0) + 1;
      flagsBySeverity[flag.severity] = (flagsBySeverity[flag.severity] || 0) + 1;
    });

    return { totalFlags, flagsByCategory, flagsBySeverity };
  }

  // Utility methods
  static getPresentationMode(callSessionId: string): CallPresentationMode | null {
    return this.presentationModes.get(callSessionId) || null;
  }

  static getRecordingMetadata(callSessionId: string): CallRecordingMetadata | null {
    return this.recordingMetadata.get(callSessionId) || null;
  }

  static getScheduleReminders(scheduleId: string): CallScheduleReminder[] {
    return this.scheduleReminders.filter(r => r.scheduleId === scheduleId);
  }

  static getEnhancedFlags(callSessionId?: string): CallModerationFlagEnhanced[] {
    if (callSessionId) {
      return this.enhancedFlags.filter(f => f.callSessionId === callSessionId);
    }
    return [...this.enhancedFlags];
  }
}