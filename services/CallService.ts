import { CallSession, CallParticipant, CallAuditLog, CallPermissions, CallSessionWithParticipants } from '../types/call';
import { User } from '../types/database';
import { CallSchedule, CallModerationFlag } from '../types/admin';
import { CallAuditService } from './CallAuditService';
import { CallEnhancementService } from './CallEnhancementService';
import { FeatureFlagService } from './FeatureFlagService';
import { EnhancedOTPService } from './EnhancedOTPService';
import { PaymentSecurityService } from './PaymentSecurityService';
import { AdminSecurityService } from './AdminSecurityService';
import { FraudDetectionService } from './FraudDetectionService';
import { RTCService } from './rtc/RTCService';
import { RTCProvider, RTCParticipant } from './rtc/RTCProvider';

// Mock 100ms client (replaced with Daily.co RTC provider)
export class CallService {
  private static callSessions: CallSession[] = [];
  private static callParticipants: CallParticipant[] = [];
  private static callAuditLogs: CallAuditLog[] = [];
  private static rtcProvider: RTCProvider | null = null;

  // Initialize RTC provider with security hardening
  static async initialize(): Promise<void> {
    await RTCService.initialize();
    this.rtcProvider = RTCService.getProvider();
    
    // Initialize feature flags and security services
    FeatureFlagService.initialize('prod');
    
    // Start security cleanup tasks
    setInterval(() => {
      EnhancedOTPService.cleanupExpiredSessions();
      AdminSecurityService.cleanupExpiredSessions();
      PaymentSecurityService.checkProviderHealth();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  // Check call permissions based on user role and subscription
  static getCallPermissions(userRole: string, hasActiveSubscription: boolean): CallPermissions {
    const subscriptionRoles = ['seller', 'agent', 'landlord'];
    const isSubscriptionUser = subscriptionRoles.includes(userRole.toLowerCase());

    if (isSubscriptionUser && hasActiveSubscription) {
      return {
        canInitiate: true,
        canJoin: true,
        canSchedule: true,
        requiresSubscription: true
      };
    }

    if (isSubscriptionUser && !hasActiveSubscription) {
      return {
        canInitiate: false,
        canJoin: true,
        canSchedule: false,
        requiresSubscription: true,
        reason: 'Active subscription required to initiate calls'
      };
    }

    // Buyer, Tenant roles
    return {
      canInitiate: false,
      canJoin: true,
      canSchedule: false,
      requiresSubscription: false,
      reason: 'Only subscription users can initiate calls'
    };
  }

  // Initiate call (subscription users only)
  static async initiateCall(
    initiatorUserId: string,
    initiatorRole: string,
    callType: CallSession['type'],
    participantUserIds: string[],
    options?: {
      chatRoomId?: string;
      propertyId?: string;
      dealId?: string;
      scheduledAt?: Date;
    }
  ): Promise<{ success: boolean; callSession?: CallSession; error?: string }> {
    try {
      // Check feature flags and kill switches
      const featureCheck = FeatureFlagService.validateFeatureAccess('calls');
      if (!featureCheck.allowed) {
        return { success: false, error: featureCheck.reason };
      }

      // Fraud detection for call initiation
      const fraudCheck = await FraudDetectionService.analyzeActivity(
        initiatorUserId,
        'communication',
        {
          activityType: 'call_initiation',
          callType,
          participantCount: participantUserIds.length,
          propertyId: options?.propertyId,
          dealId: options?.dealId
        }
      );

      if (fraudCheck.blocked) {
        return { success: false, error: 'Call blocked due to security concerns' };
      }

      // Initialize RTC if needed
      if (!this.rtcProvider) {
        await this.initialize();
      }

      // Verify permissions
      const permissions = this.getCallPermissions(initiatorRole, true);
      if (!permissions.canInitiate) {
        return { success: false, error: permissions.reason || 'Cannot initiate calls' };
      }

      // Create call session
      const callSession: CallSession = {
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: callType,
        initiatorUserId,
        initiatorRole: initiatorRole as any,
        status: options?.scheduledAt ? 'scheduled' : 'active',
        chatRoomId: options?.chatRoomId,
        propertyId: options?.propertyId,
        dealId: options?.dealId,
        scheduledAt: options?.scheduledAt,
        startedAt: options?.scheduledAt ? undefined : new Date(),
        provider: 'daily',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create RTC room
      const rtcRoom = await this.rtcProvider!.createRoom(
        callSession.id,
        initiatorUserId,
        {
          propertyId: options?.propertyId,
          dealId: options?.dealId,
          audioOnly: !callType.includes('video')
        }
      );

      callSession.providerRoomId = rtcRoom.roomName;
      callSession.providerToken = rtcRoom.url;

      this.callSessions.push(callSession);

      // Add initiator as participant
      await this.addParticipant(callSession.id, initiatorUserId, initiatorRole, true);

      // Add other participants
      for (const userId of participantUserIds) {
        await this.addParticipant(callSession.id, userId, 'buyer', false);
      }

      // Log initiation
      await this.logCallEvent(callSession.id, initiatorUserId, initiatorRole, 'initiated', {
        callType,
        participantCount: participantUserIds.length + 1
      });

      return { success: true, callSession };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to initiate call' 
      };
    }
  }

  // Join call
  static async joinCall(
    callSessionId: string,
    userId: string,
    userRole: string
  ): Promise<{ success: boolean; authToken?: string; error?: string }> {
    try {
      // Initialize RTC if needed
      if (!this.rtcProvider) {
        await this.initialize();
      }

      const callSession = this.callSessions.find(c => c.id === callSessionId);
      if (!callSession) {
        return { success: false, error: 'Call session not found' };
      }

      if (callSession.status !== 'active') {
        return { success: false, error: 'Call is not active' };
      }

      // Check if user is already a participant
      let participant = this.callParticipants.find(p => 
        p.callSessionId === callSessionId && p.userId === userId
      );

      if (!participant) {
        // Add as new participant
        await this.addParticipant(callSessionId, userId, userRole, false);
        participant = this.callParticipants.find(p => 
          p.callSessionId === callSessionId && p.userId === userId
        );
      }

      if (!participant) {
        return { success: false, error: 'Failed to add participant' };
      }

      // Join RTC room
      const joinResult = await this.rtcProvider!.joinRoom(
        callSession.providerRoomId!,
        userId,
        {
          onParticipantJoined: (rtcParticipant: RTCParticipant) => {
            console.log('RTC participant joined:', rtcParticipant);
          },
          onParticipantLeft: (rtcParticipant: RTCParticipant) => {
            console.log('RTC participant left:', rtcParticipant);
          },
          onCallEnded: () => {
            console.log('RTC call ended');
          },
          onError: (error: Error) => {
            console.error('RTC error:', error);
          }
        }
      );

      // Update participant status
      participant.joinedAt = new Date();
      participant.isActive = true;

      // Log join event
      await this.logCallEvent(callSessionId, userId, userRole, 'joined');

      return { success: true, authToken: joinResult.roomUrl };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to join call' 
      };
    }
  }

  // Leave call
  static async leaveCall(callSessionId: string, userId: string, userRole: string): Promise<{ success: boolean; error?: string }> {
    try {
      const participant = this.callParticipants.find(p => 
        p.callSessionId === callSessionId && p.userId === userId
      );

      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      // Leave RTC room
      if (this.rtcProvider) {
        await this.rtcProvider.leaveRoom();
      }

      // Update participant status
      participant.leftAt = new Date();
      participant.isActive = false;

      // Log leave event
      await this.logCallEvent(callSessionId, userId, userRole, 'left');

      // Check if call should end (no active participants)
      const activeParticipants = this.callParticipants.filter(p => 
        p.callSessionId === callSessionId && p.isActive
      );

      if (activeParticipants.length === 0) {
        await this.endCall(callSessionId, userId, userRole);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to leave call' 
      };
    }
  }

  // End call
  static async endCall(callSessionId: string, endedByUserId: string, userRole: string): Promise<{ success: boolean; error?: string }> {
    try {
      const callSession = this.callSessions.find(c => c.id === callSessionId);
      if (!callSession) {
        return { success: false, error: 'Call session not found' };
      }

      // End RTC room
      if (this.rtcProvider && callSession.providerRoomId) {
        await this.rtcProvider.endRoom(callSession.providerRoomId);
      }

      // Update call session
      callSession.status = 'ended';
      callSession.endedAt = new Date();
      callSession.duration = callSession.startedAt ? 
        Math.floor((new Date().getTime() - callSession.startedAt.getTime()) / 1000) : 0;

      // Mark all participants as inactive
      this.callParticipants
        .filter(p => p.callSessionId === callSessionId && p.isActive)
        .forEach(p => {
          p.leftAt = new Date();
          p.isActive = false;
        });

      // Log end event
      await this.logCallEvent(callSessionId, endedByUserId, userRole, 'ended', {
        duration: callSession.duration
      });

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to end call' 
      };
    }
  }

  // Toggle audio/video
  static async toggleMedia(
    callSessionId: string,
    userId: string,
    userRole: string,
    mediaType: 'audio' | 'video',
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const participant = this.callParticipants.find(p => 
        p.callSessionId === callSessionId && p.userId === userId
      );

      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      // Toggle media via RTC provider
      if (this.rtcProvider) {
        if (mediaType === 'audio') {
          await this.rtcProvider.toggleAudio(enabled);
          participant.audioEnabled = enabled;
        } else {
          await this.rtcProvider.toggleVideo(enabled);
          participant.videoEnabled = enabled;
        }
      }

      // Log media toggle
      await this.logCallEvent(callSessionId, userId, userRole, `${mediaType}_toggled` as any, {
        mediaType,
        enabled
      });

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to toggle media' 
      };
    }
  }

  // Get call session with participants
  static async getCallSession(callSessionId: string): Promise<CallSessionWithParticipants | null> {
    const callSession = this.callSessions.find(c => c.id === callSessionId);
    if (!callSession) return null;

    const participants = this.callParticipants.filter(p => p.callSessionId === callSessionId);
    const activeParticipants = participants.filter(p => p.isActive);

    return {
      ...callSession,
      participants,
      activeParticipants
    };
  }

  // Flag call for moderation
  static async flagCall(
    callSessionId: string,
    reportedBy: string,
    reason: 'abuse' | 'inappropriate' | 'dispute' | 'other',
    description: string
  ): Promise<{ success: boolean; flagId?: string; error?: string }> {
    try {
      const flag = await CallAuditService.flagCall(callSessionId, reportedBy, reason, description);
      return { success: true, flagId: flag.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to flag call' 
      };
    }
  }

  // Schedule call (subscription users only) - enhanced version
  static async scheduleCall(
    scheduledBy: string,
    scheduledFor: Date,
    participants: string[],
    title: string,
    propertyId?: string,
    dealId?: string,
    notifyAdmin: boolean = false,
    enableReminders: boolean = false
  ): Promise<{ success: boolean; schedule?: CallSchedule; error?: string }> {
    try {
      const baseSchedule = await CallAuditService.scheduleCall(
        scheduledBy,
        scheduledFor,
        participants,
        title,
        propertyId,
        dealId,
        notifyAdmin
      );
      
      // Add enhanced scheduling features if enabled
      const enhancedResult = await CallEnhancementService.scheduleCallWithReminders(
        baseSchedule,
        enableReminders
      );
      
      return { success: true, schedule: enhancedResult.schedule };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to schedule call' 
      };
    }
  }

  // Get user's active calls
  static async getUserActiveCalls(userId: string): Promise<CallSessionWithParticipants[]> {
    const userParticipations = this.callParticipants.filter(p => 
      p.userId === userId && p.isActive
    );

    const activeCalls: CallSessionWithParticipants[] = [];
    
    for (const participation of userParticipations) {
      const callSession = await this.getCallSession(participation.callSessionId);
      if (callSession && callSession.status === 'active') {
        activeCalls.push(callSession);
      }
    }

    return activeCalls;
  }
  private static async addParticipant(
    callSessionId: string,
    userId: string,
    userRole: string,
    isInitiator: boolean
  ): Promise<void> {
    const participant: CallParticipant = {
      id: `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callSessionId,
      userId,
      userRole: userRole as any,
      isActive: isInitiator,
      audioEnabled: true,
      videoEnabled: true,
      joinedAt: isInitiator ? new Date() : undefined
    };

    this.callParticipants.push(participant);
  }

  private static async logCallEvent(
    callSessionId: string,
    actorUserId: string,
    actorRole: string,
    actionType: CallAuditLog['actionType'],
    metadata?: Record<string, any>
  ): Promise<void> {
    const auditLog: CallAuditLog = {
      id: `call_audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callSessionId,
      actorUserId,
      actorRole,
      actionType,
      timestamp: new Date(),
      metadata
    };

    this.callAuditLogs.push(auditLog);
    console.log(`[CALL AUDIT] ${actionType} by ${actorUserId} in call ${callSessionId}`);
  }
}