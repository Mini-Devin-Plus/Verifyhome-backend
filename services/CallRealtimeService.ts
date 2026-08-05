import { CallSession, CallParticipant } from '../types/call';

export interface CallRealtimeCallbacks {
  onCallInvitation?: (callSession: CallSession) => void;
  onCallStarted?: (callSession: CallSession) => void;
  onCallEnded?: (callSession: CallSession) => void;
  onParticipantJoined?: (participant: CallParticipant) => void;
  onParticipantLeft?: (participant: CallParticipant) => void;
  onMediaToggled?: (participant: CallParticipant, mediaType: 'audio' | 'video', enabled: boolean) => void;
  onError?: (error: Error) => void;
}

export interface CallRealtimeSubscription {
  unsubscribe: () => void;
}

export class CallRealtimeService {
  private static subscriptions = new Map<string, CallRealtimeSubscription>();

  // Subscribe to call updates for a specific user
  static subscribeToUserCalls(
    userId: string,
    callbacks: CallRealtimeCallbacks
  ): string {
    const subscriptionId = `user_calls_${userId}_${Date.now()}`;

    // Define Appwrite channels for call updates
    const channels = [
      `databases.default.collections.callSessions.documents`,
      `databases.default.collections.callParticipants.documents`
    ];

    const mockSubscription = this.createMockUserCallsSubscription(
      channels,
      userId,
      callbacks
    );

    this.subscriptions.set(subscriptionId, mockSubscription);

    console.log(`[CALL REALTIME] Subscribed to calls for user ${userId}`);
    
    return subscriptionId;
  }

  // Subscribe to specific call session updates
  static subscribeToCallSession(
    callSessionId: string,
    userId: string,
    callbacks: CallRealtimeCallbacks
  ): string {
    const subscriptionId = `call_session_${callSessionId}_${userId}_${Date.now()}`;

    // Define channels for this specific call
    const channels = [
      `databases.default.collections.callSessions.documents.${callSessionId}`,
      `databases.default.collections.callParticipants.documents`
    ];

    const mockSubscription = this.createMockCallSessionSubscription(
      channels,
      callSessionId,
      callbacks
    );

    this.subscriptions.set(subscriptionId, mockSubscription);

    console.log(`[CALL REALTIME] Subscribed to call session ${callSessionId} for user ${userId}`);
    
    return subscriptionId;
  }

  // Subscribe to call invitations for a user
  static subscribeToCallInvitations(
    userId: string,
    onInvitation: (callSession: CallSession) => void
  ): string {
    const subscriptionId = `call_invitations_${userId}_${Date.now()}`;

    // Mock subscription for call invitations
    const mockSubscription = this.createMockInvitationSubscription(
      userId,
      onInvitation
    );

    this.subscriptions.set(subscriptionId, mockSubscription);

    console.log(`[CALL REALTIME] Subscribed to call invitations for user ${userId}`);
    
    return subscriptionId;
  }

  // Unsubscribe from realtime updates
  static unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subscriptionId);
      console.log(`[CALL REALTIME] Unsubscribed ${subscriptionId}`);
    }
  }

  // Unsubscribe all for cleanup
  static unsubscribeAll(): void {
    this.subscriptions.forEach((subscription, id) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();
    console.log(`[CALL REALTIME] Unsubscribed all call subscriptions`);
  }

  // Simulate call invitation (for testing)
  static simulateCallInvitation(
    targetUserId: string,
    callSession: CallSession
  ): void {
    // In real implementation, this would trigger Appwrite realtime event
    console.log(`[CALL REALTIME] Simulating call invitation to ${targetUserId}`);
    
    // Find subscriptions for this user
    this.subscriptions.forEach((subscription, id) => {
      if (id.includes(`user_calls_${targetUserId}`) || id.includes(`call_invitations_${targetUserId}`)) {
        // Trigger callback (mock)
        setTimeout(() => {
          console.log(`[CALL REALTIME] Triggering invitation callback for ${targetUserId}`);
        }, 100);
      }
    });
  }

  // Private mock subscription methods
  private static createMockUserCallsSubscription(
    channels: string[],
    userId: string,
    callbacks: CallRealtimeCallbacks
  ): CallRealtimeSubscription {
    // Mock implementation - would use real Appwrite client
    const mockInterval = setInterval(() => {
      // Simulate occasional call updates for testing
      if (Math.random() > 0.98) {
        console.log(`[CALL REALTIME] Mock call update for user ${userId}`);
      }
    }, 5000);

    return {
      unsubscribe: () => {
        clearInterval(mockInterval);
        console.log(`[CALL REALTIME] Mock user calls subscription unsubscribed for ${userId}`);
      }
    };
  }

  private static createMockCallSessionSubscription(
    channels: string[],
    callSessionId: string,
    callbacks: CallRealtimeCallbacks
  ): CallRealtimeSubscription {
    // Mock implementation
    const mockInterval = setInterval(() => {
      // Simulate call session updates
      if (Math.random() > 0.95) {
        console.log(`[CALL REALTIME] Mock call session update for ${callSessionId}`);
        
        // Simulate participant events
        if (callbacks.onParticipantJoined && Math.random() > 0.7) {
          const mockParticipant: CallParticipant = {
            id: `mock_participant_${Date.now()}`,
            callSessionId,
            userId: `mock_user_${Date.now()}`,
            userRole: 'buyer',
            isActive: true,
            audioEnabled: true,
            videoEnabled: true,
            joinedAt: new Date()
          };
          callbacks.onParticipantJoined(mockParticipant);
        }
      }
    }, 3000);

    return {
      unsubscribe: () => {
        clearInterval(mockInterval);
        console.log(`[CALL REALTIME] Mock call session subscription unsubscribed for ${callSessionId}`);
      }
    };
  }

  private static createMockInvitationSubscription(
    userId: string,
    onInvitation: (callSession: CallSession) => void
  ): CallRealtimeSubscription {
    // Mock implementation
    const mockInterval = setInterval(() => {
      // Simulate call invitations
      if (Math.random() > 0.99) {
        console.log(`[CALL REALTIME] Mock call invitation for ${userId}`);
        
        const mockCallSession: CallSession = {
          id: `mock_call_${Date.now()}`,
          type: '1v1_video',
          initiatorUserId: 'mock_initiator',
          initiatorRole: 'agent',
          status: 'active',
          provider: '100ms',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        onInvitation(mockCallSession);
      }
    }, 10000);

    return {
      unsubscribe: () => {
        clearInterval(mockInterval);
        console.log(`[CALL REALTIME] Mock invitation subscription unsubscribed for ${userId}`);
      }
    };
  }

  // Get active subscription count (for debugging)
  static getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  // Check if subscription exists
  static hasSubscription(subscriptionId: string): boolean {
    return this.subscriptions.has(subscriptionId);
  }

  // Broadcast call event to all subscribers (mock)
  static broadcastCallEvent(
    callSessionId: string,
    eventType: 'started' | 'ended' | 'participant_joined' | 'participant_left',
    data: any
  ): void {
    console.log(`[CALL REALTIME] Broadcasting ${eventType} for call ${callSessionId}`, data);
    
    // In real implementation, this would trigger Appwrite realtime events
    // that would be received by all subscribers to the call session
  }
}