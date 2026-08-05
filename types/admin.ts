// Admin moderation and audit types
export interface CallAuditEntry {
  id: string;
  callSessionId: string;
  action: 'view' | 'terminate' | 'flag_review';
  adminUserId: string;
  otpSessionId?: string;
  timestamp: Date;
  metadata: {
    reason?: string;
    participantCount?: number;
    callDuration?: number;
  };
}

export interface ChatAuditEntry {
  id: string;
  chatRoomId: string;
  action: 'view' | 'moderate';
  adminUserId: string;
  otpSessionId?: string;
  timestamp: Date;
  metadata: {
    messageCount?: number;
    participantCount?: number;
    propertyId?: string;
    dealId?: string;
  };
}

export interface CallSchedule {
  id: string;
  scheduledBy: string; // subscription user only
  scheduledFor: Date;
  participants: string[];
  propertyId?: string;
  dealId?: string;
  title: string;
  notifyAdmin: boolean;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface CallModerationFlag {
  id: string;
  callSessionId: string;
  reportedBy: string;
  reason: 'abuse' | 'inappropriate' | 'dispute' | 'other';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface AdminNotification {
  id: string;
  type: 'call_started' | 'dispute_flagged' | 'scheduled_call' | 'moderation_flag';
  title: string;
  message: string;
  callSessionId?: string;
  chatRoomId?: string;
  flagId?: string;
  isRead: boolean;
  createdAt: Date;
}