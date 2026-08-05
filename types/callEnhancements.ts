// Enhanced call features (foundation only - disabled by default)

export type CallScheduleStatus = 'scheduled' | 'starting_soon' | 'live' | 'expired' | 'cancelled';

export interface CallScheduleReminder {
  id: string;
  scheduleId: string;
  type: 'T-15min' | 'T-5min' | 'start_time';
  scheduledFor: Date;
  sent: boolean;
  sentAt?: Date;
}

export interface CallPresentationMode {
  enabled: boolean;
  presenterId?: string;
  presenterRole?: string;
  linkedDocuments?: {
    type: 'floor_plan' | 'inspection_pdf' | 'images';
    metadata: Record<string, any>;
  }[];
  startedAt?: Date;
  endedAt?: Date;
}

export interface CallRecordingMetadata {
  requested: boolean;
  requestedBy?: string;
  requestedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  reason?: string;
  sessionMetadata?: {
    startTime?: Date;
    stopTime?: Date;
    participants: string[];
    duration?: number;
  };
}

export interface CallModerationFlagEnhanced {
  id: string;
  callSessionId: string;
  reportedBy: string;
  category: 'harassment' | 'fraud_attempt' | 'off_platform_pressure' | 'impersonation' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'pending' | 'reviewed' | 'escalated' | 'resolved';
  autoEscalated: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface CallFeatureFlags {
  screenSharingEnabled: boolean;
  presentationModeEnabled: boolean;
  recordingMetadataEnabled: boolean;
  enhancedModerationEnabled: boolean;
  schedulingRemindersEnabled: boolean;
}

// Default feature flags (all disabled for MVP safety)
export const DEFAULT_CALL_FEATURES: CallFeatureFlags = {
  screenSharingEnabled: false,
  presentationModeEnabled: false,
  recordingMetadataEnabled: false,
  enhancedModerationEnabled: false,
  schedulingRemindersEnabled: false,
};