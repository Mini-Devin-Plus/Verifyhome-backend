// Call System Data Models

export interface CallSession {
  id: string;
  type: '1v1_audio' | '1v1_video' | 'group_video';
  initiatorUserId: string;
  initiatorRole: 'seller' | 'agent' | 'landlord'; // Subscription users only
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  
  // Linking
  chatRoomId?: string;
  propertyId?: string;
  dealId?: string;
  
  // Scheduling
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // seconds
  
  // Media provider
  provider: '100ms' | 'agora';
  providerRoomId?: string;
  providerToken?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface CallParticipant {
  id: string;
  callSessionId: string;
  userId: string;
  userRole: 'buyer' | 'tenant' | 'seller' | 'agent' | 'landlord' | 'admin';
  
  // Participation
  joinedAt?: Date;
  leftAt?: Date;
  isActive: boolean;
  
  // Media state
  audioEnabled: boolean;
  videoEnabled: boolean;
  
  // Provider specific
  providerParticipantId?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CallAuditLog {
  id: string;
  callSessionId: string;
  actorUserId: string;
  actorRole: string;
  actionType: 'initiated' | 'scheduled' | 'joined' | 'left' | 'ended' | 'cancelled' | 'audio_toggled' | 'video_toggled';
  timestamp: Date;
  
  // OTP verification for sensitive actions
  otpSessionId?: string;
  
  // Additional context
  metadata?: Record<string, any>;
}

export interface CallPermissions {
  canInitiate: boolean;
  canJoin: boolean;
  canSchedule: boolean;
  requiresSubscription: boolean;
  reason?: string;
}

// Call-related types
export interface CallSessionWithParticipants extends CallSession {
  participants: CallParticipant[];
  activeParticipants: CallParticipant[];
}

export interface CallInvitation {
  id: string;
  callSessionId: string;
  invitedUserId: string;
  invitedByUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  sentAt: Date;
  respondedAt?: Date;
}